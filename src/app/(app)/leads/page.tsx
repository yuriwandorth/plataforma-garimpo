'use client';
// Leads: quem ainda não comprou. Cruza com as alunas pelo telefone e mostra a conversão por lista.
import { useMemo, useState } from 'react';
import { useCollection, useWriter } from '@/lib/db';
import { download, useChannels, useClients, useInfluencers } from '@/lib/hooks';
import { fmtDate, fmtPct, toCSV, todayISO } from '@/lib/calc';
import { FUNNEL, FUP_LABEL, isConverted, LEAD_STAGES, leadBoard, nextFollowUp, type Lead, type LeadStage, type LeadView } from '@/lib/leads';
import type { Client, Sale } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Progress, Spinner, Stat, Tabs } from '@/components/ui';
import { SaleForm } from '@/components/SaleForm';
import { ClientModal } from '@/components/ClientModal';
import { Board } from '@/components/Board';
import { useSession } from '@/lib/auth';

type Tab = 'chamar' | 'funil' | 'abertos' | 'convertidos' | 'perdidos' | 'todos';
const COL_LIMIT = 40;
const PAGE = 100;

const wa = (phone?: string) => {
  const d = (phone ?? '').replace(/\D/g, '');
  return d ? `https://wa.me/${d.length <= 11 ? '55' + d : d}` : null;
};
const fmtPhone = (p?: string) => {
  const d = (p ?? '').replace(/\D/g, '');
  const br = d.length === 13 && d.startsWith('55') ? d.slice(2) : d;
  if (br.length === 11) return `(${br.slice(0, 2)}) ${br.slice(2, 7)}-${br.slice(7)}`;
  if (br.length === 10) return `(${br.slice(0, 2)}) ${br.slice(2, 6)}-${br.slice(6)}`;
  return d ? `+${d}` : '—';
};

export default function LeadsPage() {
  const leads = useCollection<Lead>('leads');
  const clients = useClients();
  const sales = useCollection<Sale>('sales');
  const channels = useChannels();
  const w = useWriter();
  const [tab, setTab] = useState<Tab>('chamar');
  const today = todayISO();
  const [q, setQ] = useState('');
  const [list, setList] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [edit, setEdit] = useState<Lead | 'new' | null>(null);
  const [sell, setSell] = useState<Client | null>(null);
  const [openClient, setOpenClient] = useState<Client | null>(null);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState<string | null>(null);
  const infs = useInfluencers();

  const b = useMemo(() => leadBoard(leads.data, clients.data, sales.data), [leads.data, clients.data, sales.data]);
  const s = q.trim().toLowerCase();
  const digits = s.replace(/\D/g, '');
  const fup = (v: LeadView) => (isConverted(v) ? null : nextFollowUp(v.lead, today));
  const due = b.views.filter((v) => { const f = fup(v); return f?.at && f.at <= today; });
  const filtered = (tab === 'chamar' ? due : b.views)
    .filter((v) => tab === 'chamar' || tab === 'todos' || tab === 'funil' || (tab === 'convertidos' ? isConverted(v) : tab === 'perdidos' ? !isConverted(v) && v.lead.stage === 'perdido' : !isConverted(v) && v.lead.stage !== 'perdido'))
    .filter((v) => !list || (v.lead.list ?? 'Sem lista') === list || (v.lead.tags ?? []).includes(list))
    .filter((v) => !s || v.lead.name.toLowerCase().includes(s) || (v.lead.email ?? '').includes(s) || (digits.length >= 4 && (v.lead.phone ?? '').includes(digits)))
    .sort((a, b2) => tab === 'chamar'
      ? (fup(a)?.kind === 'responder' ? -1 : 0) - (fup(b2)?.kind === 'responder' ? -1 : 0) || (b2.lead.lastContactAt ?? '').localeCompare(a.lead.lastContactAt ?? '')
      : (b2.lead.lastContactAt ?? b2.lead.firstSeenAt ?? '').localeCompare(a.lead.lastContactAt ?? a.lead.firstSeenAt ?? '') || a.lead.name.localeCompare(b2.lead.name));
  const notLeads = leads.data.filter((l) => !l.deleted && l.stage === 'nao_lead').length;
  async function contacted(l: Lead) {
    await w.update<Lead>('leads', l.id, { lastContactAt: today, lastFromMe: true, followUpAt: undefined, stage: l.stage === 'novo' ? 'em_contato' : l.stage }, `Contato com lead: ${l.name}`);
  }
  async function moveTo(l: Lead, stage: LeadStage) {
    if (l.stage === stage) return;
    await w.update<Lead>('leads', l.id, { stage, ...(stage !== 'perdido' ? { lostReason: undefined } : {}) }, `Lead ${l.name} movido para ${LEAD_STAGES[stage].label}`);
  }
  const lists = [...new Set(b.views.flatMap((v) => [v.lead.list ?? 'Sem lista', ...(v.lead.tags ?? [])]))].sort();

  async function becomeClient(v: LeadView) {
    setErr('');
    try {
      if (v.client) { setSell(clients.byId[v.client.id] ?? null); return; }
      const id = await w.create<Partial<Client>>('clients', {
        name: v.lead.name, phone: v.lead.phone, email: v.lead.email, status: 'rascunho', channelId: v.lead.channelId,
        notes: `Veio dos leads${v.lead.list ? ` (${v.lead.list})` : ''}.`,
      }, `Lead virou cadastro de cliente: ${v.lead.name}`);
      await w.update<Lead>('leads', v.lead.id, { clientId: id }, `Lead ligado à cliente: ${v.lead.name}`);
      setSell({ id, name: v.lead.name, phone: v.lead.phone, email: v.lead.email, status: 'rascunho', createdAt: Date.now(), updatedAt: Date.now() } as Client);
    } catch (e) { console.error(e); setErr('Não foi possível criar o cadastro.'); }
  }

  function exportCSV() {
    download(`leads-${tab}-${todayISO()}.csv`, toCSV([
      ['Nome', 'Telefone', 'E-mail', 'Lista', 'Etiquetas', 'Etapa', 'Entrou em', 'Aluna?'],
      ...filtered.map((v) => [v.lead.name, v.lead.phone ?? '', v.lead.email ?? '', v.lead.list ?? '', (v.lead.tags ?? []).join(', '), LEAD_STAGES[isConverted(v) ? 'convertido' : v.lead.stage].label, v.lead.firstSeenAt ?? '', v.client ? 'sim' : 'não']),
    ]));
  }

  return (
    <div>
      <PageHeader title="Leads" subtitle="Quem já falou com você e ainda não comprou. Quem vira aluna é reconhecida pelo telefone."
        actions={<><Button variant="outline" onClick={exportCSV} disabled={!filtered.length}>Exportar CSV</Button>
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/importar/`} className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm hover:border-gold/60">Importar</a>
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/leads/triagem/`} className="inline-flex h-9 items-center rounded-lg border border-gold/60 bg-gold/10 px-3 text-sm font-medium hover:bg-gold/20">Triagem</a>
          <Button onClick={() => setEdit('new')}>Novo lead</Button></>} />
      <ErrorNote error={leads.error || err} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Leads" value={b.total} sub={`${b.open} em aberto`} />
        <Stat label="Viraram alunas" value={b.converted} tone="good" sub={`conversão ${fmtPct(b.conversion)}`} />
        <Stat label="Tempo até comprar" value={b.avgDaysToConvert === null ? '—' : `${b.avgDaysToConvert} dias`} sub="média, da entrada à 1ª venda" />
        <Stat label="Perdidos" value={b.lost} />
      </div>

      {b.byList.length > 1 && (
        <Card title="Conversão por lista" className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {b.byList.slice(0, 12).map((l) => (
              <button key={l.list} type="button" onClick={() => { setList(list === l.list ? '' : l.list); setTab('todos'); }} className={`rounded-lg border p-3 text-left ${list === l.list ? 'border-gold bg-gold/10' : 'border-line hover:border-gold/50'}`}>
                <div className="flex justify-between text-sm"><span className="font-medium">{l.list}</span><span className="text-mute">{l.converted}/{l.total}</span></div>
                <Progress value={l.rate} tone="good" />
                <div className="mt-1 text-xs text-mute">{fmtPct(l.rate)} viraram alunas</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Tabs value={tab} onChange={(t) => { setTab(t); setLimit(PAGE); }} items={[
        { id: 'chamar', label: `Para chamar hoje (${due.length})` },
        { id: 'funil', label: 'Funil' },
        { id: 'abertos', label: `Em aberto (${b.open})` },
        { id: 'convertidos', label: `Viraram alunas (${b.converted})` },
        { id: 'perdidos', label: `Perdidos (${b.lost})` },
        { id: 'todos', label: `Todos (${b.total})` },
      ]} />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-sm" placeholder="Pesquisar por nome, telefone ou e-mail" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
        <select className="input max-w-xs" value={list} onChange={(e) => setList(e.target.value)}>
          <option value="">Todas as listas</option>
          {lists.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {notLeads > 0 && <p className="mb-2 text-xs text-mute">{notLeads} contato(s) marcados como "não é lead" ficam fora das contas. Para rever, abra a Triagem.</p>}
      {tab === 'funil' && !leads.loading && !clients.loading ? (
        <Board>
          {FUNNEL.map((st) => {
            const col = filtered.filter((v) => (isConverted(v) ? 'convertido' : v.lead.stage) === st);
            return (
              <div key={st} onDragOver={(e) => e.preventDefault()} onDrop={() => { const v = b.views.find((x) => x.lead.id === drag); if (v) moveTo(v.lead, st); setDrag(null); }}
                className={`flex w-64 shrink-0 flex-col rounded-xl border bg-bg/40 p-2 ${drag ? 'border-dashed border-gold/60' : 'border-line'}`}>
                <div className="mb-2 flex items-center justify-between px-1"><span className="text-xs font-semibold uppercase tracking-wide">{LEAD_STAGES[st].label}</span><Badge tone={LEAD_STAGES[st].tone}>{col.length}</Badge></div>
                <div className="flex flex-col gap-2">
                  {col.slice(0, COL_LIMIT).map((v) => {
                    const l = v.lead;
                    const inf = l.influencerId ? infs.byId[l.influencerId] : undefined;
                    return (
                      <div key={l.id} draggable onDragStart={() => setDrag(l.id)} onDragEnd={() => setDrag(null)}
                        className="cursor-grab rounded-lg border border-line bg-panel p-2.5 text-sm hover:border-gold/50 active:cursor-grabbing">
                        <button type="button" className="block w-full truncate text-left font-medium hover:underline" onClick={() => setEdit(l)}>{l.name || fmtPhone(l.phone)}</button>
                        <div className="truncate text-xs text-mute">{fmtPhone(l.phone)}</div>
                        {(l.origin || inf) && <div className="mt-1 flex flex-wrap gap-1">{l.origin && <Badge>{l.origin}</Badge>}{inf && <Badge tone="gold">{inf.name.split(' ')[0]}</Badge>}</div>}
                        <div className="mt-1 text-xs text-mute">{l.lastContactAt ? `último contato ${fmtDate(l.lastContactAt)}` : l.firstSeenAt ? `entrou ${fmtDate(l.firstSeenAt)}` : ''}</div>
                        <select className="mt-1.5 w-full rounded border border-line bg-bg px-1 py-0.5 text-xs" value={isConverted(v) ? 'convertido' : l.stage} onChange={(e) => moveTo(l, e.target.value as LeadStage)} aria-label="Mover para">
                          {FUNNEL.map((x) => <option key={x} value={x}>{LEAD_STAGES[x].label}</option>)}
                        </select>
                      </div>
                    );
                  })}
                  {col.length > COL_LIMIT && <p className="px-1 text-xs text-mute">e mais {col.length - COL_LIMIT}. Use a busca ou a lista para achar.</p>}
                </div>
              </div>
            );
          })}
        </Board>
      ) : leads.loading || clients.loading ? <Spinner /> : filtered.length === 0 ? (
        <Empty title={b.total ? 'Nenhum lead neste filtro' : 'Nenhum lead ainda'} text={b.total ? undefined : 'Importe uma planilha de contatos (ex.: exportação do Waspeed) ou adicione à mão.'} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">Lead</th><th className="th">Lista / etapa</th><th className="th">Último contato</th><th className="th">Situação</th><th className="th">Próximo contato</th><th className="th" /></tr></thead>
            <tbody>
              {filtered.slice(0, limit).map((v) => {
                const l = v.lead;
                const conv = isConverted(v);
                const link = wa(l.phone);
                return (
                  <tr key={l.id} className="border-b border-line/60">
                    <td className="td"><button className="text-left font-medium hover:underline" onClick={() => setEdit(l)}>{l.name || fmtPhone(l.phone)}</button><div className="text-xs text-mute">{fmtPhone(l.phone)}{l.email ? ` · ${l.email}` : ''}</div></td>
                    <td className="td text-sm">{l.list ?? <span className="text-mute">—</span>}{l.originStage && <div className="text-xs text-mute">{l.originStage}</div>}{(l.tags ?? []).length > 0 && <div className="mt-0.5 flex flex-wrap gap-1">{l.tags!.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}</div>}</td>
                    <td className="td text-sm">{l.lastContactAt ? fmtDate(l.lastContactAt) : l.firstSeenAt ? fmtDate(l.firstSeenAt) : '—'}{l.lastFromMe !== undefined && <div className="text-xs text-mute">{l.lastFromMe ? 'você falou por último' : 'ela falou por último'}</div>}</td>
                    <td className="td">
                      <Badge tone={LEAD_STAGES[conv ? 'convertido' : l.stage].tone}>{LEAD_STAGES[conv ? 'convertido' : l.stage].label}</Badge>
                      {v.client && <div><button className="text-xs text-gold hover:underline" onClick={() => setOpenClient(clients.byId[v.client!.id] ?? null)}>{v.client.name}{v.firstSaleAt ? ` · comprou ${fmtDate(v.firstSaleAt)}` : ''}</button></div>}
                    </td>
                    <td className="td text-sm">{(() => { const f = fup(v); if (!f) return <span className="text-mute">—</span>; return <>{f.at ? <span className={f.at <= today ? 'font-medium text-bad' : ''}>{f.at <= today ? 'Hoje' : fmtDate(f.at)}</span> : <span className="text-mute">sem data</span>}<div className="text-xs text-mute">{FUP_LABEL[f.kind]}</div></>; })()}</td>
                    <td className="td"><div className="flex flex-wrap justify-end gap-2">
                      {link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-xs hover:border-gold/60">WhatsApp</a>}
                      {!conv && <Button size="sm" variant="outline" onClick={() => contacted(l)}>Chamei</Button>}
                      {!conv && <Button size="sm" onClick={() => becomeClient(v)}>Lançar venda</Button>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > limit && <div className="p-3 text-center"><Button variant="ghost" onClick={() => setLimit(limit + PAGE)}>Mostrar mais ({filtered.length - limit})</Button></div>}
        </div>
      )}

      {edit && <LeadModal lead={edit === 'new' ? undefined : edit} channels={channels.active} onClose={() => setEdit(null)} />}
      {sell && <SaleForm open onClose={() => setSell(null)} client={clients.byId[sell.id] ?? sell} initialKind="nova" initialChannelId={sell.channelId} />}
      <ClientModal open={!!openClient} onClose={() => setOpenClient(null)} client={openClient ?? undefined} />
    </div>
  );
}

function LeadModal({ lead, channels, onClose }: { lead?: Lead; channels: { id: string; name: string }[]; onClose: () => void }) {
  const w = useWriter();
  const influencers = useInfluencers();
  const { tenant } = useSession();
  const origins = tenant?.origins ?? [];
  const [f, setF] = useState<Partial<Lead>>(lead ?? { stage: 'novo', source: 'manual', firstSeenAt: todayISO() });
  const [err, setErr] = useState('');
  const set = <K extends keyof Lead>(k: K, v: Lead[K]) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setErr('');
    const phone = (f.phone ?? '').replace(/\D/g, '');
    if (!f.name?.trim() && !phone) return setErr('Informe pelo menos o nome ou o telefone.');
    const data = { ...f, name: f.name?.trim() || phone, phone: phone || undefined, email: f.email?.trim().toLowerCase() || undefined, source: f.source ?? 'manual', stage: f.stage ?? 'novo' } as Lead;
    try {
      if (lead) await w.update<Lead>('leads', lead.id, data, `Lead editado: ${data.name}`);
      else await w.create('leads', data, `Lead adicionado: ${data.name}`);
      onClose();
    } catch (e) { console.error(e); setErr('Não foi possível salvar.'); }
  }
  return (
    <Modal open onClose={onClose} wide title={lead ? lead.name || 'Lead' : 'Novo lead'} subtitle={lead ? `Origem: ${lead.source}${lead.list ? ` · ${lead.list}` : ''}` : undefined}
      footer={<>{lead && <Button variant="ghost" className="mr-auto" onClick={async () => { await w.update<Lead>('leads', lead.id, { deleted: true }, `Lead removido: ${lead.name}`); onClose(); }}>Remover</Button>}<Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><input className="input" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="WhatsApp"><input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="(81) 99999-9999" /></Field>
        <Field label="E-mail"><input className="input" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Lista / funil"><input className="input" value={f.list ?? ''} onChange={(e) => set('list', e.target.value)} /></Field>
        <Field label="Etapa">
          <select className="input" value={f.stage ?? 'novo'} onChange={(e) => set('stage', e.target.value as LeadStage)}>
            {(Object.keys(LEAD_STAGES) as LeadStage[]).map((k) => <option key={k} value={k}>{LEAD_STAGES[k].label}</option>)}
          </select>
        </Field>
        <Field label="Canal">
          <select className="input" value={f.channelId ?? ''} onChange={(e) => set('channelId', e.target.value || undefined)}>
            <option value="">—</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Influencer que trouxe" hint="Conta como lead no painel dela.">
          <select className="input" value={f.influencerId ?? ''} onChange={(e) => { set('influencerId', e.target.value || undefined); if (e.target.value && !f.channelId) set('channelId', 'influencer'); }}>
            <option value="">—</option>
            {influencers.data.map((i) => <option key={i.id} value={i.id}>{i.name} (@{i.handle})</option>)}
          </select>
        </Field>
        <Field label="Origem" hint="Link rastreado por onde chegou.">
          <select className="input" value={f.origin ?? ''} onChange={(e) => { const o = origins.find((x) => x.name === e.target.value); set('origin', e.target.value || undefined); if (o?.influencerId && !f.influencerId) set('influencerId', o.influencerId); }}>
            <option value="">—</option>
            {origins.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Próximo follow-up" hint="Deixe vazio para a plataforma sugerir pela conversa."><input type="date" className="input" value={f.followUpAt ?? ''} onChange={(e) => set('followUpAt', e.target.value || undefined)} /></Field>
        <Field label="Entrou em"><input type="date" className="input" value={f.firstSeenAt ?? ''} onChange={(e) => set('firstSeenAt', e.target.value)} /></Field>
        {f.stage === 'perdido' && <Field label="Motivo da perda"><input className="input" value={f.lostReason ?? ''} onChange={(e) => set('lostReason', e.target.value)} /></Field>}
        <Field label="Observação" className="sm:col-span-2"><textarea className="input min-h-[70px]" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
      <ErrorNote error={err} />
    </Modal>
  );
}
