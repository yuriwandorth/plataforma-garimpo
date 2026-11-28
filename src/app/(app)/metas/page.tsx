'use client';
import { useEffect, useMemo, useState } from 'react';
import { where } from 'firebase/firestore';
import { useCollection, useWriter } from '@/lib/db';
import { useChannels } from '@/lib/hooks';
import {
  channelProgress, countable, daysInMonth, delta, emptyWeeks, fmtBRL, fmtDate, fmtPct, iso, parseMoney, parts,
  prevMonth, todayISO, totals,
} from '@/lib/calc';
import type { Channel, ChannelGoal, Sale, WeekGoal } from '@/lib/types';
import { Badge, Button, Card, ErrorNote, Modal, PageHeader, Progress, Spinner, Stat } from '@/components/ui';
import { MonthPicker } from '@/components/MonthPicker';

const STATUS_TONE = { 'batida': 'good', 'em-dia': 'gold', 'atrasado': 'bad', 'sem-meta': 'mute' } as const;
const STATUS_LABEL = { 'batida': 'Meta batida', 'em-dia': 'Em dia', 'atrasado': 'Atrasado', 'sem-meta': 'Sem meta' };

export default function MetasPage() {
  const today = todayISO();
  const t = parts(today);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const pm = prevMonth(ym.y, ym.m);
  const start = iso(pm.y, pm.m, 1);
  const end = iso(ym.y, ym.m, daysInMonth(ym.y, ym.m));
  const sales = useCollection<Sale>('sales', [where('date', '>=', start), where('date', '<=', end)], start);
  const goals = useCollection<ChannelGoal>('goals', [where('year', '==', ym.y), where('month', '==', ym.m)], `${ym.y}-${ym.m}`);
  const channels = useChannels();
  const [edit, setEdit] = useState<Channel | null>(null);
  const [view, setView] = useState<'com' | 'sem'>('com');

  const goalBy = useMemo(() => Object.fromEntries(goals.data.map((g) => [g.channelId, g])), [goals.data]);
  const progress = useMemo(
    () => channels.active.map((c) => ({ channel: c, p: channelProgress(c.id, ym.y, ym.m, sales.data, goalBy[c.id], today) })),
    [channels.active, ym, sales.data, goalBy, today],
  );

  // Totais do mês (todas as vendas + ajustes manuais)
  const monthSales = sales.data.filter((s) => s.date >= iso(ym.y, ym.m, 1));
  const manual = goals.data.reduce((a, g) => ({
    revenue: a.revenue + (g.manual ?? []).reduce((x, w) => x + (w.revenue || 0), 0),
    sales: a.sales + (g.manual ?? []).reduce((x, w) => x + (w.sales || 0), 0),
  }), { revenue: 0, sales: 0 });
  const mt = totals(monthSales);
  const revenue = mt.gross + manual.revenue;
  const count = mt.count + manual.sales;
  const goalTotal = progress.reduce((a, x) => a + x.p.goalRevenue, 0);
  // Comparação: mês anterior até o mesmo dia
  const isCurrent = ym.y === t.y && ym.m === t.m;
  const dayCut = isCurrent ? t.d : daysInMonth(ym.y, ym.m);
  const prevCut = iso(pm.y, pm.m, Math.min(dayCut, daysInMonth(pm.y, pm.m)));
  const prevRevenue = totals(sales.data.filter((s) => s.date >= start && s.date <= prevCut)).gross;
  const d = delta(revenue, prevRevenue);
  const noChannel = monthSales.filter((s) => countable(s) && !s.channelId);

  const withGoal = progress.filter((x) => x.p.goalRevenue > 0);
  const withoutGoal = progress.filter((x) => x.p.goalRevenue === 0);
  const shown = view === 'com' ? withGoal : withoutGoal;

  return (
    <div>
      <PageHeader title="Metas por canal" subtitle="Meta do mês dividida em 4 semanas. O realizado vem das vendas aprovadas de cada canal, mais ajustes manuais."
        actions={<MonthPicker y={ym.y} m={ym.m} onChange={(y, m) => setYm({ y, m })} />} />
      <ErrorNote error={sales.error || goals.error} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Faturamento do mês" value={fmtBRL(revenue)} sub={d === null ? 'sem base no mês anterior' : `${d >= 0 ? '+' : ''}${fmtPct(d)} vs mesmo período do mês anterior`} tone={d === null ? undefined : d >= 0 ? 'good' : 'bad'} />
        <Stat label="Vendas" value={count} />
        <Stat label="Ticket médio" value={fmtBRL(count ? revenue / count : 0)} />
        <div className="card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-mute">Meta do mês</div>
          <div className="mt-1 text-2xl font-semibold">{fmtBRL(revenue)} <span className="text-base font-normal text-mute">/ {fmtBRL(goalTotal)}</span></div>
          <div className="mt-2"><Progress value={goalTotal ? revenue / goalTotal : 0} tone={goalTotal && revenue >= goalTotal ? 'good' : 'gold'} /></div>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <Button size="sm" variant={view === 'com' ? 'primary' : 'outline'} onClick={() => setView('com')}>Com meta ({withGoal.length})</Button>
        <Button size="sm" variant={view === 'sem' ? 'primary' : 'outline'} onClick={() => setView('sem')}>Sem meta ({withoutGoal.length})</Button>
      </div>

      {sales.loading || goals.loading ? <Spinner /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map(({ channel, p }) => (
            <Card key={channel.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide">{channel.name}</div>
                <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
              </div>
              <div className="mt-2 text-2xl font-semibold">{fmtBRL(p.revenue)}</div>
              <div className="text-xs text-mute">{p.goalRevenue ? `meta ${fmtBRL(p.goalRevenue)} · ${fmtPct(p.pct)}` : 'sem meta definida'}</div>
              <div className="my-3"><Progress value={p.pct} tone={p.status === 'batida' ? 'good' : p.status === 'atrasado' ? 'bad' : 'gold'} /></div>
              <div className="flex justify-between text-xs text-mute">
                <span>Vendas {p.sales}/{p.goalSales}</span>
                <span>Ticket {fmtBRL(p.ticket)}</span>
              </div>
              <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setEdit(channel)}>{p.goalRevenue ? 'Editar meta' : 'Criar meta'}</Button>
            </Card>
          ))}
          {view === 'sem' && withoutGoal.length === 0 && <p className="text-sm text-mute">Todos os canais ativos têm meta neste mês.</p>}
        </div>
      )}
      {noChannel.length > 0 && (
        <p className="mt-4 text-sm text-warn">{noChannel.length} venda(s) aprovada(s) sem canal neste mês ({fmtBRL(totals(noChannel).gross)}). Elas entram no faturamento, mas em nenhuma meta de canal. Edite em Vendas.</p>
      )}
      {edit && (
        <GoalModal channel={edit} y={ym.y} m={ym.m} goal={goalBy[edit.id]}
          progress={progress.find((x) => x.channel.id === edit.id)!.p} onClose={() => setEdit(null)} />
      )}
    </div>
  );
}

function GoalModal({ channel, y, m, goal, progress, onClose }: {
  channel: Channel; y: number; m: number; goal?: ChannelGoal; progress: ReturnType<typeof channelProgress>; onClose: () => void;
}) {
  const w = useWriter();
  const id = `${y}-${String(m).padStart(2, '0')}__${channel.id}`;
  const [weeks, setWeeks] = useState<WeekGoal[]>(goal?.weeks ?? emptyWeeks());
  const [manual, setManual] = useState<WeekGoal[]>(goal?.manual ?? emptyWeeks());
  const [monthly, setMonthly] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => { setWeeks(goal?.weeks ?? emptyWeeks()); setManual(goal?.manual ?? emptyWeeks()); }, [goal]);

  async function persist(nw = weeks, nm = manual) {
    await w.set<Omit<ChannelGoal, 'id'>>('goals', id, { year: y, month: m, channelId: channel.id, weeks: nw as ChannelGoal['weeks'], manual: nm as ChannelGoal['manual'] });
    setSaved(`Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
  }
  const upd = (arr: WeekGoal[], i: number, k: keyof WeekGoal, v: number) => arr.map((x, j) => (j === i ? { ...x, [k]: v } : x));

  function splitMonthly() {
    const total = parseMoney(monthly);
    if (!total) return;
    // divide proporcional aos dias de cada semana
    const days = progress.weeks.map((wk) => parts(wk.end).d - parts(wk.start).d + 1);
    const sum = days.reduce((a, b) => a + b, 0);
    let acc = 0;
    const nw = weeks.map((x, i) => {
      const v = i === 3 ? total - acc : Math.round((total * days[i]) / sum);
      acc += v;
      return { ...x, revenue: v };
    });
    setWeeks(nw); persist(nw, manual);
  }

  const num = (v: number) => (v ? String(v).replace('.', ',') : '');
  return (
    <Modal open onClose={onClose} wide title={`Meta — ${channel.name}`} subtitle="Os valores são salvos sozinhos ao sair do campo."
      footer={<><span className="mr-auto self-center text-xs text-mute">{saved}</span><Button onClick={onClose}>Fechar</Button></>}>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label">Atalho: meta do mês inteiro (R$)</span>
          <input className="input w-44" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="Ex.: 7.000" />
        </label>
        <Button variant="outline" onClick={splitMonthly}>Dividir nas 4 semanas</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              <th className="th">Semana</th><th className="th">Meta receita</th><th className="th">Meta vendas</th>
              <th className="th">Realizado (vendas)</th><th className="th">Ajuste manual R$</th><th className="th">Ajuste vendas</th><th className="th">Total</th>
            </tr>
          </thead>
          <tbody>
            {progress.weeks.map((wk, i) => {
              const auto = wk.revenue - (manual[i]?.revenue || 0);
              const autoCount = wk.sales - (manual[i]?.sales || 0);
              return (
                <tr key={wk.label} className="border-b border-line/60">
                  <td className="td"><b>{wk.label}</b> <span className="text-xs text-mute">{fmtDate(wk.start).slice(0, 5)} → {fmtDate(wk.end).slice(0, 5)}</span></td>
                  <td className="td"><input className="input w-28" defaultValue={num(weeks[i].revenue)} key={`r${i}${weeks[i].revenue}`}
                    onBlur={(e) => { const nw = upd(weeks, i, 'revenue', parseMoney(e.target.value)); setWeeks(nw); persist(nw, manual); }} /></td>
                  <td className="td"><input className="input w-20" type="number" min={0} defaultValue={weeks[i].sales || ''} key={`s${i}${weeks[i].sales}`}
                    onBlur={(e) => { const nw = upd(weeks, i, 'sales', Number(e.target.value) || 0); setWeeks(nw); persist(nw, manual); }} /></td>
                  <td className="td text-mute">{fmtBRL(auto)} · {autoCount} vd</td>
                  <td className="td"><input className="input w-28" defaultValue={num(manual[i].revenue)} key={`mr${i}${manual[i].revenue}`}
                    onBlur={(e) => { const nm = upd(manual, i, 'revenue', parseMoney(e.target.value)); setManual(nm); persist(weeks, nm); }} /></td>
                  <td className="td"><input className="input w-20" type="number" min={0} defaultValue={manual[i].sales || ''} key={`ms${i}${manual[i].sales}`}
                    onBlur={(e) => { const nm = upd(manual, i, 'sales', Number(e.target.value) || 0); setManual(nm); persist(weeks, nm); }} /></td>
                  <td className="td font-medium">{fmtBRL(auto + (manual[i].revenue || 0))}</td>
                </tr>
              );
            })}
            <tr>
              <td className="td font-semibold">Total do mês</td>
              <td className="td font-semibold">{fmtBRL(weeks.reduce((a, x) => a + x.revenue, 0))}</td>
              <td className="td font-semibold">{weeks.reduce((a, x) => a + x.sales, 0)}</td>
              <td className="td" /><td className="td" /><td className="td" />
              <td className="td font-semibold">{fmtBRL(progress.revenue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-mute">Use o ajuste manual só para vendas que não foram lançadas na plataforma; senão o valor conta em dobro.</p>
    </Modal>
  );
}
