'use client';
import { useEffect, useMemo, useState } from 'react';
import { where } from 'firebase/firestore';
import { useCollection, useWriter } from '@/lib/db';
import { useChannels, useClients, useInfluencers, useMembers } from '@/lib/hooks';
import { fmtBRL, fmtBRL2, fmtDate, totals, todayISO, daysBetween, saleKind } from '@/lib/calc';
import type { Client, ClientStatus, Sale, SaleKind } from '@/lib/types';
import { PERIOD_LABEL } from '@/lib/types';
import { useSession } from '@/lib/auth';
import { Badge, Button, Field, Modal, Tabs, Toggle } from './ui';
import { SaleForm } from './SaleForm';

const STATUS: { id: ClientStatus; label: string }[] = [
  { id: 'ativo', label: 'Ativo' },
  { id: 'inativo', label: 'Inativo' },
  { id: 'cancelado', label: 'Cancelado' },
  { id: 'rascunho', label: 'Rascunho' },
];

export const statusTone = (s: ClientStatus) => (s === 'ativo' ? 'good' : s === 'cancelado' ? 'bad' : s === 'rascunho' ? 'gold' : 'mute');

type Tab = 'cadastro' | 'plano' | 'indicacoes';

export function ClientModal({ open, onClose, client, initialDraft }: {
  open: boolean; onClose: () => void; client?: Client; initialDraft?: 'sem-acesso' | 'com-acesso';
}) {
  const w = useWriter();
  const { profile } = useSession();
  const clients = useClients();
  const channels = useChannels();
  const members = useMembers();
  const influencers = useInfluencers();
  const [tab, setTab] = useState<Tab>('cadastro');
  const [f, setF] = useState<Partial<Client>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saleOpen, setSaleOpen] = useState(false);
  const [saleKindOpen, setSaleKindOpen] = useState<SaleKind | undefined>();
  const isNew = !client;

  useEffect(() => {
    if (!open) return;
    setTab('cadastro'); setErr('');
    setF(client ? { ...client } : { status: 'rascunho', sendAppAccess: initialDraft === 'com-acesso', isTest: false });
  }, [open, client, initialDraft]);

  const sales = useCollection<Sale>('sales', client ? [where('clientId', '==', client.id)] : [where('clientId', '==', '__none__')], client?.id ?? 'none');
  const mySales = useMemo(() => [...sales.data].sort((a, b) => (a.date < b.date ? 1 : -1)), [sales.data]);
  const referred = useMemo(() => clients.data.filter((c) => client && c.referredById === client.id && !c.deleted), [clients.data, client]);
  const referredSales = useCollection<Sale>('sales', client ? [where('referredById', '==', client.id)] : [where('referredById', '==', '__none__')], `ref-${client?.id ?? 'none'}`);

  const set = <K extends keyof Client>(k: K, v: Client[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr('');
    const name = (f.name ?? '').trim();
    if (!name) return setErr('Informe o nome.');
    const email = (f.email ?? '').trim().toLowerCase() || undefined;
    if (f.sendAppAccess && !email) return setErr('Para enviar acesso ao app, o e-mail é obrigatório.');
    if (email) {
      const dup = clients.data.find((c) => c.email === email && c.id !== client?.id && !c.deleted);
      if (dup) return setErr(`Já existe um cliente com esse e-mail: ${dup.name}.`);
    }
    setBusy(true);
    try {
      const data: Partial<Client> = {
        name, email, cpf: f.cpf?.trim() || undefined, phone: f.phone?.trim() || undefined,
        status: f.status ?? 'rascunho', isTest: !!f.isTest, sendAppAccess: !!f.sendAppAccess, notes: f.notes?.trim() || undefined,
        channelId: f.channelId || undefined, sellerId: f.sellerId || undefined, referredById: f.referredById || undefined,
        influencerId: f.influencerId || undefined,
      };
      if (isNew) await w.create('clients', data, `Cliente criado: ${name}`);
      else await w.update<Client>('clients', client!.id, data, `Cadastro editado: ${name}`);
      onClose();
    } catch (e) { console.error(e); setErr('Não foi possível salvar.'); } finally { setBusy(false); }
  }

  async function remove() {
    if (!client) return;
    if (!confirm(`Mover ${client.name} para Excluídos? Dá para restaurar depois.`)) return;
    await w.softDelete('clients', client.id, `Cliente excluído: ${client.name}`);
    onClose();
  }

  const t = totals(mySales);
  const today = todayISO();
  const daysLeft = client?.endDate ? daysBetween(today, client.endDate) : null;

  return (
    <>
      <Modal
        open={open && !saleOpen}
        onClose={onClose}
        wide
        title={isNew ? 'Adicionar cliente' : client!.name}
        subtitle={isNew ? (initialDraft === 'com-acesso' ? 'Rascunho com envio de acesso ao app: e-mail obrigatório.' : 'Rascunho sem acesso ao app: o e-mail é opcional.') : 'Dados, plano e indicações em um só lugar.'}
        footer={
          <>
            {!isNew && profile?.role === 'owner' && !client!.deleted && <Button variant="danger" className="mr-auto" onClick={remove}>Excluir cliente</Button>}
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            {tab === 'cadastro' && <Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar cliente'}</Button>}
          </>
        }
      >
        {!isNew && (
          <Tabs<Tab> value={tab} onChange={setTab} items={[
            { id: 'cadastro', label: 'Cadastro' },
            { id: 'plano', label: `Plano e vendas (${mySales.length})` },
            { id: 'indicacoes', label: `Indicações (${referred.length})` },
          ]} />
        )}

        {tab === 'cadastro' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Toggle checked={!!f.isTest} onChange={(v) => set('isTest', v)} label="Cliente de teste"
                hint="Mantém o cadastro, mas não conta em vendas, faturamento, clientes ativos, ticket médio nem renovação." />
            </div>
            <Field label="Nome" className="sm:col-span-2"><input className="input" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label={f.sendAppAccess ? 'E-mail' : 'E-mail (opcional)'} hint="Usado para evitar duplicados."><input className="input" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Telefone / WhatsApp (opcional)"><input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+55 81 9…" /></Field>
            <Field label="CPF (opcional)" hint="Pré-preenche o link de renovação."><input className="input" value={f.cpf ?? ''} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" /></Field>
            <Field label="Situação">
              <select className="input" value={f.status ?? 'rascunho'} onChange={(e) => set('status', e.target.value as ClientStatus)}>
                {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Toggle checked={!!f.sendAppAccess} onChange={(v) => set('sendAppAccess', v)} label="Enviar acesso ao app"
                hint="Fica registrado agora; o envio automático do convite chega com a área da aluna (Fase 2)." />
            </div>
            <div className="sm:col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-mute">Origem e relacionamento</div>
            <Field label="Canal de origem">
              <select className="input" value={f.channelId ?? ''} onChange={(e) => set('channelId', e.target.value)}>
                <option value="">Sem canal</option>
                {channels.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Vendedor">
              <select className="input" value={f.sellerId ?? ''} onChange={(e) => set('sellerId', e.target.value)}>
                <option value="">Sem vendedor</option>
                {members.sellers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Influencer">
              <select className="input" value={f.influencerId ?? ''} onChange={(e) => set('influencerId', e.target.value)}>
                <option value="">Nenhuma</option>
                {influencers.data.filter((i) => i.stage === 'fechado' || i.id === f.influencerId).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
            <Field label="Indicado por">
              <select className="input" value={f.referredById ?? ''} onChange={(e) => set('referredById', e.target.value)}>
                <option value="">Ninguém</option>
                {clients.data.filter((c) => !c.deleted && c.id !== client?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Observação" className="sm:col-span-2"><textarea className="input" rows={3} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
          </div>
        )}

        {tab === 'plano' && client && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="card p-3"><div className="text-xs text-mute">Plano vigente</div><div className="mt-1 font-semibold">{client.planName ?? '—'}</div></div>
              <div className="card p-3"><div className="text-xs text-mute">Vencimento</div><div className="mt-1 font-semibold">{fmtDate(client.endDate)}</div>
                {daysLeft !== null && <div className={daysLeft < 0 ? 'text-xs text-bad' : daysLeft <= 30 ? 'text-xs text-warn' : 'text-xs text-mute'}>{daysLeft < 0 ? `venceu há ${-daysLeft} dias` : `${daysLeft} dias restantes`}</div>}
              </div>
              <div className="card p-3"><div className="text-xs text-mute">Total pago</div><div className="mt-1 font-semibold">{fmtBRL(t.gross)}</div></div>
              <div className="card p-3"><div className="text-xs text-mute">Compras</div><div className="mt-1 font-semibold">{t.count}</div></div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {client.planId && <Button variant="outline" onClick={() => { setSaleKindOpen('troca'); setSaleOpen(true); }}>Trocar de plano (no meio do ciclo)</Button>}
              {client.planId && <Button variant="outline" onClick={() => { setSaleKindOpen('renovacao'); setSaleOpen(true); }}>Renovar</Button>}
              <Button onClick={() => { setSaleKindOpen(client.planId ? undefined : 'nova'); setSaleOpen(true); }}>Lançar venda</Button>
            </div>
            {mySales.length === 0 ? <p className="text-sm text-mute">Nenhuma venda ainda.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-line"><th className="th">Data</th><th className="th">Plano</th><th className="th">Período</th><th className="th">Vigência</th><th className="th">Valor</th><th className="th">Situação</th></tr></thead>
                  <tbody>
                    {mySales.map((s) => (
                      <tr key={s.id} className="border-b border-line/60">
                        <td className="td">{fmtDate(s.date)}</td>
                        <td className="td">{s.planName}{saleKind(s) !== 'nova' && <span className="ml-1"><Badge tone="gold">{saleKind(s) === 'troca' ? 'troca de plano' : 'renovação'}</Badge></span>}
                          {s.prevPlanName && <div className="text-xs text-mute">antes: {s.prevPlanName}</div>}
                          {s.parts && s.parts.length > 0 && <div className="text-xs text-mute">{s.paymentMode === 'sinal' ? 'sinal + restante' : 'parcelado'} · {s.parts.filter((p) => p.status === 'pago').length}/{s.parts.length} pagas · falta {fmtBRL2(s.parts.filter((p) => p.status === 'pendente').reduce((a, p) => a + p.amount, 0))}</div>}</td>
                        <td className="td">{PERIOD_LABEL[s.period]}</td>
                        <td className="td text-mute">{fmtDate(s.startDate)} → {fmtDate(s.endDate)}</td>
                        <td className="td">{fmtBRL(s.gross)}</td>
                        <td className="td"><Badge tone={s.status === 'aprovada' ? 'good' : s.status === 'pendente' ? 'warn' : 'bad'}>{s.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'indicacoes' && client && (
          <div>
            <p className="mb-3 text-sm text-mute">
              {referred.length} pessoa(s) indicada(s) · receita gerada: <b className="text-ink">{fmtBRL(totals(referredSales.data).gross)}</b>
            </p>
            {referred.length === 0 ? <p className="text-sm text-mute">Ninguém indicado por este cliente ainda.</p> : (
              <ul className="divide-y divide-line">
                {referred.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{c.name}</span>
                    <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {err && <p className="mt-3 text-sm text-bad">{err}</p>}
      </Modal>
      {client && <SaleForm open={saleOpen} onClose={() => setSaleOpen(false)} client={client} clientSales={mySales} initialKind={saleKindOpen} />}
    </>
  );
}
