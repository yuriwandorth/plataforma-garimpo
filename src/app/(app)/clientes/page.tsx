'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useChannels, useClients, useMembers, usePlans, download } from '@/lib/hooks';
import { useWriter } from '@/lib/db';
import { fmtBRL, fmtDate, initials, todayISO, toCSV, isActiveClient } from '@/lib/calc';
import type { Client, ClientStatus } from '@/lib/types';
import { useSession } from '@/lib/auth';
import { Avatar, Badge, Button, cx, Empty, ErrorNote, Modal, PageHeader, Spinner } from '@/components/ui';
import { ClientModal, statusTone } from '@/components/ClientModal';

type Filter = ClientStatus | 'excluidos' | 'todos';
const PAGE = 50;

export default function ClientesPage() {
  const { profile } = useSession();
  const clients = useClients();
  const channels = useChannels();
  const members = useMembers();
  const plans = usePlans();
  const w = useWriter();
  const [filter, setFilter] = useState<Filter>('ativo');
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('');
  const [seller, setSeller] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Client | null>(null);
  const [newMode, setNewMode] = useState<'sem-acesso' | 'com-acesso' | null>(null);
  const [chooser, setChooser] = useState(false);
  const today = todayISO();

  const counts = useMemo(() => {
    const live = clients.data.filter((c) => !c.deleted);
    return {
      ativo: live.filter((c) => c.status === 'ativo').length,
      inativo: live.filter((c) => c.status === 'inativo').length,
      cancelado: live.filter((c) => c.status === 'cancelado').length,
      rascunho: live.filter((c) => c.status === 'rascunho').length,
      excluidos: clients.data.filter((c) => c.deleted).length,
      todos: live.length,
    };
  }, [clients.data]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return clients.data.filter((c) => {
      if (filter === 'excluidos' ? !c.deleted : c.deleted) return false;
      if (filter !== 'excluidos' && filter !== 'todos' && c.status !== filter) return false;
      if (s && !c.name.toLowerCase().includes(s) && !(c.email ?? '').includes(s) && !(c.phone ?? '').includes(s)) return false;
      if (channel && c.channelId !== channel) return false;
      if (seller && c.sellerId !== seller) return false;
      if (plan && c.planId !== plan) return false;
      return true;
    });
  }, [clients.data, filter, q, channel, seller, plan]);

  const expired = clients.data.filter((c) => c.status === 'ativo' && !c.deleted && c.endDate && c.endDate < today).length;

  function exportCSV() {
    const rows: (string | number | undefined)[][] = [['Nome', 'E-mail', 'Telefone', 'CPF', 'Situação', 'Teste', 'Plano', 'Início', 'Vencimento', 'Último valor', 'Canal', 'Vendedor', 'Indicado por']];
    list.forEach((c) => rows.push([
      c.name, c.email, c.phone, c.cpf, c.status, c.isTest ? 'sim' : '', c.planName, fmtDate(c.startDate), fmtDate(c.endDate),
      c.lastValue ?? '', channels.byId[c.channelId ?? '']?.name, members.byId[c.sellerId ?? '']?.name, clients.byId[c.referredById ?? '']?.name,
    ]));
    download(`clientes-${today}.csv`, toCSV(rows));
  }

  const chips: { id: Filter; label: string }[] = [
    { id: 'ativo', label: 'Ativos' }, { id: 'inativo', label: 'Inativos' }, { id: 'cancelado', label: 'Cancelados' },
    { id: 'rascunho', label: 'Rascunhos' }, { id: 'todos', label: 'Todos' }, { id: 'excluidos', label: 'Excluídos' },
  ];
  const shown = list.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.ceil(list.length / PAGE);

  return (
    <div>
      <PageHeader
        title="Central de clientes"
        subtitle="Consulte a base, abra um cliente para editar dados, lançar venda e ver indicações."
        actions={<>
          <Button variant="outline" onClick={exportCSV} disabled={!list.length}>Exportar CSV</Button>
          <Button onClick={() => setChooser(true)}>Adicionar cliente</Button>
        </>}
      />
      <ErrorNote error={clients.error} />
      {expired > 0 && (
        <div className="mb-4 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
          {expired} cliente(s) com status Ativo e plano já vencido. Eles não contam como ativos nos indicadores. Veja em <Link className="underline" href="/renovacoes/">Renovações</Link>.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c.id} onClick={() => { setFilter(c.id); setPage(0); }}
            className={cx('rounded-full border px-3 py-1 text-sm', filter === c.id ? 'border-gold bg-gold/15 text-ink' : 'border-line text-mute hover:text-ink')}>
            {c.label} <span className="ml-1 text-xs opacity-70">{counts[c.id]}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <input className="input" placeholder="Buscar por nome, e-mail ou telefone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">Todos os canais</option>
          {channels.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" value={seller} onChange={(e) => setSeller(e.target.value)}>
          <option value="">Todos os vendedores</option>
          {members.sellers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">Todos os planos</option>
          {plans.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {clients.loading ? <Spinner /> : list.length === 0 ? (
        <Empty title="Nenhum cliente aqui" text={clients.data.length ? 'Mude o filtro ou a busca.' : 'Adicione o primeiro cliente, ou carregue dados de exemplo em Configurações para testar.'}
          action={!clients.data.length && <Button onClick={() => setChooser(true)}>Adicionar cliente</Button>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line">
              <th className="th">Cliente</th><th className="th">Plano</th><th className="th">Vendedor</th><th className="th">Valor</th><th className="th">Vencimento</th><th className="th">Situação</th>
              {filter === 'excluidos' && <th className="th" />}
            </tr></thead>
            <tbody>
              {shown.map((c) => {
                const venc = c.endDate && c.endDate < today && c.status === 'ativo';
                return (
                  <tr key={c.id} className="cursor-pointer border-b border-line/60 hover:bg-line/20" onClick={() => setOpen(c)}>
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <Avatar text={initials(c.name)} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{c.name} {c.isTest && <Badge tone="warn">teste</Badge>}</div>
                          <div className="truncate text-xs text-mute">{c.email || 'sem e-mail'}{c.channelId && ` · ${channels.byId[c.channelId]?.name ?? ''}`}</div>
                        </div>
                      </div>
                    </td>
                    <td className="td">{c.planName ?? <span className="text-mute">—</span>}</td>
                    <td className="td text-mute">{members.byId[c.sellerId ?? '']?.name ?? 'Sem vendedor'}</td>
                    <td className="td">{c.lastValue ? fmtBRL(c.lastValue) : '—'}</td>
                    <td className={cx('td', venc ? 'text-bad' : '')}>{fmtDate(c.endDate)}</td>
                    <td className="td"><Badge tone={statusTone(c.status)}>{c.status}{c.status === 'ativo' && !isActiveClient(c, today) && !c.isTest ? ' (vencido)' : ''}</Badge></td>
                    {filter === 'excluidos' && (
                      <td className="td" onClick={(e) => e.stopPropagation()}>
                        {profile?.role === 'owner' && <Button size="sm" variant="outline" onClick={() => w.restore('clients', c.id, `Cliente restaurado: ${c.name}`)}>Restaurar</Button>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between p-3 text-xs text-mute">
            <span>{list.length} cliente(s)</span>
            {pages > 1 && (
              <span className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
                {page + 1} de {pages}
                <Button size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Próxima</Button>
              </span>
            )}
          </div>
        </div>
      )}

      <Modal open={chooser} onClose={() => setChooser(false)} title="Adicionar cliente" subtitle="O cliente nasce como rascunho e vira Ativo quando você lança a primeira venda.">
        <div className="space-y-2">
          <button className="card block w-full p-4 text-left hover:border-gold" onClick={() => { setChooser(false); setNewMode('sem-acesso'); }}>
            <div className="font-medium">Rascunho sem acesso ao app</div>
            <div className="text-sm text-mute">O e-mail continua opcional.</div>
          </button>
          <button className="card block w-full p-4 text-left hover:border-gold" onClick={() => { setChooser(false); setNewMode('com-acesso'); }}>
            <div className="font-medium">Rascunho com envio de acesso</div>
            <div className="text-sm text-mute">O e-mail é obrigatório.</div>
          </button>
        </div>
      </Modal>
      <ClientModal open={!!newMode} onClose={() => setNewMode(null)} initialDraft={newMode ?? undefined} />
      <ClientModal open={!!open} onClose={() => setOpen(null)} client={open ? clients.byId[open.id] ?? open : undefined} />
    </div>
  );
}
