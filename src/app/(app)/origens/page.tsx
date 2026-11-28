'use client';
// Origens rastreadas: links da bio, stories, campanhas e de cada influencer, com os leads e alunas que cada uma trouxe.
import { useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSession } from '@/lib/auth';
import { useCollection } from '@/lib/db';
import { useInfluencers } from '@/lib/hooks';
import { fmtPct } from '@/lib/calc';
import { ORIGIN_KIND, originKind, type OriginKind, type TrackedOrigin } from '@/lib/growth';
import type { Lead } from '@/lib/leads';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, Stat } from '@/components/ui';
import { HowTo } from '@/components/HowTo';

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function OrigensPage() {
  const { tenant, profile } = useSession();
  const infs = useInfluencers();
  const leads = useCollection<Lead>('leads');
  const [edit, setEdit] = useState<TrackedOrigin | null>(null);
  const [copied, setCopied] = useState('');
  const origins = useMemo(() => [...(tenant?.origins ?? [])].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'pt-BR')), [tenant?.origins]);
  const owner = profile?.role === 'owner';

  const stats = useMemo(() => {
    const m = new Map<string, { leads: number; conv: number }>();
    for (const o of origins) {
      const mine = leads.data.filter((l) => !l.deleted && l.stage !== 'nao_lead' && (l.origin === o.name || (o.influencerId && l.influencerId === o.influencerId)));
      m.set(o.id, { leads: mine.length, conv: mine.filter((l) => l.stage === 'convertido' || l.clientId).length });
    }
    return m;
  }, [origins, leads.data]);
  const totalLeads = [...stats.values()].reduce((a, s) => a + s.leads, 0);
  const totalConv = [...stats.values()].reduce((a, s) => a + s.conv, 0);
  const withoutOrigin = leads.data.filter((l) => !l.deleted && l.stage !== 'nao_lead' && !l.origin && !l.influencerId).length;

  async function save(list: TrackedOrigin[]) {
    await updateDoc(doc(db, 'tenants', tenant!.id), { origins: list.map((o) => JSON.parse(JSON.stringify(o))) });
  }
  async function copy(o: TrackedOrigin) {
    if (!o.url) return;
    try { await navigator.clipboard.writeText(o.url); setCopied(o.id); setTimeout(() => setCopied(''), 1500); } catch { /* sem permissão */ }
  }

  return (
    <div>
      <PageHeader title="Origens e links" subtitle="De onde vêm os leads: link da bio, stories, campanhas e o link de cada influencer."
        actions={owner && <Button onClick={() => setEdit({ id: '', name: '', kind: 'influencer' })}>Nova origem</Button>} />
      <HowTo id="origens" title="Como usar">
        <p>Cada origem tem um link rastreado. Quem chega pelo link entra como lead com a origem marcada, e as vendas dessas alunas contam para a origem.</p>
        <p>Origens de influencer ficam ligadas à ficha dela: os leads entram no painel da influencer e o cupom aparece aqui.</p>
        <p>Os links atuais vieram da Leadfy. Se você sair dela, os links param: troque aqui pelo novo link de cada origem.</p>
      </HowTo>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Origens" value={origins.length} sub={`${origins.filter((o) => o.influencerId).length} de influencers`} />
        <Stat label="Leads com origem" value={totalLeads} />
        <Stat label="Viraram alunas" value={totalConv} sub={totalLeads ? fmtPct(totalConv / totalLeads) : '—'} tone="good" />
        <Stat label="Leads sem origem" value={withoutOrigin} sub="chegaram sem link rastreado" />
      </div>
      {infs.loading || leads.loading ? <Spinner /> : origins.length === 0 ? (
        <Empty title="Nenhuma origem cadastrada" text="Cadastre os links que você divulga (bio, stories, campanhas, influencers) para saber de onde vêm os leads." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Origem</th><th className="th">Tipo</th><th className="th">Influencer / cupom</th><th className="th">Link</th><th className="th">Leads</th><th className="th">Alunas</th><th className="th" /></tr></thead>
              <tbody>
                {origins.map((o) => {
                  const inf = o.influencerId ? infs.byId[o.influencerId] : undefined;
                  const st = stats.get(o.id) ?? { leads: 0, conv: 0 };
                  return (
                    <tr key={o.id} className="border-b border-line/60">
                      <td className="td"><div className="font-medium">{o.name}</div>{o.description && <div className="max-w-[18rem] text-xs text-mute">{o.description}</div>}</td>
                      <td className="td"><Badge tone={o.kind === 'influencer' ? 'gold' : o.kind === 'campanha' ? 'warn' : 'mute'}>{ORIGIN_KIND[o.kind]}</Badge>{o.campaign && <div className="text-xs text-mute">{o.campaign}</div>}</td>
                      <td className="td text-sm">{inf ? <>{inf.name}<div className="font-mono text-xs text-mute">{inf.coupon ?? 'sem cupom'}</div></> : <span className="text-mute">—</span>}</td>
                      <td className="td text-xs">{o.url ? <button type="button" onClick={() => copy(o)} className="max-w-[12rem] truncate text-left text-gold hover:underline" title="Copiar link">{copied === o.id ? 'Copiado!' : o.url.replace(/^https?:\/\//, '')}</button> : <span className="text-mute">sem link</span>}</td>
                      <td className="td">{st.leads}</td>
                      <td className="td">{st.conv}{st.leads > 0 && <span className="text-xs text-mute"> · {fmtPct(st.conv / st.leads)}</span>}</td>
                      <td className="td">{owner && <Button size="sm" variant="outline" onClick={() => setEdit(o)}>Editar</Button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {edit && <OriginModal origin={edit} all={origins} infs={infs.data} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  );
}

function OriginModal({ origin, all, infs, onClose, onSave }: {
  origin: TrackedOrigin; all: TrackedOrigin[]; infs: { id: string; name: string }[]; onClose: () => void; onSave: (l: TrackedOrigin[]) => Promise<void>;
}) {
  const [f, setF] = useState<TrackedOrigin>(origin);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TrackedOrigin>(k: K, v: TrackedOrigin[K]) => setF((p) => ({ ...p, [k]: v }));
  const isNew = !origin.id;

  async function save() {
    setErr('');
    if (!f.name.trim()) return setErr('Dê um nome para a origem.');
    if (f.url && !/^https?:\/\//.test(f.url)) return setErr('O link precisa começar com http:// ou https://');
    const id = origin.id || slug(f.name);
    if (isNew && all.some((o) => o.id === id)) return setErr('Já existe uma origem com esse nome.');
    const clean: TrackedOrigin = { ...f, id, name: f.name.trim() };
    (Object.keys(clean) as (keyof TrackedOrigin)[]).forEach((k) => { if (clean[k] === '' || clean[k] === undefined) delete clean[k]; });
    setBusy(true);
    try { await onSave(isNew ? [...all, clean] : all.map((o) => (o.id === origin.id ? clean : o))); onClose(); }
    catch (e) { console.error(e); setErr('Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await onSave(all.filter((o) => o.id !== origin.id)); onClose(); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Nova origem' : `Editar ${origin.name}`}
      footer={<>{!isNew && <Button variant="ghost" className="mr-auto" onClick={remove} disabled={busy}>Remover</Button>}<Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><input className="input" value={f.name} onChange={(e) => { set('name', e.target.value); if (isNew) set('kind', originKind(e.target.value, f.campaign)); }} placeholder="Ex.: Bio IG, Influ Geo, BK26" /></Field>
        <Field label="Tipo">
          <select className="input" value={f.kind} onChange={(e) => set('kind', e.target.value as OriginKind)}>
            {(Object.keys(ORIGIN_KIND) as OriginKind[]).map((k) => <option key={k} value={k}>{ORIGIN_KIND[k]}</option>)}
          </select>
        </Field>
        <Field label="Link rastreado" className="sm:col-span-2"><input className="input" value={f.url ?? ''} onChange={(e) => set('url', e.target.value.trim())} placeholder="https://…" /></Field>
        <Field label="Influencer (opcional)">
          <select className="input" value={f.influencerId ?? ''} onChange={(e) => set('influencerId', e.target.value || undefined)}>
            <option value="">Nenhuma</option>
            {infs.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="Campanha (opcional)"><input className="input" value={f.campaign ?? ''} onChange={(e) => set('campaign', e.target.value)} /></Field>
        <Field label="Descrição" className="sm:col-span-2"><input className="input" value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Onde o link é divulgado" /></Field>
      </div>
      <ErrorNote error={err} />
    </Modal>
  );
}
