'use client';
import { useMemo, useState } from 'react';
import { useSalesSince } from '@/lib/db';
import { useChannels, useClients, useMembers } from '@/lib/hooks';
import {
  addMonths, countable, daysInMonth, delta, fmtBRL, fmtPct, isActiveClient, iso, MONTHS_SHORT, monthlySeries,
  newClientsInMonth, parts, prevMonth, renewalRate, salesInMonth, todayISO, totals,
} from '@/lib/calc';
import { PERIOD_LABEL, type Period } from '@/lib/types';
import { Card, ErrorNote, PageHeader, Spinner, Stat } from '@/components/ui';
import { MonthPicker } from '@/components/MonthPicker';
import { BarChart } from '@/components/BarChart';

function sub(curr: number, prev: number, money = true) {
  const d = delta(curr, prev);
  const base = money ? fmtBRL(prev) : String(prev);
  return { text: d === null ? `mês anterior: ${base}` : `${d >= 0 ? '+' : ''}${fmtPct(d)} · ${base} no mês anterior`, tone: d === null ? undefined : d >= 0 ? 'good' as const : 'bad' as const };
}

export default function DesempenhoPage() {
  const today = todayISO();
  const t = parts(today);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  // 24 meses: cobre a série de 12 meses e os planos anuais que vencem no mês (taxa de renovação)
  const since = addMonths(iso(ym.y, ym.m, 1), -24);
  const sales = useSalesSince(since);
  const clients = useClients();
  const channels = useChannels();
  const members = useMembers();

  const pm = prevMonth(ym.y, ym.m);
  const cur = totals(salesInMonth(sales.data, ym.y, ym.m));
  const prev = totals(salesInMonth(sales.data, pm.y, pm.m));
  const novos = newClientsInMonth(sales.data, ym.y, ym.m);
  const novosPrev = newClientsInMonth(sales.data, pm.y, pm.m);
  const ativos = clients.data.filter((c) => isActiveClient(c, today)).length;
  const series = monthlySeries(sales.data, ym.y, ym.m, 12);
  const ren = renewalRate(sales.data, iso(ym.y, ym.m, 1), iso(ym.y, ym.m, daysInMonth(ym.y, ym.m)));
  const yearGross = sales.data.filter((s) => countable(s) && parts(s.date).y === ym.y && s.date <= iso(ym.y, ym.m, daysInMonth(ym.y, ym.m))).reduce((a, s) => a + s.gross, 0);

  const month = salesInMonth(sales.data, ym.y, ym.m).filter(countable);
  const byChannel = useMemo(() => {
    const g: Record<string, { revenue: number; count: number }> = {};
    month.forEach((s) => { const k = s.channelId ?? ''; g[k] ??= { revenue: 0, count: 0 }; g[k].revenue += s.gross; g[k].count++; });
    return Object.entries(g).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [month]);
  const bySeller = useMemo(() => {
    const g: Record<string, { revenue: number; count: number }> = {};
    month.forEach((s) => { const k = s.sellerId ?? ''; g[k] ??= { revenue: 0, count: 0 }; g[k].revenue += s.gross; g[k].count++; });
    return Object.entries(g).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [month]);
  const byPeriod = useMemo(() => {
    const g: Partial<Record<Period, { revenue: number; count: number }>> = {};
    month.forEach((s) => { g[s.period] ??= { revenue: 0, count: 0 }; g[s.period]!.revenue += s.gross; g[s.period]!.count++; });
    return Object.entries(g) as [Period, { revenue: number; count: number }][];
  }, [month]);

  const sNet = sub(cur.net, prev.net);
  const sCount = sub(cur.count, prev.count, false);
  const sTicket = sub(cur.netTicket, prev.netTicket);
  const sNew = sub(novos, novosPrev, false);

  return (
    <div>
      <PageHeader title="Desempenho" subtitle="Vendas, canais, renovação e evolução do faturamento. Clientes de teste ficam de fora."
        actions={<MonthPicker y={ym.y} m={ym.m} onChange={(y, m) => setYm({ y, m })} />} />
      <ErrorNote error={sales.error} />
      {sales.loading ? <Spinner /> : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Faturamento líquido" value={fmtBRL(cur.net)} sub={sNet.text} tone={sNet.tone} />
            <Stat label="Vendas no mês" value={cur.count} sub={sCount.text} tone={sCount.tone} />
            <Stat label="Ticket médio líquido" value={fmtBRL(cur.netTicket)} sub={sTicket.text} tone={sTicket.tone} />
            <Stat label="Clientes ativos hoje" value={ativos} sub={`${novos} novo(s) no mês · ${sNew.text}`} tone={sNew.tone} />
          </div>

          <Card className="mb-6" title="Faturamento bruto · 12 meses" action={<span className="text-xs text-mute">Acumulado {ym.y} até {MONTHS_SHORT[ym.m - 1]}: <b className="text-ink">{fmtBRL(yearGross)}</b></span>}>
            <BarChart data={series.map((s) => ({ label: MONTHS_SHORT[s.m - 1], value: s.gross }))} highlight={11} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Por canal">
              {byChannel.length === 0 ? <p className="text-sm text-mute">Sem vendas no mês.</p> : (
                <table className="w-full">
                  <tbody>
                    {byChannel.map(([k, v]) => (
                      <tr key={k} className="border-b border-line/60">
                        <td className="td">{channels.byId[k]?.name ?? 'Sem canal'}</td>
                        <td className="td text-right">{fmtBRL(v.revenue)}</td>
                        <td className="td text-right text-mute">{v.count} vd · {fmtPct(cur.gross ? v.revenue / cur.gross : 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card title="Por vendedor">
              {bySeller.length === 0 ? <p className="text-sm text-mute">Sem vendas no mês.</p> : (
                <table className="w-full">
                  <tbody>
                    {bySeller.map(([k, v]) => (
                      <tr key={k} className="border-b border-line/60">
                        <td className="td">{members.byId[k]?.name ?? 'Sem vendedor'}</td>
                        <td className="td text-right">{fmtBRL(v.revenue)}</td>
                        <td className="td text-right text-mute">{v.count} vd</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card title="Renovação e mix de planos">
              <div className="mb-3 text-sm">
                Venceram no mês: <b>{ren.due}</b> · renovaram: <b>{ren.renewed}</b>
                <div className="text-2xl font-semibold">{fmtPct(ren.rate)}</div>
                <div className="text-xs text-mute">renovação até 30 dias antes ou depois do vencimento</div>
              </div>
              <table className="w-full">
                <tbody>
                  {byPeriod.map(([p, v]) => (
                    <tr key={p} className="border-b border-line/60">
                      <td className="td">{PERIOD_LABEL[p]}</td>
                      <td className="td text-right">{v.count} vd</td>
                      <td className="td text-right text-mute">{fmtBRL(v.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
