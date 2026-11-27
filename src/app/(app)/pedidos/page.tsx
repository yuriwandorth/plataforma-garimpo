'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSession } from '@/lib/auth';
import { useCollection, useWriter } from '@/lib/db';
import { useChannels, useClients, useInfluencers, usePlans, useProducts } from '@/lib/hooks';
import { fmtBRL2, fmtDate, parseMoney, todayISO } from '@/lib/calc';
import {
  checkPayment, checkoutUrl, couponCode, DEFAULT_COUPON_PCT, DEFAULT_TERMS, isAbandoned, ORDER_STATUS, onlyDigits, saleFromOrder,
  type CheckoutLink, type Coupon, type Order,
} from '@/lib/checkout';
import { syncInfluencerCoupon } from '@/lib/couponSync';
import type { Client } from '@/lib/types';
import { PERIOD_LABEL } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, Stat, Tabs, Toggle } from '@/components/ui';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
type Tab = 'conferir' | 'abandonados' | 'concluidos' | 'links' | 'cupons';

const wa = (phone: string, text: string) => {
  const d = onlyDigits(phone);
  return d ? `https://wa.me/${d.length <= 11 ? '55' + d : d}?text=${encodeURIComponent(text)}` : null;
};
const when = (ms: number) => new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Recife', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function PedidosPage() {
  const { tenant, user } = useSession();
  const w = useWriter();
  const links = useCollection<CheckoutLink>('checkouts');
  const orders = useCollection<Order>('orders');
  const coupons = useCollection<Coupon>('coupons');
  const [editCoupon, setEditCoupon] = useState<Coupon | 'new' | null>(null);
  const clients = useClients();
  const [tab, setTab] = useState<Tab>('conferir');
  const [edit, setEdit] = useState<CheckoutLink | 'new' | null>(null);
  const [busy, setBusy] = useState('');
  const [confirmManual, setConfirmManual] = useState('');
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState('');
  const checked = useRef(new Set<string>());

  const linkById = useMemo(() => Object.fromEntries(links.data.map((l) => [l.id, l])), [links.data]);
  const sorted = useMemo(() => [...orders.data].sort((a, b) => b.createdAt - a.createdAt), [orders.data]);
  const toCheck = sorted.filter((o) => ['retornou', 'pago', 'nao_pago'].includes(o.status));
  const waiting = sorted.filter((o) => o.status === 'aguardando');
  const done = sorted.filter((o) => o.status === 'concluido' || o.status === 'cancelado');
  const last30 = sorted.filter((o) => Date.now() - o.createdAt < 30 * 864e5);
  const conv = last30.length ? last30.filter((o) => ['pago', 'concluido'].includes(o.status)).length / last30.length : null;

  async function verify(o: Order) {
    const l = linkById[o.checkoutId];
    if (!o.ret || !l) return;
    setBusy(o.id);
    try {
      const r = await checkPayment(l.handle, o.id, o.ret);
      await w.update<Order>('orders', o.id, { status: r.paid ? 'pago' : 'nao_pago', check: { ...r, at: Date.now() } }, `Pagamento ${r.paid ? 'confirmado' : 'não confirmado'} na InfinitePay: ${o.name}`);
    } catch (e) {
      console.error(e);
      setMsg('Não deu para falar com a InfinitePay agora. Tente de novo em instantes.');
    } finally { setBusy(''); }
  }

  // Confere sozinho os pedidos que voltaram do pagamento
  useEffect(() => {
    if (links.loading) return;
    orders.data.filter((o) => o.status === 'retornou' && o.ret && !checked.current.has(o.id)).forEach((o) => {
      checked.current.add(o.id);
      verify(o);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.data, links.loading]);

  async function markManual(o: Order) {
    await w.update<Order>('orders', o.id, { status: 'pago', check: { paid: true, manual: true, at: Date.now() } }, `Pagamento marcado manualmente: ${o.name}`);
    setConfirmManual('');
  }

  async function finish(o: Order) {
    setBusy(o.id); setMsg('');
    try {
      const today = todayISO();
      const found = clients.data.find((c) => !c.deleted && ((c.email && c.email.toLowerCase() === o.email) || (c.phone && onlyDigits(c.phone).endsWith(onlyDigits(o.phone).slice(-9)))));
      const l = linkById[o.checkoutId];
      const client: Client | undefined = found;
      let clientId = found?.id;
      if (!clientId) {
        clientId = await w.create<Partial<Client>>('clients', {
          name: o.name, email: o.email, phone: o.phone, cpf: o.cpf, status: 'ativo',
          channelId: l?.channelId, influencerId: l?.influencerId, notes: `Veio pelo checkout (${o.title}).`,
        }, `Cliente criada pelo checkout: ${o.name}`);
      }
      const sale = saleFromOrder(o, l, {
        id: clientId, name: client?.name ?? o.name, planName: client?.planName, endDate: client?.endDate,
        isTest: client?.isTest, hasHistory: !!client?.planId,
      }, today, user!.uid, o.couponCode ? coupons.data.find((c) => c.id === o.couponCode)?.influencerId : undefined);
      const saleId = await w.create('sales', sale, `Venda do checkout: ${o.name} · ${o.planName} · ${fmtBRL2(o.price)}`);
      if (!client?.endDate || sale.endDate >= client.endDate) {
        await w.update<Client>('clients', clientId, {
          planId: sale.planId, planName: sale.planName, startDate: sale.startDate, endDate: sale.endDate, lastValue: sale.gross,
          period: sale.period, status: 'ativo', phone: client?.phone || o.phone, cpf: client?.cpf || o.cpf, recall: undefined,
        }, `Plano atualizado pelo checkout: ${sale.planName}`);
      }
      await w.update<Order>('orders', o.id, { status: 'concluido', clientId, saleId }, `Pedido concluído: ${o.name}`);
      setMsg(`${o.name.split(' ')[0]} entrou como aluna (${sale.kind === 'renovacao' ? 'renovação' : 'venda nova'}). Agora é com você: mensagem de boas-vindas e anamnese.`);
    } catch (e) {
      console.error(e);
      setMsg('Não foi possível concluir. Tente de novo.');
    } finally { setBusy(''); }
  }

  async function copy(l: CheckoutLink) {
    await navigator.clipboard.writeText(checkoutUrl(window.location.origin, BASE, tenant!.id, l.id));
    setCopied(l.id); setTimeout(() => setCopied(''), 1500);
  }

  const missingHandle = !tenant?.infinitePayHandle && links.data.length === 0;

  return (
    <div>
      <PageHeader title="Checkout e pedidos" subtitle="Links de pagamento da InfinitePay, pedidos das alunas e confirmação da venda."
        actions={<Button onClick={() => setEdit('new')}>Novo link de pagamento</Button>} />
      <ErrorNote error={orders.error || links.error} />
      {missingHandle && <div className="mb-4 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">Antes do primeiro link, coloque sua InfiniteTag em Configurações (ou direto no formulário do link). No painel da InfinitePay, ligue também <b>Configurações do Checkout → Habilitar checkout integrado</b>.</div>}
      {msg && <div className="mb-4 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">{msg}</div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Para conferir" value={toCheck.length} sub="voltaram do pagamento" />
        <Stat label="Não pagaram" value={waiting.filter((o) => isAbandoned(o)).length} sub="abriram e não concluíram (+30 min)" tone={waiting.length ? 'bad' : undefined} />
        <Stat label="Conversão 30 dias" value={conv === null ? '—' : `${Math.round(conv * 100)}%`} sub="pagos ÷ pedidos abertos" />
        <Stat label="Links ativos" value={links.data.filter((l) => l.active).length} />
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { id: 'conferir', label: `Para conferir (${toCheck.length})` },
        { id: 'abandonados', label: `Não pagaram (${waiting.length})` },
        { id: 'concluidos', label: `Concluídos (${done.length})` },
        { id: 'links', label: `Links (${links.data.length})` },
        { id: 'cupons', label: `Cupons (${coupons.data.filter((c) => c.active).length})` },
      ]} />

      {orders.loading || links.loading ? <Spinner /> : tab === 'cupons' ? (
        <CouponsTab coupons={coupons.data} onEdit={setEditCoupon} />
      ) : tab === 'links' ? (
        links.data.length === 0 ? <Empty title="Nenhum link de pagamento" text="Crie um link por plano. A aluna abre, preenche, aceita os termos e paga por Pix ou cartão na InfinitePay." action={<Button onClick={() => setEdit('new')}>Criar o primeiro</Button>} /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {[...links.data].sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title)).map((l) => (
              <Card key={l.id} title={<span className="flex items-center gap-2">{l.title}{!l.active && <Badge>Desativado</Badge>}</span>}
                action={<Button size="sm" variant="ghost" onClick={() => setEdit(l)}>Editar</Button>}>
                <div className="text-2xl font-semibold">{fmtBRL2(l.price)}</div>
                <div className="text-xs text-mute">{l.planName} · {PERIOD_LABEL[l.period]} · ${l.handle}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!l.active} onClick={() => copy(l)}>{copied === l.id ? 'Link copiado' : 'Copiar link'}</Button>
                  <a className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-xs hover:border-gold/60" href={checkoutUrl('', BASE, tenant!.id, l.id)} target="_blank" rel="noreferrer">Abrir página</a>
                </div>
                <p className="mt-2 text-xs text-mute">Para o cupom já vir aplicado, acrescente <code>&cupom=CODIGO</code> no fim do link. Para marcar a origem sem desconto, use <code>&ref=nome</code>.</p>
              </Card>
            ))}
          </div>
        )
      ) : (
        (() => {
          const list = tab === 'conferir' ? toCheck : tab === 'abandonados' ? waiting : done;
          if (!list.length) return <Empty title={tab === 'conferir' ? 'Nada para conferir' : tab === 'abandonados' ? 'Ninguém parado no pagamento' : 'Nenhum pedido concluído ainda'}
            text={tab === 'conferir' ? 'Quando a aluna paga e volta para a página de obrigado, o pedido aparece aqui e a plataforma confere na InfinitePay sozinha.' : tab === 'abandonados' ? 'Quem preenche os dados e não paga aparece aqui, para você chamar no WhatsApp.' : undefined} />;
          return (
            <div className="card overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-line"><th className="th">Pedido</th><th className="th">Aluna</th><th className="th">Plano</th><th className="th">Situação</th><th className="th" /></tr></thead>
                <tbody>
                  {list.map((o) => {
                    const st = ORDER_STATUS[o.status];
                    const first = o.name.split(' ')[0];
                    const recall = wa(o.phone, `Oi, ${first}! Vi que você começou a inscrição no ${o.title} e não finalizou. Ficou alguma dúvida? Tô aqui pra te ajudar.`);
                    const welcome = wa(o.phone, `Oi, ${first}! Seu pagamento do ${o.title} foi confirmado. Seja muito bem-vinda ao Garimpo! Vou te mandar agora o próximo passo.`);
                    return (
                      <tr key={o.id} className="border-b border-line/60 align-top">
                        <td className="td text-xs text-mute">{when(o.createdAt)}{o.ref && <div>ref: {o.ref}</div>}</td>
                        <td className="td"><div className="font-medium">{o.name}</div><div className="text-xs text-mute">{o.email} · {o.phone}</div></td>
                        <td className="td">{o.planName}<div className="text-xs text-mute">{o.couponCode && <span className="text-good">cupom {o.couponCode} (-{o.discountPct}%) · </span>}{fmtBRL2(o.price)}{o.check?.paidAmount ? ` · aluna pagou ${fmtBRL2(o.check.paidAmount / 100)}` : ''}{o.check?.installments ? ` · ${o.check.installments}x` : ''}{o.check?.method ? ` · ${o.check.method === 'pix' ? 'Pix' : 'cartão'}` : ''}</div></td>
                        <td className="td"><Badge tone={st.tone}>{busy === o.id ? 'Conferindo…' : st.label}</Badge>
                          {o.check?.manual && <div className="text-xs text-mute">marcado manualmente</div>}
                          {o.ret?.receipt_url && <div><a className="text-xs text-gold hover:underline" href={o.ret.receipt_url} target="_blank" rel="noreferrer">comprovante</a></div>}</td>
                        <td className="td">
                          <div className="flex flex-wrap justify-end gap-2">
                            {o.status === 'pago' && <Button size="sm" disabled={!!busy} onClick={() => finish(o)}>Confirmar e criar aluna</Button>}
                            {(o.status === 'retornou' || o.status === 'nao_pago') && o.ret && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => verify(o)}>Conferir de novo</Button>}
                            {(o.status === 'aguardando' || o.status === 'nao_pago') && (confirmManual === o.id
                              ? <><Button size="sm" onClick={() => markManual(o)}>Sim, recebi</Button><Button size="sm" variant="ghost" onClick={() => setConfirmManual('')}>Não</Button></>
                              : <Button size="sm" variant="ghost" onClick={() => setConfirmManual(o.id)}>Recebi por fora</Button>)}
                            {o.status === 'aguardando' && recall && <a className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-xs hover:border-gold/60" href={recall} target="_blank" rel="noreferrer">Chamar no WhatsApp</a>}
                            {o.status === 'concluido' && welcome && <a className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-xs hover:border-gold/60" href={welcome} target="_blank" rel="noreferrer">Boas-vindas no WhatsApp</a>}
                            {['aguardando', 'nao_pago'].includes(o.status) && <Button size="sm" variant="ghost" onClick={() => w.update<Order>('orders', o.id, { status: 'cancelado' }, `Pedido cancelado: ${o.name}`)}>Cancelar</Button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()
      )}

      {edit && <LinkModal link={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {editCoupon && <CouponModal coupon={editCoupon === 'new' ? undefined : editCoupon} existing={coupons.data} onClose={() => setEditCoupon(null)} />}
    </div>
  );
}

function LinkModal({ link, onClose }: { link?: CheckoutLink; onClose: () => void }) {
  const { tenant, profile } = useSession();
  const w = useWriter();
  const plans = usePlans();
  const products = useProducts();
  const channels = useChannels();
  const influencers = useInfluencers();
  const [planId, setPlanId] = useState(link?.planId ?? '');
  const [title, setTitle] = useState(link?.title ?? '');
  const [description, setDescription] = useState(link?.description ?? '');
  const [price, setPrice] = useState(link ? String(link.price).replace('.', ',') : '');
  const [handle, setHandle] = useState(link?.handle ?? tenant?.infinitePayHandle ?? '');
  const [whatsapp, setWhatsapp] = useState(link?.whatsapp ?? tenant?.whatsapp ?? '');
  const [channelId, setChannelId] = useState(link?.channelId ?? '');
  const [influencerId, setInfluencerId] = useState(link?.influencerId ?? '');
  const [terms, setTerms] = useState(link?.terms ?? DEFAULT_TERMS);
  const [active, setActive] = useState(link?.active ?? true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const plan = plans.byId[planId];
  function pickPlan(id: string) {
    setPlanId(id);
    const p = plans.byId[id];
    if (!p) return;
    if (!link) {
      const prod = products.byId[p.productId];
      setTitle(prod ? `${prod.name} · ${p.name}` : p.name);
      setPrice(String(p.price).replace('.', ','));
    }
  }

  async function save() {
    setErr('');
    if (!plan) return setErr('Escolha o plano.');
    const value = parseMoney(price);
    if (value < 1) return setErr('O valor mínimo na InfinitePay é R$ 1,00.');
    const h = handle.replace(/^\$/, '').trim();
    if (!h || /\s/.test(h)) return setErr('Informe sua InfiniteTag (sem o $ e sem espaços).');
    if (!title.trim()) return setErr('Dê um título ao link.');
    if (terms.trim().length < 50) return setErr('Os termos estão curtos demais.');
    setBusy(true);
    try {
      const data: Omit<CheckoutLink, 'id' | 'createdAt' | 'updatedAt'> = {
        title: title.trim(), description: description.trim() || undefined, brand: tenant?.name ?? '',
        planId: plan.id, planName: plan.name, productId: plan.productId, period: plan.period, price: value,
        handle: h, terms: terms.trim(), channelId: channelId || undefined, influencerId: influencerId || undefined,
        whatsapp: onlyDigits(whatsapp) || undefined, active,
      };
      if (link) await w.update<CheckoutLink>('checkouts', link.id, data, `Link de pagamento editado: ${data.title}`);
      else await w.create('checkouts', data, `Link de pagamento criado: ${data.title}`);
      if (profile?.role === 'owner' && tenant && (tenant.infinitePayHandle !== h || (onlyDigits(whatsapp) && tenant.whatsapp !== onlyDigits(whatsapp)))) {
        await updateDoc(doc(db, 'tenants', tenant.id), { infinitePayHandle: h, ...(onlyDigits(whatsapp) ? { whatsapp: onlyDigits(whatsapp) } : {}) }).catch(() => {});
      }
      onClose();
    } catch (e) {
      console.error(e);
      setErr('Não foi possível salvar.');
    } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} wide title={link ? 'Editar link de pagamento' : 'Novo link de pagamento'}
      subtitle="A aluna abre o link, preenche os dados, aceita os termos e paga por Pix ou cartão na InfinitePay."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar link'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plano" hint="Vem de Produtos e planos. Define o período da aluna.">
          <select className="input" value={planId} onChange={(e) => pickPlan(e.target.value)}>
            <option value="">Escolha…</option>
            {plans.active.map((p) => <option key={p.id} value={p.id}>{products.byId[p.productId]?.name ? `${products.byId[p.productId].name} · ` : ''}{p.name} ({PERIOD_LABEL[p.period]})</option>)}
          </select>
        </Field>
        <Field label="Valor (R$)" hint="O que você recebe. Os juros do parcelamento seguem o que está configurado na sua conta InfinitePay."><input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Título que a aluna vê" className="sm:col-span-2"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Descrição (opcional)" className="sm:col-span-2" hint="O que está incluso, em poucas linhas."><textarea className="input min-h-[70px]" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="InfiniteTag" hint="Sem o $."><input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} /></Field>
        <Field label="WhatsApp da consultoria" hint="Botão na página de obrigado."><input className="input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></Field>
        <Field label="Canal da venda (venda nova)">
          <select className="input" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">Sem canal</option>
            {channels.active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Influencer (opcional)" hint="Para comissão: crie um link por influencer.">
          <select className="input" value={influencerId} onChange={(e) => setInfluencerId(e.target.value)}>
            <option value="">Nenhuma</option>
            {influencers.closed.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Termos que a aluna aceita" className="sm:col-span-2" hint="Fica guardada uma cópia exata no pedido, como prova do aceite. Revise com seu advogado.">
          <textarea className="input min-h-[220px] font-mono text-xs" value={terms} onChange={(e) => setTerms(e.target.value)} />
        </Field>
        <div className="sm:col-span-2"><Toggle checked={active} onChange={setActive} label="Link ativo" hint="Desativado, a página mostra 'link indisponível'." /></div>
      </div>
      <ErrorNote error={err} />
    </Modal>
  );
}

function CouponsTab({ coupons, onEdit }: { coupons: Coupon[]; onEdit: (c: Coupon | 'new') => void }) {
  const w = useWriter();
  const influencers = useInfluencers();
  const [msg, setMsg] = useState('');
  const sorted = [...coupons].sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code));
  const withCoupon = influencers.data.filter((i) => i.coupon);

  async function importAll() {
    let n = 0;
    for (const i of withCoupon) { await syncInfluencerCoupon(w, i); n++; }
    setMsg(n ? `${n} cupom(ns) de influencer atualizado(s). Ficam ativos só os de parceria fechada.` : 'Nenhuma influencer tem cupom cadastrado.');
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => onEdit('new')}>Novo cupom</Button>
        <Button variant="outline" onClick={importAll}>Trazer cupons das influencers</Button>
        {msg && <span className="text-sm text-good">{msg}</span>}
      </div>
      <p className="mb-4 text-sm text-mute">O cupom cadastrado na influencer vira cupom aqui sozinho (padrão {DEFAULT_COUPON_PCT}%). A venda com o cupom dela entra no canal Influencer e conta para a comissão.</p>
      {sorted.length === 0 ? <Empty title="Nenhum cupom" text="Crie um cupom ou traga os cupons das influencers." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">Cupom</th><th className="th">Desconto</th><th className="th">Influencer</th><th className="th">Situação</th><th className="th" /></tr></thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id} className="border-b border-line/60">
                  <td className="td font-mono font-medium">{c.code}</td>
                  <td className="td">{c.pct}%</td>
                  <td className="td">{c.influencerName ?? <span className="text-mute">—</span>}</td>
                  <td className="td"><Badge tone={c.active ? 'good' : 'mute'}>{c.active ? 'Ativo' : 'Desativado'}</Badge></td>
                  <td className="td"><div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => w.update<Coupon>('coupons', c.id, { active: !c.active }, `Cupom ${c.code} ${c.active ? 'desativado' : 'ativado'}`)}>{c.active ? 'Desativar' : 'Ativar'}</Button>
                    <Button size="sm" variant="outline" onClick={() => onEdit(c)}>Editar</Button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CouponModal({ coupon, existing, onClose }: { coupon?: Coupon; existing: Coupon[]; onClose: () => void }) {
  const w = useWriter();
  const influencers = useInfluencers();
  const [code, setCode] = useState(coupon?.code ?? '');
  const [pct, setPct] = useState(String(coupon?.pct ?? DEFAULT_COUPON_PCT));
  const [influencerId, setInfluencerId] = useState(coupon?.influencerId ?? '');
  const [active, setActive] = useState(coupon?.active ?? true);
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    const c = couponCode(code);
    const p = Math.round(Number(pct));
    if (c.length < 3) return setErr('O código precisa ter pelo menos 3 letras ou números.');
    if (!(p >= 1 && p <= 90)) return setErr('O desconto vai de 1% a 90%.');
    if (!coupon && existing.some((x) => x.id === c)) return setErr('Já existe um cupom com esse código.');
    const inf = influencers.byId[influencerId];
    const data = { code: c, pct: p, active, influencerId: influencerId || undefined, influencerName: inf?.name, updatedAt: Date.now() };
    try {
      if (coupon) await w.update<Coupon>('coupons', coupon.id, data, `Cupom ${c} editado`);
      else await w.create('coupons', data, `Cupom ${c} criado (${p}%)`, c);
      onClose();
    } catch (e) { console.error(e); setErr('Não foi possível salvar.'); }
  }

  return (
    <Modal open onClose={onClose} title={coupon ? `Editar cupom ${coupon.code}` : 'Novo cupom'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar cupom</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código" hint="Letras e números, sem espaço."><input className="input font-mono uppercase" disabled={!!coupon} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex.: GEO10" /></Field>
        <Field label="Desconto (%)"><input className="input" type="number" min={1} max={90} value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
        <Field label="Influencer (opcional)" className="sm:col-span-2" hint="A venda com este cupom fica no nome dela.">
          <select className="input" value={influencerId} onChange={(e) => setInfluencerId(e.target.value)}>
            <option value="">Nenhuma</option>
            {influencers.data.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Toggle checked={active} onChange={setActive} label="Cupom ativo" /></div>
      </div>
      <ErrorNote error={err} />
    </Modal>
  );
}
