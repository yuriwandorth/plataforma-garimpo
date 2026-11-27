'use client';
import { useMemo, useState } from 'react';
import { where } from 'firebase/firestore';
import { useCollection, useWriter } from '@/lib/db';
import { useChannels, useMembers, download } from '@/lib/hooks';
import { daysInMonth, fmtBRL, fmtBRL2, fmtDate, iso, parts, todayISO, toCSV, totals } from '@/lib/calc';
import type { Sale, SaleStatus } from '@/lib/types';
import { PERIOD_LABEL } from '@/lib/types';
import { useSession } from '@/lib/auth';
import { Badge, Button, Empty, ErrorNote, PageHeader, Spinner, Stat } from '@/components/ui';
import { MonthPicker } from '@/components/MonthPicker';
import { SaleForm } from '@/components/SaleForm';

export default function VendasPage() {
  const { profile } = useSession();
  const today = todayISO();
  const t = parts(today);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const start = iso(ym.y, ym.m, 1);
  const end = iso(ym.y, ym.m, daysInMonth(ym.y, ym.m));
  const sales = useCollection<Sale>('sales', [where('date', '>=', start), where('date', '<=', end)], `${start}`);
  const channels = useChannels();
  const members = useMembers();
  const w = useWriter();
  const [status, setStatus] = useState<SaleStatus | ''>('');
  const [channel, setChannel] = useState('');
  const [seller, setSeller] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<{ sale?: Sale } | null>(null);

  const list = useMemo(() => sales.data
    .filter((s) => (!status || s.status === status) && (!channel || s.channelId === channel) && (!seller || s.sellerId === seller)
      && (!q || s.clientName.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)), [sales.data, status, channel, seller, q]);
  const tot = totals(list);
  const pend = list.filter((s) => s.status === 'pendente').reduce((a, s) => a + s.gross, 0);
  const renew = list.filter((s) => s.status === 'aprovada' && !s.isTest && s.isRenewal).length;

  function exportCSV() {
    const rows: (string | number)[][] = [['Data', 'Cliente', 'Plano', 'Período', 'Bruto', 'Taxas', 'Líquido', 'Situação', 'Renovação', 'Canal', 'Vendedor', 'Pagamento', 'Parcelas', 'Início', 'Vencimento', 'Teste']];
    list.forEach((s) => rows.push([fmtDate(s.date), s.clientName, s.planName, PERIOD_LABEL[s.period], s.gross, s.fees, s.gross - s.fees, s.status,
      s.isRenewal ? 'sim' : 'não', channels.byId[s.channelId ?? '']?.name ?? '', members.byId[s.sellerId ?? '']?.name ?? '', s.paymentMethod,
      s.installments, fmtDate(s.startDate), fmtDate(s.endDate), s.isTest ? 'sim' : ''] as (string | number)[]));
    download(`vendas-${ym.y}-${String(ym.m).padStart(2, '0')}.csv`, toCSV(rows));
  }

  return (
    <div>
      <PageHeader title="Vendas" subtitle="Lançamento manual por enquanto. Com o checkout integrado (Fase 2), as vendas entram sozinhas."
        actions={<>
          <Button variant="outline" onClick={exportCSV} disabled={!list.length}>Exportar CSV</Button>
          <Button onClick={() => setForm({})}>Lançar venda</Button>
        </>} />
      <ErrorNote error={sales.error} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <MonthPicker y={ym.y} m={ym.m} onChange={(y, m) => setYm({ y, m })} />
        <input className="input max-w-[14rem]" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input max-w-[10rem]" value={status} onChange={(e) => setStatus(e.target.value as SaleStatus | '')}>
          <option value="">Todas situações</option><option value="aprovada">Aprovadas</option><option value="pendente">Pendentes</option><option value="estornada">Estornadas</option>
        </select>
        <select className="input max-w-[12rem]" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">Todos os canais</option>{channels.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input max-w-[12rem]" value={seller} onChange={(e) => setSeller(e.target.value)}>
          <option value="">Todos os vendedores</option>{members.sellers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Vendas aprovadas" value={tot.count} sub={`${renew} renovação(ões)`} />
        <Stat label="Total vendido" value={fmtBRL(tot.gross)} />
        <Stat label="Taxas" value={fmtBRL(tot.fees)} />
        <Stat label="Líquido" value={fmtBRL(tot.net)} />
        <Stat label="Pendente" value={fmtBRL(pend)} sub="não entra nos indicadores" />
      </div>
      {sales.loading ? <Spinner /> : list.length === 0 ? <Empty title="Nenhuma venda neste filtro" text="Mude o mês ou os filtros." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line">
              <th className="th">Data</th><th className="th">Cliente</th><th className="th">Plano</th><th className="th">Canal</th><th className="th">Vendedor</th><th className="th">Valor</th><th className="th">Situação</th><th className="th" />
            </tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b border-line/60">
                  <td className="td">{fmtDate(s.date)}</td>
                  <td className="td font-medium">{s.clientName} {s.isTest && <Badge tone="warn">teste</Badge>}</td>
                  <td className="td">{s.planName} {s.isRenewal && <Badge tone="gold">renovação</Badge>}</td>
                  <td className="td text-mute">{channels.byId[s.channelId ?? '']?.name ?? '—'}</td>
                  <td className="td text-mute">{members.byId[s.sellerId ?? '']?.name ?? '—'}</td>
                  <td className="td">{fmtBRL2(s.gross)}{s.fees > 0 && <div className="text-xs text-mute">taxa {fmtBRL2(s.fees)}</div>}</td>
                  <td className="td"><Badge tone={s.status === 'aprovada' ? 'good' : s.status === 'pendente' ? 'warn' : 'bad'}>{s.status}</Badge></td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setForm({ sale: s })}>Editar</Button>
                      {profile?.role === 'owner' && (
                        <Button size="sm" variant="ghost" onClick={() => {
                          if (confirm(`Apagar de vez a venda de ${s.clientName} (${fmtBRL2(s.gross)})? Para devolução, prefira marcar como estornada.`)) {
                            w.hardDelete('sales', s.id, `Venda apagada: ${s.clientName} · ${s.planName} · ${fmtBRL2(s.gross)}`);
                          }
                        }}>Apagar</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SaleForm open={!!form} onClose={() => setForm(null)} sale={form?.sale} />
    </div>
  );
}
