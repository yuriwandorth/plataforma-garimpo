'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCollection, useWriter } from '@/lib/db';
import { usePlans } from '@/lib/hooks';
import { fmtBRL, fmtBRL2, fmtPct, parseMoney } from '@/lib/calc';
import {
  CATEGORY_LABEL, installmentTable, perMonth, prettyPrice, priceForNet, suggestedPrice, TIER_LABEL, TIER_MONTHS, TIERS,
  vsSuggested, whatsappText, type Category, type Deliverable, type Offer, type TierKey,
} from '@/lib/offer';
import type { Plan } from '@/lib/types';
import { Badge, Button, Card, cx, Field, Modal, Spinner, Toggle } from '@/components/ui';

export default function Page() {
  return <Suspense fallback={<Spinner />}><Editor /></Suspense>;
}

const STEPS = [...TIERS.map((t) => TIER_LABEL[t]), 'Taxas', 'Oferta completa'];

function Editor() {
  const id = useSearchParams().get('id') ?? '';
  const offers = useCollection<Offer>('offers');
  const plans = usePlans();
  const w = useWriter();
  const [o, setO] = useState<Offer | null>(null);
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const remote = offers.data.find((x) => x.id === id);
  useEffect(() => { if (remote && !o) setO(structuredClone(remote)); }, [remote, o]);

  // avisa antes de fechar a aba com alterações não salvas
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (offers.loading) return <Spinner />;
  if (!remote) return <p className="text-sm text-mute">Oferta não encontrada. <Link className="underline" href="/ofertas/">Voltar</Link></p>;
  if (!o) return <Spinner />;

  const edit = (fn: (d: Offer) => void) => { setO((prev) => { const d = structuredClone(prev!); fn(d); return d; }); setDirty(true); setSaved(''); };

  async function save() {
    setBusy(true);
    const { id: _id, createdAt: _c, ...rest } = o!; void _id; void _c;
    // JSON remove campos vazios (undefined) dentro dos planos, que o Firestore recusa
    await w.update<Offer>('offers', id, JSON.parse(JSON.stringify(rest)), `Oferta salva: ${o!.name}`);
    setDirty(false); setBusy(false);
    setSaved(`Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
  }

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/ofertas/" className="text-xs text-mute hover:text-ink">← Ofertas</Link>
          <input className="mt-1 w-full bg-transparent text-2xl font-semibold tracking-tight outline-none" value={o.name}
            onChange={(e) => edit((d) => { d.name = e.target.value; })} aria-label="Nome da oferta" />
          <p className="text-sm text-mute">O anual é a base. Configure os planos, os entregáveis e veja o valor líquido real.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-mute">{dirty ? 'Alterações não salvas' : saved}</span>
          <Button onClick={save} disabled={busy || !dirty}>{busy ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-1">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)}
            className={cx('rounded-full border px-3 py-1 text-xs', step === i ? 'border-gold bg-gold/15 font-medium' : 'border-line text-mute hover:text-ink')}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {step < 4 && <TierStep o={o} tier={TIERS[step]} plans={plans.data} edit={edit} />}
      {step === 4 && <FeesStep o={o} edit={edit} />}
      {step === 5 && <FinalStep o={o} edit={edit} plans={plans.data} />}

      <div className="mt-6 flex justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>← {STEPS[step - 1] ?? ''}</Button>
        {step < STEPS.length - 1 && <Button onClick={() => setStep(step + 1)}>Continuar → {STEPS[step + 1]}</Button>}
      </div>
    </div>
  );
}

type Edit = (fn: (d: Offer) => void) => void;

function TierStep({ o, tier, plans, edit }: { o: Offer; tier: TierKey; plans: Plan[]; edit: Edit }) {
  const t = o.tiers[tier];
  const [priceText, setPriceText] = useState('');
  const [custom, setCustom] = useState(false);
  useEffect(() => { setPriceText(t.price ? String(t.price).replace('.', ',') : ''); }, [tier, t.price]);
  const anual = o.tiers.anual.price;
  const sug = tier === 'anual' ? 0 : suggestedPrice(anual, tier, o.premiums[tier]);
  const vs = vsSuggested(t.price, sug);
  const upper = TIERS[TIERS.indexOf(tier) - 1];
  const byCat = useMemo(() => {
    const g: Partial<Record<Category, Deliverable[]>> = {};
    o.catalog.forEach((d) => { (g[d.category] ??= []).push(d); });
    return g;
  }, [o.catalog]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gold">Passo {TIERS.indexOf(tier) + 1} de 5</div>
            <h2 className="text-xl font-semibold">Plano {TIER_LABEL[tier]}</h2>
            <p className="text-sm text-mute">{tier === 'anual' ? 'Este é o plano base. Ative o que você entrega e ajuste as quantidades.' : 'Calculado a partir do Anual. Ajuste se necessário.'}</p>
          </div>
          {tier !== 'anual' && (
            <Toggle checked={t.enabled} onChange={(v) => edit((d) => { d.tiers[tier].enabled = v; })} label="Oferecer este plano" />
          )}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label={`Preço do plano ${TIER_LABEL[tier].toLowerCase()} (R$)`}>
            <input className="input text-lg font-semibold" inputMode="decimal" value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              onBlur={() => edit((d) => { d.tiers[tier].price = parseMoney(priceText); })} />
          </Field>
          <div className="text-sm">
            <div className="label">Por mês</div>
            <div className="font-medium">{t.price ? `${fmtBRL(perMonth(t.price, tier))}/mês durante ${TIER_MONTHS[tier]} ${TIER_MONTHS[tier] === 1 ? 'mês' : 'meses'}` : '—'}</div>
            {tier !== 'anual' && anual > 0 && (
              <div className="mt-1 text-xs text-mute">
                Base anual {fmtBRL(anual)} ({fmtBRL(anual / 12)}/mês) · sugerido <button className="underline" onClick={() => edit((d) => { d.tiers[tier].price = sug; })}>{fmtBRL(sug)}</button>
                {vs !== null && <> · <span className={vs >= 0 ? 'text-good' : 'text-bad'}>{vs >= 0 ? '+' : ''}{fmtPct(vs)}</span></>}
              </div>
            )}
          </div>
          <Field label="Plano cadastrado (opcional)" hint="Liga esta oferta a um plano de Produtos e planos.">
            <select className="input" value={t.planId ?? ''} onChange={(e) => edit((d) => {
              d.tiers[tier].planId = e.target.value || undefined;
              const p = plans.find((x) => x.id === e.target.value);
              if (p && !d.tiers[tier].price) d.tiers[tier].price = p.price;
            })}>
              <option value="">Nenhum</option>
              {plans.filter((p) => p.active || p.id === t.planId).map((p) => <option key={p.id} value={p.id}>{p.name} · {fmtBRL(p.price)}</option>)}
            </select>
          </Field>
        </div>
        {tier !== 'anual' && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mute">
            <span>Prêmio sobre o anual para a sugestão:</span>
            <input className="input w-20 py-1 text-xs" type="number" value={o.premiums[tier]} onChange={(e) => edit((d) => { d.premiums[tier] = Number(e.target.value) || 0; })} />%
            {upper && <Button size="sm" variant="ghost" onClick={() => edit((d) => { d.tiers[tier].items = { ...d.tiers[upper].items }; })}>Copiar entregáveis do {TIER_LABEL[upper]}</Button>}
          </div>
        )}
      </Card>

      {(Object.keys(CATEGORY_LABEL) as Category[]).filter((c) => byCat[c]?.length).map((c) => (
        <Card key={c} title={<span>{CATEGORY_LABEL[c].title} <span className="font-normal text-mute">· {CATEGORY_LABEL[c].sub}</span></span>}>
          <div className="divide-y divide-line">
            {byCat[c]!.map((d) => {
              const qty = d.always ? 1 : t.items[d.id] ?? 0;
              const on = qty > 0;
              return (
                <div key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <label className={cx('flex min-w-0 flex-1 items-start gap-3', d.always ? '' : 'cursor-pointer')}>
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--gold))]" checked={on} disabled={d.always}
                      onChange={(e) => edit((x) => { x.tiers[tier].items[d.id] = e.target.checked ? (d.countable ? Math.max(1, x.tiers[tier].items[d.id] || 1) : 1) : 0; })} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{d.name}</span>
                      {d.description && <span className="block text-xs text-mute">{d.description}</span>}
                    </span>
                  </label>
                  {d.always ? <Badge>sempre incluso</Badge> : d.countable && on ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" aria-label="Diminuir" onClick={() => edit((x) => { x.tiers[tier].items[d.id] = Math.max(0, qty - 1); })}>−</Button>
                      <span className="w-8 text-center text-sm font-semibold">{qty}</span>
                      <Button size="sm" variant="outline" aria-label="Aumentar" onClick={() => edit((x) => { x.tiers[tier].items[d.id] = qty + 1; })}>+</Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <Button variant="outline" onClick={() => setCustom(true)}>+ Criar entregável próprio</Button>
      <CustomDeliverable open={custom} onClose={() => setCustom(false)} onSave={(d) => edit((x) => { x.catalog.push(d); x.tiers[tier].items[d.id] = 1; })} />
    </div>
  );
}

function CustomDeliverable({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (d: Deliverable) => void }) {
  const [f, setF] = useState({ name: '', description: '', category: 'extra' as Category, countable: false });
  useEffect(() => { if (open) setF({ name: '', description: '', category: 'extra', countable: false }); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Novo entregável" subtitle="Fica disponível em todos os planos desta oferta."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!f.name.trim()} onClick={() => {
        onSave({ id: `custom-${Date.now()}`, name: f.name.trim(), description: f.description.trim() || undefined, category: f.category, countable: f.countable });
        onClose();
      }}>Adicionar</Button></>}>
      <div className="space-y-3">
        <Field label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Áudio personalizado do Yuri" /></Field>
        <Field label="Descrição (opcional)"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Grupo">
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Category })}>
            {(Object.keys(CATEGORY_LABEL) as Category[]).filter((c) => c !== 'base').map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c].title}</option>)}
          </select>
        </Field>
        <Toggle checked={f.countable} onChange={(v) => setF({ ...f, countable: v })} label="Tem quantidade" hint="Ex.: 3x calls, 2x lives." />
      </div>
    </Modal>
  );
}

function FeesStep({ o, edit }: { o: Offer; edit: Edit }) {
  const fees = o.fees;
  const [wanted, setWanted] = useState<Record<string, string>>({});
  return (
    <div className="space-y-4">
      <Card>
        <div className="text-xs font-semibold uppercase tracking-wide text-gold">Passo 5 de 5</div>
        <h2 className="text-xl font-semibold">Taxas e financeiro</h2>
        <p className="text-sm text-mute">Só você vê isto: não aparece no texto do WhatsApp.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Taxa do checkout (%)" hint="Cobrada sobre toda venda.">
            <input className="input" type="number" step="0.01" value={fees.checkoutPct} onChange={(e) => edit((d) => { d.fees.checkoutPct = Number(e.target.value) || 0; })} />
          </Field>
          <Field label="Máximo de parcelas">
            <input className="input" type="number" min={1} max={12} value={fees.maxInstallments} onChange={(e) => edit((d) => { d.fees.maxInstallments = Math.max(1, Math.min(12, Number(e.target.value) || 1)); })} />
          </Field>
          <div className="sm:pt-5">
            <Toggle checked={fees.passToClient} onChange={(v) => edit((d) => { d.fees.passToClient = v; })} label="Repassar juros para a aluna"
              hint="A aluna paga a taxa do parcelamento e você recebe o preço cheio." />
          </div>
        </div>
        <div className="mt-4">
          <span className="label">Taxa total da maquininha por nº de parcelas (%) · copie da tabela da sua operadora</span>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
            {fees.installmentPct.map((v, i) => (
              <label key={i} className="block">
                <span className="block text-center text-[11px] text-mute">{i + 1}x</span>
                <input className="input px-1 text-center text-xs" type="number" step="0.01" value={v}
                  onChange={(e) => edit((d) => { d.fees.installmentPct[i] = Number(e.target.value) || 0; })} />
              </label>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Calculadora reversa · quanto você quer receber líquido?">
        <div className="grid gap-3 sm:grid-cols-4">
          {TIERS.filter((t) => o.tiers[t].enabled).map((t) => (
            <Field key={t} label={`${TIER_LABEL[t]} — quero receber (R$)`} hint={`Preço atual: ${fmtBRL(o.tiers[t].price)}${wanted[t] ? ` · cobrar à vista: ${fmtBRL2(priceForNet(parseMoney(wanted[t]), fees))}` : ''}`}>
              <input className="input" inputMode="decimal" value={wanted[t] ?? ''} onChange={(e) => setWanted({ ...wanted, [t]: e.target.value })} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {TIERS.filter((t) => o.tiers[t].enabled && o.tiers[t].price > 0).map((t) => {
          const price = o.tiers[t].price;
          const rows = installmentTable(price, fees);
          const pretty = prettyPrice(price);
          return (
            <Card key={t} title={`${TIER_LABEL[t]} · ${fmtBRL(price)}`}
              action={pretty !== price ? <button className="text-xs text-gold hover:underline" onClick={() => edit((d) => { d.tiers[t].price = pretty; })}>Preço bonito: {fmtBRL(pretty)}</button> : undefined}>
              <div className="mb-2 text-xs text-mute">Taxa do checkout ({fees.checkoutPct}%): − {fmtBRL2(price * fees.checkoutPct / 100)} · líquido à vista {fmtBRL2(rows[0].net)}</div>
              <table className="w-full">
                <thead><tr className="border-b border-line"><th className="th">Parcelas</th><th className="th">Parcela</th><th className="th">Aluna paga</th><th className="th">Você recebe</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.n} className="border-b border-line/60">
                      <td className="td">{r.n}x</td><td className="td">{fmtBRL2(r.perInstallment)}</td>
                      <td className="td text-mute">{fmtBRL2(r.clientTotal)}</td><td className="td font-medium">{fmtBRL2(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function FinalStep({ o, edit, plans }: { o: Offer; edit: Edit; plans: Plan[] }) {
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);
  const w = useWriter();
  const [synced, setSynced] = useState('');
  const text = whatsappText(o, name);
  const linked = TIERS.filter((t) => o.tiers[t].planId && plans.find((p) => p.id === o.tiers[t].planId && p.price !== o.tiers[t].price));

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-xs font-semibold uppercase tracking-wide text-gold">Oferta estruturada</div>
        <h2 className="text-xl font-semibold">Sua oferta completa</h2>
        <p className="text-sm text-mute">Revise e copie o texto pronto para o WhatsApp.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_16rem]">
          <div>
            <span className="label">Texto para WhatsApp</span>
            <textarea className="input h-80 font-mono text-xs" readOnly value={text} />
          </div>
          <div className="space-y-3">
            <Field label="Nome da aluna (opcional)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Título"><input className="input" value={o.header} onChange={(e) => edit((d) => { d.header = e.target.value; })} /></Field>
            <Field label="Fechamento"><textarea className="input" rows={3} value={o.closing} onChange={(e) => edit((d) => { d.closing = e.target.value; })} /></Field>
            <Button className="w-full" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
              {copied ? 'Copiado!' : 'Copiar texto'}
            </Button>
          </div>
        </div>
      </Card>
      {linked.length > 0 && (
        <Card title="Preços diferentes dos planos cadastrados">
          <p className="mb-3 text-sm text-mute">
            {linked.map((t) => `${TIER_LABEL[t]}: oferta ${fmtBRL(o.tiers[t].price)} × cadastro ${fmtBRL(plans.find((p) => p.id === o.tiers[t].planId)!.price)}`).join(' · ')}
          </p>
          <Button variant="outline" onClick={async () => {
            for (const t of linked) await w.update<Plan>('plans', o.tiers[t].planId!, { price: o.tiers[t].price }, `Preço do plano atualizado pela oferta ${o.name}`);
            setSynced('Preços dos planos atualizados.');
          }}>Atualizar o preço nos planos cadastrados</Button>
          {synced && <span className="ml-3 text-sm text-good">{synced}</span>}
        </Card>
      )}
    </div>
  );
}
