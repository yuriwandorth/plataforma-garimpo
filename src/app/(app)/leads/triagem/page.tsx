'use client';
// Triagem de leads: um contato por vez, uma tecla por decisão.
// L = é lead · A = é aluna · E = ex-aluna · N = não é lead · Espaço = pular · Z = desfazer
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCollection, useWriter } from '@/lib/db';
import { useClients } from '@/lib/hooks';
import { fmtBRL, fmtDate, todayISO } from '@/lib/calc';
import { matchClient, phoneKey, type Lead } from '@/lib/leads';
import { useSession } from '@/lib/auth';
import { cleanSlug, originSlug } from '@/lib/tracking';
import { CHURN_REASONS, suggestedRecall, type ChurnReason } from '@/lib/retention';
import type { Client } from '@/lib/types';
import { Badge, Button, Card, Empty, PageHeader, Spinner, Stat } from '@/components/ui';

type Decision = 'lead' | 'aluna' | 'ex' | 'nao';
interface Undo { lead: Lead; client?: { id: string; created: boolean; prev?: Partial<Client> } }

const fmtPhone = (p?: string) => {
  const d = (p ?? '').replace(/\D/g, '');
  const br = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d;
  if (br.length === 11) return `(${br.slice(0, 2)}) ${br.slice(2, 7)}-${br.slice(7)}`;
  if (br.length === 10) return `(${br.slice(0, 2)}) ${br.slice(2, 6)}-${br.slice(6)}`;
  return d ? `+${d}` : '—';
};
const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isGarimpeira = (l: Lead) => /garimp/i.test(l.name) || /garimpo (br|ext)|novo aluno|plano suspenso|ex-alun|inativ|suporte/i.test([l.list, ...(l.tags ?? [])].join(' '));

export default function TriagemPage() {
  const leads = useCollection<Lead>('leads');
  const clients = useClients();
  const w = useWriter();
  const today = todayISO();
  const [list, setList] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const [history, setHistory] = useState<Undo[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string>('');
  const [reason, setReason] = useState<ChurnReason | ''>('');
  const [done, setDone] = useState(0);
  const { tenant } = useSession();
  const origins = tenant?.origins ?? [];
  const [originId, setOriginId] = useState('');
  const [code, setCode] = useState('');
  const shownOrigins = useMemo(() => { const c = cleanSlug(code); return c ? origins.filter((o) => originSlug(o).includes(c) || cleanSlug(o.name).includes(c)) : origins; }, [code, origins]);

  // fila: quem ainda não foi revisado nem virou aluna; primeiro quem parece aluna/ex-aluna, depois sem etiqueta
  const queue = useMemo(() => leads.data
    .filter((l) => !l.deleted && !l.reviewedAt && l.stage !== 'convertido' && l.stage !== 'nao_lead' && !l.clientId && !matchClient(l, clients.data))
    .filter((l) => !list || (l.list ?? 'Sem lista') === list || (l.tags ?? []).includes(list))
    .filter((l) => !skipped.includes(l.id))
    .sort((a, b) => Number(isGarimpeira(b)) - Number(isGarimpeira(a)) || Number(/sem etiqueta/i.test(b.list ?? '')) - Number(/sem etiqueta/i.test(a.list ?? '')) || (b.lastContactAt ?? '').localeCompare(a.lastContactAt ?? '')),
  [leads.data, clients.data, list, skipped]);
  const lists = useMemo(() => [...new Set(leads.data.filter((l) => !l.deleted).flatMap((l) => [l.list ?? 'Sem lista', ...(l.tags ?? [])]))].sort(), [leads.data]);
  const cur = queue[0];

  // sugestões de aluna para ligar (nome parecido)
  const suggestions = useMemo(() => {
    if (!cur) return [];
    const term = norm(q || cur.name.replace(/garimpeir[oa]/i, '')).split(/\s+/).filter((x) => x.length > 1);
    if (!term.length) return [];
    return clients.data.filter((c) => !c.deleted && term.every((t) => norm(c.name).includes(t))).slice(0, 6);
  }, [cur, q, clients.data]);

  useEffect(() => { setQ(''); setPick(''); setReason(''); setOriginId(cur?.origin ? origins.find((o) => o.name === cur.origin)?.id ?? '' : ''); setCode(''); }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = origins.find((o) => o.id === originId);
  useEffect(() => { if (suggestions.length === 1 && !pick) setPick(suggestions[0].id); }, [suggestions, pick]);

  async function decide(d: Decision) {
    if (!cur || busy) return;
    setBusy(true);
    const undo: Undo = { lead: cur };
    try {
      if (d === 'lead') {
        await w.update<Lead>('leads', cur.id, {
          reviewedAt: today,
          ...(chosen ? { origin: chosen.name, ...(chosen.influencerId ? { influencerId: chosen.influencerId, channelId: cur.channelId ?? 'influencer' } : {}) } : {}),
        }, `Triagem: ${cur.name} é lead${chosen ? ` (origem ${chosen.name})` : ''}`);
      } else if (d === 'nao') {
        await w.update<Lead>('leads', cur.id, { reviewedAt: today, stage: 'nao_lead' }, `Triagem: ${cur.name} não é lead`);
      } else {
        // aluna ou ex-aluna: liga a uma ficha existente ou cria uma
        let clientId = pick || undefined;
        const phone = (cur.phone ?? '').replace(/\D/g, '');
        if (clientId) {
          const c = clients.byId[clientId];
          const data: Partial<Client> = {};
          if (!c.phone && phone) data.phone = phone;
          if (d === 'ex' && c.status === 'ativo') data.status = 'inativo';
          if (d === 'ex' && reason) data.outcome = { cycleEnd: c.endDate ?? today, status: 'nao_renovou', reason, decidedAt: today };
          if (d === 'ex' && !c.recall) data.recall = { attempts: 0, nextAt: suggestedRecall({ status: 'nao_renovou', reason: reason || undefined }, today) };
          undo.client = { id: clientId, created: false, prev: { phone: c.phone, status: c.status, outcome: c.outcome, recall: c.recall } };
          if (Object.keys(data).length) await w.update<Client>('clients', clientId, data, `Triagem: ficha de ${c.name} atualizada`);
        } else {
          clientId = await w.create<Partial<Client>>('clients', {
            name: cur.name.replace(/\s*garimpeir[oa]\s*/i, ' ').trim() || fmtPhone(cur.phone), phone, email: cur.email,
            status: d === 'ex' ? 'inativo' : 'ativo', channelId: cur.channelId,
            notes: `${d === 'ex' ? 'Ex-aluna' : 'Aluna'} identificada na triagem de leads${cur.list ? ` (lista ${cur.list})` : ''}. Sem histórico de vendas na plataforma.`,
            ...(d === 'ex' ? { recall: { attempts: 0, nextAt: suggestedRecall({ status: 'nao_renovou', reason: reason || undefined }, today) } } : {}),
            ...(d === 'ex' && reason ? { outcome: { cycleEnd: today, status: 'nao_renovou' as const, reason, decidedAt: today } } : {}),
          }, `Triagem: ${d === 'ex' ? 'ex-aluna' : 'aluna'} ${cur.name} cadastrada`);
          undo.client = { id: clientId, created: true };
        }
        await w.update<Lead>('leads', cur.id, { reviewedAt: today, stage: 'convertido', clientId }, `Triagem: ${cur.name} é ${d === 'ex' ? 'ex-aluna' : 'aluna'}`);
      }
      setHistory((h) => [undo, ...h].slice(0, 20));
      setDone((n) => n + 1);
    } catch (e) { console.error(e); }
    setBusy(false);
  }

  async function undoLast() {
    const u = history[0];
    if (!u || busy) return;
    setBusy(true);
    try {
      await w.update<Lead>('leads', u.lead.id, { reviewedAt: undefined, stage: u.lead.stage, clientId: u.lead.clientId }, `Triagem desfeita: ${u.lead.name}`);
      if (u.client?.created) await w.update<Client>('clients', u.client.id, { deleted: true }, 'Triagem desfeita: ficha removida');
      else if (u.client?.prev) await w.update<Client>('clients', u.client.id, u.client.prev, 'Triagem desfeita: ficha restaurada');
      setHistory((h) => h.slice(1));
      setSkipped((s) => s.filter((x) => x !== u.lead.id));
      setDone((n) => Math.max(0, n - 1));
    } catch (e) { console.error(e); }
    setBusy(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'l') decide('lead');
      else if (k === 'a') decide('aluna');
      else if (k === 'e') decide('ex');
      else if (k === 'n') decide('nao');
      else if (k === ' ') { e.preventDefault(); if (cur) setSkipped((s) => [...s, cur.id]); }
      else if (k === 'z') undoLast();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const wa = cur?.phone ? `https://wa.me/${cur.phone.replace(/\D/g, '')}` : null;
  const picked = pick ? clients.byId[pick] : undefined;

  return (
    <div className="max-w-3xl">
      <Link href="/leads/" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-medium hover:border-gold/60">‹ Voltar para Leads</Link>
      <PageHeader title="Triagem de leads" subtitle="Um contato por vez. Decida com uma tecla: L lead · A aluna · E ex-aluna · N não é lead · Espaço pula · Z desfaz." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Na fila" value={queue.length} sub={list ? `lista ${list}` : 'todas as listas'} />
        <Stat label="Feitos agora" value={done} />
        <Stat label="Pulados" value={skipped.length} sub={skipped.length ? 'voltam ao recarregar' : undefined} />
      </div>
      <select className="input mb-4 max-w-xs" value={list} onChange={(e) => setList(e.target.value)}>
        <option value="">Todas as listas (primeiro quem parece aluna)</option>
        {lists.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>

      {leads.loading || clients.loading ? <Spinner /> : !cur ? (
        <Empty title="Fila vazia" text="Todos os contatos desta lista já foram revisados." />
      ) : (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">{/[a-zà-ú]/i.test(cur.name) ? cur.name : fmtPhone(cur.phone)}</div>
              <div className="text-sm text-mute">{fmtPhone(cur.phone)}{cur.email ? ` · ${cur.email}` : ''}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {cur.list && <Badge tone="gold">{cur.list}</Badge>}
                {(cur.tags ?? []).map((t) => <Badge key={t}>{t}</Badge>)}
              </div>
              <div className="mt-2 text-xs text-mute">
                {cur.lastContactAt ? `Última conversa: ${fmtDate(cur.lastContactAt)}${cur.lastFromMe === undefined ? '' : cur.lastFromMe ? ' · você falou por último' : ' · ela falou por último'}` : 'Sem data de conversa'}
              </div>
            </div>
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm hover:border-gold/60">Abrir no WhatsApp</a>}
          </div>

          <div className="mt-4 rounded-lg border border-line p-3">
            <div className="mb-2 text-xs font-medium text-mute">Se for aluna ou ex-aluna, ligar a qual ficha? (vazio = cria uma nova)</div>
            <input className="input mb-2" placeholder="Buscar aluna pelo nome" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {suggestions.map((c) => (
                <button key={c.id} type="button" onClick={() => setPick(pick === c.id ? '' : c.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-xs ${pick === c.id ? 'border-gold bg-gold/10' : 'border-line hover:border-gold/50'}`}>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-mute">{c.status} · {c.planName ?? 'sem plano'}{c.lastValue ? ` · ${fmtBRL(c.lastValue)}` : ''}{c.phone && phoneKey(c.phone) !== phoneKey(cur.phone) ? ' · outro telefone' : ''}</div>
                </button>
              ))}
              {!suggestions.length && <span className="text-xs text-mute">Nenhuma ficha com esse nome.</span>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-mute">Se for ex-aluna, motivo da saída (opcional):</span>
              <select className="input w-auto py-1 text-xs" value={reason} onChange={(e) => setReason(e.target.value as ChurnReason | '')}>
                <option value="">—</option>
                {(Object.keys(CHURN_REASONS) as ChurnReason[]).map((k) => <option key={k} value={k}>{CHURN_REASONS[k].label}</option>)}
              </select>
            </div>
          </div>

          {origins.length > 0 && (
            <div className="mt-3 rounded-lg border border-line p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-mute">Chegou por qual link? (a mensagem pronta traz o "cód.")</span>
                <input className="input w-36 py-1 text-xs" placeholder="digite o cód." value={code} onChange={(e) => { setCode(e.target.value); const c = cleanSlug(e.target.value); const hit = c && origins.filter((o) => originSlug(o) === c); if (hit && hit.length === 1) setOriginId(hit[0].id); }} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {shownOrigins.map((o) => (
                  <button key={o.id} type="button" onClick={() => setOriginId(originId === o.id ? '' : o.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${originId === o.id ? 'border-gold bg-gold/10 font-semibold' : 'border-line hover:border-gold/50'}`}>{o.name}</button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <Button onClick={() => decide('lead')} disabled={busy}><b className="mr-1">L</b> É lead{chosen ? ` · ${chosen.name}` : ''}</Button>
            <Button variant="outline" onClick={() => decide('aluna')} disabled={busy}><b className="mr-1">A</b> Aluna{picked ? `: ${picked.name.split(' ')[0]}` : ' (nova ficha)'}</Button>
            <Button variant="outline" onClick={() => decide('ex')} disabled={busy}><b className="mr-1">E</b> Ex-aluna{picked ? `: ${picked.name.split(' ')[0]}` : ''}</Button>
            <Button variant="ghost" onClick={() => decide('nao')} disabled={busy}><b className="mr-1">N</b> Não é lead</Button>
          </div>
          <div className="mt-2 flex justify-between text-xs text-mute">
            <button type="button" onClick={() => setSkipped((s) => [...s, cur.id])} className="hover:text-ink">Pular (Espaço)</button>
            <button type="button" onClick={undoLast} disabled={!history.length} className="hover:text-ink disabled:opacity-40">Desfazer último (Z){history[0] ? `: ${history[0].lead.name}` : ''}</button>
          </div>
        </Card>
      )}
      <p className="mt-4 text-xs text-mute">Ex-aluna sai das ativas e entra no Recall com a data sugerida pelo motivo. "Não é lead" some das contas e não volta em novas importações. Nada é apagado.</p>
    </div>
  );
}
