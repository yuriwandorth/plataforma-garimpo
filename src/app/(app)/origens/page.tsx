'use client';
// Origens rastreadas: link próprio de cada origem (bio, stories, campanha, influencer) com cliques, leads e alunas por período.
import { Fragment, useMemo, useState } from 'react';
import { doc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSession } from '@/lib/auth';
import { useCollection } from '@/lib/db';
import { useInfluencers } from '@/lib/hooks';
import { addDays, fmtDate, fmtPct, monthBounds, parts, todayISO } from '@/lib/calc';
import { ORIGIN_KIND, originKind, type OriginKind, type TrackedOrigin } from '@/lib/growth';
import type { Lead } from '@/lib/leads';
import { cleanSlug, defaultMessage, lastWeeks, originSlug, perWeek, trackUrl, weekStart, type Click } from '@/lib/tracking';
import { syncGoLinks } from '@/lib/goSync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, Stat } from '@/components/ui';
import { HowTo } from '@/components/HowTo';

type Period = 'semana' | '4semanas' | 'mes' | 'mespassado' | 'custom';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'semana', label: 'Esta semana' }, { id: '4semanas', label: 'Últimas 4 semanas' }, { id: 'mes', label: 'Este mês' },
  { id: 'mespassado', label: 'Mês passado' }, { id: 'custom', label: 'Período…' },
];
const HISTORY_WEEKS = 8;

export default function OrigensPage() {
  const { tenant, profile } = useSession();
  const infs = useInfluencers();
  const today = todayISO();
  const [period, setPeriod] = useState<Period>('4semanas');
  const [custom, setCustom] = useState({ start: addDays(today, -30), end: today });
  const range = useMemo(() => {
    const t = parts(today);
    if (period === 'semana') return { start: weekStart(today), end: today };
    if (period === '4semanas') return { start: addDays(weekStart(today), -21), end: today };
    if (period === 'mes') return { start: monthBounds(t.y, t.m).start, end: today };
    if (period === 'mespassado') { const y = t.m === 1 ? t.y - 1 : t.y, m = t.m === 1 ? 12 : t.m - 1; return monthBounds(y, m); }
    return custom;
  }, [period, custom, today]);
  const weeks = useMemo(() => lastWeeks(today, HISTORY_WEEKS), [today]);
  const since = range.start < weeks[0].start ? range.start : weeks[0].start;
  const clicks = useCollection<Click>('clicks', [where('day', '>=', since)], `ck-${since}`);
  const leads = useCollection<Lead>('leads');
  const [edit, setEdit] = useState<TrackedOrigin | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const origins = useMemo(() => [...(tenant?.origins ?? [])].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'pt-BR')), [tenant?.origins]);
  const owner = profile?.role === 'owner';
  const base = typeof window !== 'undefined' ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ''}` : '';

  const rows = useMemo(() => {
    const inRange = (d?: string) => !!d && d >= range.start && d <= range.end;
    return origins.map((o) => {
      const mine = leads.data.filter((l) => !l.deleted && l.stage !== 'nao_lead' && (l.origin === o.name || (!!o.influencerId && l.influencerId === o.influencerId)));
      const ck = clicks.data.filter((c) => c.originId === o.id);
      const pl = mine.filter((l) => inRange(l.firstSeenAt));
      const isConv = (l: Lead) => l.stage === 'convertido' || !!l.clientId;
      return {
        o, clicks: ck.filter((c) => inRange(c.day)).length, leads: pl.length, conv: pl.filter(isConv).length,
        allLeads: mine.length, allConv: mine.filter(isConv).length,
        wClicks: perWeek(ck, (c) => c.day, weeks), wLeads: perWeek(mine, (l) => l.firstSeenAt, weeks),
      };
    });
  }, [origins, leads.data, clicks.data, range, weeks]);
  const tot = rows.reduce((a, r) => ({ clicks: a.clicks + r.clicks, leads: a.leads + r.leads, conv: a.conv + r.conv }), { clicks: 0, leads: 0, conv: 0 });
  const sumClicks = (inf: boolean) => rows.filter((r) => inf === !!r.o.influencerId).reduce((a, r) => a + r.clicks, 0);

  async function saveList(list: TrackedOrigin[], removed: TrackedOrigin[] = []) {
    await updateDoc(doc(db, 'tenants', tenant!.id), { origins: list.map((o) => JSON.parse(JSON.stringify(o))) });
    const failed = await syncGoLinks(tenant!, list, infs.byId, removed);
    setMsg(failed.length ? `Não consegui publicar: ${failed.join(', ')}. Troque o endereço desses links.` : '');
  }
  async function publishAll() {
    setBusy(true); setMsg('');
    try {
      const failed = await syncGoLinks(tenant!, origins, infs.byId);
      setMsg(failed.length ? `Não consegui publicar: ${failed.join(', ')}.` : `${origins.length} links publicados.`);
    } catch (e) { console.error(e); setMsg('Não foi possível publicar os links.'); } finally { setBusy(false); }
  }
  async function copy(id: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1500); } catch { /* sem permissão */ }
  }

  return (
    <div>
      <PageHeader title="Origens e links" subtitle="Link próprio de cada origem: quantos clicaram, quantos viraram lead e quantos viraram alunas."
        actions={owner && <><Button variant="outline" onClick={publishAll} disabled={busy || !origins.length}>{busy ? 'Publicando…' : 'Publicar links'}</Button><Button onClick={() => setEdit({ id: '', name: '', kind: 'influencer' })}>Nova origem</Button></>} />
      <HowTo id="origens" title="Como funciona">
        <p>Cada origem tem um link próprio. Quem clica cai no seu WhatsApp com uma mensagem pronta dizendo de onde veio (ex.: &quot;Vim pela indicação da Geovanna… cód. geozonna&quot;). O clique é contado na hora.</p>
        <p>Quando a pessoa chega no WhatsApp, marque a origem do lead na Triagem ou no cadastro do lead: a mensagem pronta mostra qual é. Assim os leads e as alunas de cada link aparecem aqui e no painel da influencer.</p>
        <p>Os links antigos da Leadfy continuam listados até você trocar todos. Só cancele a Leadfy depois de trocar os links da bio e das influencers.</p>
      </HowTo>
      {!tenant?.whatsapp && <ErrorNote error="Cadastre o WhatsApp da consultoria em Configurações: é para ele que os links levam." />}
      {msg && <p className="mb-3 rounded-lg border border-gold/40 bg-gold/10 p-2 text-sm">{msg}</p>}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        {PERIODS.map((p) => <Button key={p.id} size="sm" variant={period === p.id ? 'primary' : 'outline'} onClick={() => setPeriod(p.id)}>{p.label}</Button>)}
        {period === 'custom' && <>
          <input type="date" className="input w-40" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} aria-label="De" />
          <input type="date" className="input w-40" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} aria-label="Até" />
        </>}
        <span className="pb-1 text-xs text-mute">{fmtDate(range.start)} a {fmtDate(range.end)}</span>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Cliques" value={tot.clicks} sub={`seus links ${sumClicks(false)} · influencers ${sumClicks(true)}`} />
        <Stat label="Leads" value={tot.leads} sub={tot.clicks ? `${fmtPct(tot.leads / tot.clicks)} dos cliques` : 'que entraram no período'} />
        <Stat label="Viraram alunas" value={tot.conv} sub={tot.leads ? `${fmtPct(tot.conv / tot.leads)} dos leads` : '—'} tone="good" />
        <Stat label="Origens" value={origins.length} sub={`${origins.filter((o) => o.influencerId).length} de influencers`} />
      </div>
      <ErrorNote error={clicks.error} />

      {infs.loading || leads.loading ? <Spinner /> : origins.length === 0 ? (
        <Empty title="Nenhuma origem cadastrada" text="Cadastre os links que você divulga (bio, stories, campanhas, influencers) para saber de onde vêm os leads." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Origem</th><th className="th">Link próprio</th><th className="th">Cliques</th><th className="th">Leads</th><th className="th">Alunas</th><th className="th">8 semanas</th><th className="th" /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const { o } = r;
                  const inf = o.influencerId ? infs.byId[o.influencerId] : undefined;
                  const url = trackUrl(base, originSlug(o));
                  const max = Math.max(1, ...r.wClicks, ...r.wLeads);
                  return (
                    <Fragment key={o.id}>
                      <tr className="border-b border-line/60">
                        <td className="td">
                          <div className="font-medium">{o.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-mute">
                            <Badge tone={o.kind === 'influencer' ? 'gold' : o.kind === 'campanha' ? 'warn' : 'mute'}>{ORIGIN_KIND[o.kind]}</Badge>
                            {inf && <span>{inf.name}{inf.coupon ? ` · ${inf.coupon}` : ''}</span>}
                            {o.paused && <Badge tone="bad">pausado</Badge>}
                          </div>
                        </td>
                        <td className="td text-xs">
                          <button type="button" onClick={() => copy(o.id, url)} className="max-w-[14rem] truncate text-left text-gold hover:underline" title="Copiar link">{copied === o.id ? 'Copiado!' : url.replace(/^https?:\/\//, '')}</button>
                          {o.url && <div className="max-w-[14rem] truncate text-mute" title="Link antigo (Leadfy)">antigo: {o.url.replace(/^https?:\/\//, '')}</div>}
                        </td>
                        <td className="td font-medium">{r.clicks}</td>
                        <td className="td">{r.leads}{r.clicks > 0 && <span className="text-xs text-mute"> · {fmtPct(r.leads / r.clicks)}</span>}</td>
                        <td className="td">{r.conv}<div className="text-xs text-mute">{r.allConv}/{r.allLeads} no total</div></td>
                        <td className="td">
                          <button type="button" onClick={() => setOpen(open === o.id ? null : o.id)} className="flex h-8 items-end gap-0.5" title="Cliques (dourado) e leads (cinza) por semana. Toque para ver os números.">
                            {weeks.map((w, k) => (
                              <span key={w.start} className="flex items-end gap-px">
                                <span className="w-1.5 rounded-sm bg-gold" style={{ height: `${Math.max(2, (r.wClicks[k] / max) * 28)}px` }} />
                                <span className="w-1.5 rounded-sm bg-line" style={{ height: `${Math.max(2, (r.wLeads[k] / max) * 28)}px` }} />
                              </span>
                            ))}
                          </button>
                        </td>
                        <td className="td">{owner && <Button size="sm" variant="outline" onClick={() => setEdit(o)}>Editar</Button>}</td>
                      </tr>
                      {open === o.id && (
                        <tr className="border-b border-line/60 bg-bg/40">
                          <td className="td" colSpan={7}>
                            <div className="overflow-x-auto">
                              <table className="text-xs">
                                <thead><tr><th className="th">Semana de</th>{weeks.map((w) => <th key={w.start} className="th">{w.label}</th>)}</tr></thead>
                                <tbody>
                                  <tr><td className="td">Cliques</td>{r.wClicks.map((n, k) => <td key={k} className="td">{n}</td>)}</tr>
                                  <tr><td className="td">Leads</td>{r.wLeads.map((n, k) => <td key={k} className="td">{n}</td>)}</tr>
                                </tbody>
                              </table>
                            </div>
                            <p className="mt-2 text-xs text-mute">Mensagem que chega no WhatsApp: &quot;{o.message?.trim() || defaultMessage(o, originSlug(o), inf?.name)}&quot;</p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {edit && <OriginModal origin={edit} all={origins} infs={infs.data} onClose={() => setEdit(null)} onSave={saveList} />}
    </div>
  );
}

function OriginModal({ origin, all, infs, onClose, onSave }: {
  origin: TrackedOrigin; all: TrackedOrigin[]; infs: { id: string; name: string }[]; onClose: () => void; onSave: (l: TrackedOrigin[], removed?: TrackedOrigin[]) => Promise<void>;
}) {
  const [f, setF] = useState<TrackedOrigin>({ ...origin, slug: origin.id ? originSlug(origin) : origin.slug });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TrackedOrigin>(k: K, v: TrackedOrigin[K]) => setF((p) => ({ ...p, [k]: v }));
  const isNew = !origin.id;
  const inf = infs.find((i) => i.id === f.influencerId);
  const slug = cleanSlug(f.slug || f.name);

  async function save() {
    setErr('');
    if (!f.name.trim()) return setErr('Dê um nome para a origem.');
    if (!slug) return setErr('Defina o endereço do link.');
    const id = origin.id || cleanSlug(f.name);
    if (isNew && all.some((o) => o.id === id)) return setErr('Já existe uma origem com esse nome.');
    if (all.some((o) => o.id !== origin.id && originSlug(o) === slug)) return setErr('Esse endereço já é usado por outra origem.');
    const clean: TrackedOrigin = { ...f, id, name: f.name.trim(), slug };
    (Object.keys(clean) as (keyof TrackedOrigin)[]).forEach((k) => { if (clean[k] === '' || clean[k] === undefined || clean[k] === false) delete clean[k]; });
    setBusy(true);
    try { await onSave(isNew ? [...all, clean] : all.map((o) => (o.id === origin.id ? clean : o))); onClose(); }
    catch (e) { console.error(e); setErr('Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await onSave(all.filter((o) => o.id !== origin.id), [origin]); onClose(); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} wide title={isNew ? 'Nova origem' : `Editar ${origin.name}`}
      footer={<>{!isNew && <Button variant="ghost" className="mr-auto" onClick={remove} disabled={busy}>Remover</Button>}<Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><input className="input" value={f.name} onChange={(e) => { set('name', e.target.value); if (isNew) set('kind', originKind(e.target.value, f.campaign)); }} placeholder="Ex.: Bio IG, Influ Geo, BK26" /></Field>
        <Field label="Tipo">
          <select className="input" value={f.kind} onChange={(e) => set('kind', e.target.value as OriginKind)}>
            {(Object.keys(ORIGIN_KIND) as OriginKind[]).map((k) => <option key={k} value={k}>{ORIGIN_KIND[k]}</option>)}
          </select>
        </Field>
        <Field label="Endereço do link" hint={`Fica …/r/?l=${slug || 'endereco'}. Mudar o endereço cria um link novo (o antigo continua funcionando).`}>
          <input className="input" value={f.slug ?? ''} onChange={(e) => set('slug', e.target.value)} placeholder={cleanSlug(f.name) || 'ex.: geozonna'} />
        </Field>
        <Field label="Influencer (opcional)">
          <select className="input" value={f.influencerId ?? ''} onChange={(e) => set('influencerId', e.target.value || undefined)}>
            <option value="">Nenhuma</option>
            {infs.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Mensagem pronta no WhatsApp" className="sm:col-span-2" hint="Deixe vazio para usar a padrão. Mantenha o 'cód.' no final: é ele que mostra a origem na triagem.">
          <textarea className="input min-h-[64px]" value={f.message ?? ''} onChange={(e) => set('message', e.target.value)} placeholder={defaultMessage(f, slug, inf?.name)} />
        </Field>
        <Field label="Campanha (opcional)"><input className="input" value={f.campaign ?? ''} onChange={(e) => set('campaign', e.target.value)} /></Field>
        <Field label="Link antigo (Leadfy)"><input className="input" value={f.url ?? ''} onChange={(e) => set('url', e.target.value.trim())} placeholder="https://…" /></Field>
        <Field label="Descrição" className="sm:col-span-2"><input className="input" value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Onde o link é divulgado" /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--gold))]" checked={!!f.paused} onChange={(e) => set('paused', e.target.checked)} />
          Pausar este link (quem clicar vê &quot;link indisponível&quot;)
        </label>
      </div>
      <ErrorNote error={err} />
    </Modal>
  );
}
