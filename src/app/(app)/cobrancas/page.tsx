'use client';
import { useMemo, useState } from 'react';
import { where } from 'firebase/firestore';
import { useCollection, useWriter } from '@/lib/db';
import { useClients } from '@/lib/hooks';
import { allParts, daysBetween, fmtBRL, fmtBRL2, fmtDate, fmtPct, MONTHS, parts as dparts, receivables, todayISO, type PartRow } from '@/lib/calc';
import type { Sale } from '@/lib/types';
import { Badge, Button, Empty, ErrorNote, PageHeader, Spinner, Stat, Tabs } from '@/components/ui';
import { MonthPicker } from '@/components/MonthPicker';

export default function CobrancasPage() {
  const today = todayISO();
  const t = dparts(today);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const sales = useCollection<Sale>('sales', [where('paymentMode', 'in', ['sinal', 'parcelado'])], 'parts');
  const clients = useClients();
  const w = useWriter();
  const [tab, setTab] = useState<'receber' | 'recebidas' | 'aberto'>('receber');
  const r = useMemo(() => receivables(sales.data, ym.y, ym.m, today), [sales.data, ym, today]);
  const saleBy = useMemo(() => Object.fromEntries(sales.data.map((s) => [s.id, s])), [sales.data]);
  const allOpen = useMemo(() => allParts(sales.data).filter((p) => p.status === 'pendente').sort((a, b) => (a.due < b.due ? -1 : 1)), [sales.data]);

  async function markPaid(p: PartRow) {
    const s = saleBy[p.saleId];
    const parts = s.parts!.map((x, i) => (i === p.index ? { ...x, status: 'pago' as const, paidAt: today } : x));
    await w.update<Sale>('sales', s.id, { parts }, `Parcela ${p.index + 1}/${p.total} recebida: ${s.clientName} · ${fmtBRL2(p.amount)}`);
  }

  const phone = (cid: string) => (clients.byId[cid]?.phone ?? '').replace(/\D/g, '');
  const list: PartRow[] = tab === 'receber' ? r.pending : tab === 'recebidas' ? r.received : allOpen;

  return (
    <div>
      <PageHeader title="Cobranças" subtitle="O que falta receber de quem pagou só uma parte (sinal + restante ou parcelado direto com você)."
        actions={<MonthPicker y={ym.y} m={ym.m} onChange={(y, m) => setYm({ y, m })} />} />
      <ErrorNote error={sales.error} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Parcelas a receber" value={r.pending.length} sub={`pendentes em ${MONTHS[ym.m - 1].toLowerCase()}`} />
        <Stat label="Valor pendente" value={fmtBRL(r.pendingValue)} sub="a receber no mês" />
        <Stat label="Recebido no mês" value={fmtBRL(r.receivedValue)} sub={`${r.received.length} parcela(s)`} />
        <Stat label="Inadimplência" value={fmtPct(r.delinquency)} sub={`${r.overdue.length} vencida(s) · ${fmtBRL(r.overdueValue)}`} tone={r.overdue.length ? 'bad' : undefined} />
        <Stat label="Saldo em aberto" value={fmtBRL(r.openBalance)} sub={`${r.openClients} cliente(s) devendo · todos os meses`} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'receber', label: `A receber no mês (${r.pending.length})` },
        { id: 'recebidas', label: `Recebidas no mês (${r.received.length})` },
        { id: 'aberto', label: `Todo o saldo em aberto (${allOpen.length})` },
      ]} />
      {sales.loading ? <Spinner /> : list.length === 0 ? (
        <Empty title="Nada por aqui" text="Ao lançar uma venda com sinal + restante ou parcelado, as parcelas aparecem nesta tela." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">Cliente</th><th className="th">Parcela</th><th className="th">Vencimento</th><th className="th">Valor</th><th className="th">Contato</th><th className="th" /></tr></thead>
            <tbody>
              {list.map((p) => {
                const left = daysBetween(today, p.due);
                const ph = phone(p.clientId);
                const msg = `Oi, ${p.clientName.split(' ')[0]}! Passando pra lembrar da parcela ${p.index + 1} de ${p.total} (${fmtBRL2(p.amount)}) com vencimento em ${fmtDate(p.due)}.`;
                return (
                  <tr key={`${p.saleId}-${p.index}`} className="border-b border-line/60">
                    <td className="td font-medium">{p.clientName}<div className="text-xs text-mute">{p.planName}</div></td>
                    <td className="td">{p.index + 1} de {p.total}</td>
                    <td className="td">{fmtDate(p.due)}
                      {p.status === 'pendente' ? <div><Badge tone={left < 0 ? 'bad' : left <= 3 ? 'warn' : 'mute'}>{left < 0 ? `Vencido há ${-left}d` : left === 0 ? 'Vence hoje' : `Vence em ${left}d`}</Badge></div>
                        : <div className="text-xs text-good">pago em {fmtDate(p.paidAt)}</div>}</td>
                    <td className="td">{fmtBRL2(p.amount)}</td>
                    <td className="td text-xs">{ph ? <a className="text-gold hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/${ph.length <= 11 ? '55' + ph : ph}?text=${encodeURIComponent(msg)}`}>Enviar mensagem</a> : <span className="text-mute">Sem telefone</span>}</td>
                    <td className="td">{p.status === 'pendente' && <Button size="sm" onClick={() => markPaid(p)}>Marcar recebido</Button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
