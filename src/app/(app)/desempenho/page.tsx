'use client';
import { useMemo, useState } from 'react';
import { useSalesSince } from '@/lib/db';
import { useChannels, useClients, useMembers } from '@/lib/hooks';
import {
  addMonths, channelKind, delta, fmtBRL, fmtPct, groupRevenue, isActiveClient, iso, MONTHS, MONTHS_SHORT,
  monthlySeries, mrr, newClientsInMonth, parts, prevMonth, salesInMonth, todayISO, totals, upgradeStats, weeklyCompare,
} from '@/lib/calc';
import { Badge, Card, ErrorNote, PageHeader, Progress, Spinner, Stat } from '@/components/ui';
import { MonthPicker } from '@/components/MonthPicker';
import { renewalBoard, type RClient } from '@/lib/retention';
import { BarChart } from '@/components/BarChart';

function cmp(curr: number, prev: number, money = true) {
  const d = delta(curr, prev);
  const base = money ? fmtBRL(prev) : String(prev);
  return { text: d === null ? `mês passado: ${base}` : `${d >= 0 ? '+' : ''}${fmtPct(d)} · ${base} no mês passado`, tone: d === null ? undefined : d >= 0 ? 'good' as const : 'bad' as const };
}
const Delta = ({ v }: { v: number | null }) => (v === null ? <span className="text-mute">—</span> : <span className={v >= 0 ? 'text-good' : 'text-bad'}>{v >= 0 ? '+' : ''}{fmtPct(v)}</span>);

export default function DesempenhoPage() {
  const today = todayISO();
  const t = parts(today);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  // 24 meses: série de 12 meses, ascensão e planos anuais que vencem no mês
  const since = addMonths(iso(ym.y, ym.m, 1), -24);
  const sales = useSalesSince(since);
  const clients = useClients();
  const channels = useChannels();
  const members = useMembers();
  const [showUps, setShowUps] = useState(false);

  const pm = prevMonth(ym.y, ym.m);
  const monthSales = useMemo(() => salesInMonth(sales.data, ym.y, ym.m), [sales.data, ym]);
  const prevSales = useMemo(() => salesInMonth(sales.data, pm.y, pm.m), [sales.data, pm.y, pm.m]);
  const cur = totals(monthSales);
  const prev = totals(prevSales);
  const novos = newClientsInMonth(sales.data, ym.y, ym.m);
  const novosPrev = newClientsInMonth(sales.data, pm.y, pm.m);
  const ativos = useMemo(() => clients.data.filter((c) => isActiveClient(c, today)), [clients.data, today]);
  const series = monthlySeries(sales.data, ym.y, ym.m, 12);
  const yearGross = series.filter((s) => s.y === ym.y).reduce((a, s) => a + s.gross, 0);
  const weeks = weeklyCompare(sales.data, ym.y, ym.m);
  const chName = (id: string) => channels.byId[id]?.name ?? 'Sem canal';

  const byChannel = useMemo(() => {
    const prevBy = Object.fromEntries(groupRevenue(prevSales, (s) => s.channelId ?? '').map((x) => [x.key, x.value]));
    return groupRevenue(monthSales, (s) => s.channelId ?? '').map((x) => ({ ...x, prev: prevBy[x.key] ?? 0 }));
  }, [monthSales, prevSales]);
  const hf = useMemo(() => {
    const g = { hunter: { value: 0, count: 0 }, farmer: { value: 0, count: 0 } };
    byChannel.forEach((x) => { const k = channelKind(channels.byId[x.key], x.key); g[k].value += x.value; g[k].count += x.count; });
    return g;
  }, [byChannel, channels.byId]);
  const hfTotal = hf.hunter.value + hf.farmer.value;
  const plansSold = groupRevenue(monthSales, (s) => s.planName);
  const plansBase = useMemo(() => {
    const g = new Map<string, { count: number; value: number }>();
    ativos.forEach((c) => { const k = c.planName ?? 'Sem plano'; const v = g.get(k) ?? { count: 0, value: 0 }; v.count++; v.value += c.lastValue ?? 0; g.set(k, v); });
    return [...g.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [ativos]);
  const bySeller = groupRevenue(monthSales, (s) => s.sellerId ?? '');
  const rec = mrr(clients.data, today);
  const ren = renewalBoard(clients.data as RClient[], sales.data, ym.y, ym.m, today);
  const ups = useMemo(() => upgradeStats(sales.data), [sales.data]);

  const sNet = cmp(cur.net, prev.net), sCount = cmp(cur.count, prev.count, false), sTicket = cmp(cur.netTicket, prev.netTicket), sNew = cmp(novos, novosPrev, false);

  return (
    <div>
      <PageHeader title="Desempenho" subtitle="Vendas, canais, renovações e recorrência. Clientes de teste ficam de fora."
        actions={<MonthPicker y={ym.y} m={ym.m} onChange={(y, m) => setYm({ y, m })} />} />
      <ErrorNote error={sales.error} />
      {sales.loading ? <Spinner /> : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Faturamento líquido do mês" value={fmtBRL(cur.net)} sub={sNet.text} tone={sNet.tone} />
            <Stat label="Vendas no mês" value={cur.count} sub={sCount.text} tone={sCount.tone} />
            <Stat label="Ticket médio líquido" value={fmtBRL(cur.netTicket)} sub={sTicket.text} tone={sTicket.tone} />
            <Stat label="Clientes ativas" value={ativos.length} sub={`${novos} nova(s) no mês · ${sNew.text}`} tone={sNew.tone} />
          </div>

          <Card title="Evolução do faturamento bruto · 12 meses" action={<span className="text-xs text-mute">Acumulado {ym.y} até {MONTHS_SHORT[ym.m - 1]}: <b className="text-ink">{fmtBRL(yearGross)}</b></span>}>
            <BarChart data={series.map((s) => ({ label: MONTHS_SHORT[s.m - 1], value: s.gross }))} highlight={11} />
          </Card>

          <Card title={`Faturamento líquido de ${MONTHS[ym.m - 1].toLowerCase()} · por semana e por canal`} action={<span className="text-sm"><Delta v={delta(cur.net, prev.net)} /> vs mês passado</span>}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {weeks.map((wk) => (
                <div key={wk.label} className="rounded-lg border border-line p-3">
                  <div className="text-xs font-semibold uppercase text-mute">Semana {wk.label.slice(1)}</div>
                  <div className="mt-1 text-lg font-semibold">{fmtBRL(wk.value)}</div>
                  <div className="text-xs text-mute">{wk.count} venda(s) · mês passado {fmtBRL(wk.prevValue)} · <Delta v={wk.delta} /></div>
                  {wk.worst && <div className="mt-1 text-xs text-bad">Maior queda: {chName(wk.worst.channelId)} ({fmtPct(wk.worst.drop)})</div>}
                </div>
              ))}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-line"><th className="th">Canal</th><th className="th">Tipo</th><th className="th text-right">Receita</th><th className="th text-right">% do mês</th><th className="th text-right">Vendas</th><th className="th text-right">Ticket</th><th className="th text-right">Mês passado</th></tr></thead>
                <tbody>
                  {byChannel.map((x) => {
                    const k = channelKind(channels.byId[x.key], x.key);
                    return (
                      <tr key={x.key} className="border-b border-line/60">
                        <td className="td font-medium">{chName(x.key)}</td>
                        <td className="td"><Badge tone={k === 'farmer' ? 'gold' : 'good'}>{k}</Badge></td>
                        <td className="td text-right">{fmtBRL(x.value)}</td>
                        <td className="td text-right">{fmtPct(x.share)}</td>
                        <td className="td text-right">{x.count}</td>
                        <td className="td text-right">{fmtBRL(x.count ? x.value / x.count : 0)}</td>
                        <td className="td text-right text-mute">{fmtBRL(x.prev)} · <Delta v={delta(x.value, x.prev)} /></td>
                      </tr>
                    );
                  })}
                  {byChannel.length === 0 && <tr><td className="td text-mute" colSpan={7}>Sem vendas no mês.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Mix Hunter × Farmer" action={<span className="text-xs text-mute">aquisição × retenção</span>}>
              <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-line/60">
                <div className="bg-good" style={{ width: `${hfTotal ? (hf.hunter.value / hfTotal) * 100 : 0}%` }} />
                <div className="bg-gold" style={{ width: `${hfTotal ? (hf.farmer.value / hfTotal) * 100 : 0}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs uppercase text-good">Hunter · {fmtPct(hfTotal ? hf.hunter.value / hfTotal : 0)}</div><div className="font-semibold">{fmtBRL(hf.hunter.value)}</div><div className="text-xs text-mute">{hf.hunter.count} venda(s)</div></div>
                <div><div className="text-xs uppercase text-gold">Farmer · {fmtPct(hfTotal ? hf.farmer.value / hfTotal : 0)}</div><div className="font-semibold">{fmtBRL(hf.farmer.value)}</div><div className="text-xs text-mute">{hf.farmer.count} venda(s)</div></div>
              </div>
              <p className="mt-2 text-xs text-mute">O tipo de cada canal se ajusta em Configurações.</p>
            </Card>
            <Card title="Renovações e receita recorrente">
              <div className="grid gap-3 sm:grid-cols-3">
                <div><div className="text-xs uppercase text-mute">MRR estimado</div><div className="text-lg font-semibold">{fmtBRL(rec.value)}</div><div className="text-xs text-mute">{rec.count} clientes · valor mensal pelo período do plano</div></div>
                <div><div className="text-xs uppercase text-mute">A renovar no mês</div><div className="text-lg font-semibold">{ren.aVencer.length + ren.semDecisao.length + ren.negociando.length}</div><div className="text-xs text-mute">em jogo {fmtBRL(ren.receitaEmAberto)} · {ren.perdidas.length} não renovaram ({fmtPct(ren.taxaPerda)})</div></div>
                <div><div className="text-xs uppercase text-mute">Renovadas</div><div className="text-lg font-semibold">{fmtBRL(ren.renovadasValor)}</div><div className="text-xs text-mute">{ren.renovadas.length} renovação(ões) · taxa {fmtPct(ren.taxaRenovacao)}</div></div>
              </div>
            </Card>
          </div>

          <Card title="Taxa de ascensão" action={<span className="text-xs text-mute">renovações e trocas em que a cliente pagou mais</span>}>
            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <div>
                <div className="text-3xl font-semibold">{fmtPct(ups.rate)}</div>
                <div className="text-xs text-mute">{ups.up} de {ups.total} com aumento</div>
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Subiu</span><b className="text-good">{ups.up}</b></div>
                  <div className="flex justify-between"><span>Manteve</span><b>{ups.same}</b></div>
                  <div className="flex justify-between"><span>Caiu</span><b className="text-bad">{ups.down}</b></div>
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase text-mute">Quem subiu de plano</div>
                <ul className="divide-y divide-line">
                  {(showUps ? ups.ups : ups.ups.slice(0, 6)).map((u, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                      <span className="min-w-0"><span className="block truncate">{u.from === u.to ? `${u.to} (mesmo plano)` : `${u.from} → ${u.to}`}</span><span className="block truncate text-xs text-mute">{u.clientName} · {fmtBRL(u.fromValue)} → {fmtBRL(u.toValue)}</span></span>
                      <b className="shrink-0 text-good">+{fmtBRL(u.diff)}</b>
                    </li>
                  ))}
                  {ups.ups.length === 0 && <li className="py-2 text-sm text-mute">Nenhuma ascensão ainda.</li>}
                </ul>
                {ups.ups.length > 6 && <button className="mt-2 text-xs text-gold hover:underline" onClick={() => setShowUps(!showUps)}>{showUps ? 'Mostrar menos' : `Ver todas (${ups.ups.length})`}</button>}
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Base de clientes ativas por plano">
              <ul className="space-y-2">
                {plansBase.map(([k, v]) => (
                  <li key={k} className="text-sm">
                    <div className="flex justify-between"><span>{k}</span><span className="text-mute">{v.count} · {fmtBRL(v.value)}</span></div>
                    <Progress value={ativos.length ? v.count / ativos.length : 0} />
                  </li>
                ))}
                {plansBase.length === 0 && <li className="text-sm text-mute">Nenhuma cliente ativa.</li>}
              </ul>
            </Card>
            <Card title="Planos mais vendidos no mês">
              <ul className="divide-y divide-line">
                {plansSold.map((x) => (
                  <li key={x.key} className="flex justify-between py-1.5 text-sm"><span>{x.key}<span className="block text-xs text-mute">{x.count} venda(s) · {fmtBRL(x.value / x.count)}/venda</span></span><b>{fmtBRL(x.value)}</b></li>
                ))}
                {plansSold.length === 0 && <li className="py-2 text-sm text-mute">Sem vendas no mês.</li>}
              </ul>
            </Card>
            <Card title="Por vendedor">
              <ul className="divide-y divide-line">
                {bySeller.map((x) => (
                  <li key={x.key} className="flex justify-between py-1.5 text-sm"><span>{members.byId[x.key]?.name ?? 'Sem vendedor'}<span className="block text-xs text-mute">{x.count} venda(s) · {fmtPct(x.share)}</span></span><b>{fmtBRL(x.value)}</b></li>
                ))}
                {bySeller.length === 0 && <li className="py-2 text-sm text-mute">Sem vendas no mês.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
