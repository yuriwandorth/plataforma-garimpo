'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { where } from 'firebase/firestore';
import { useCollection, useSalesSince } from '@/lib/db';
import { useChannels, useClients } from '@/lib/hooks';
import { useSession } from '@/lib/auth';
import {
  addDays, channelProgress, countable, fmtBRL, fmtDate, fmtPct, isActiveClient, iso, milestoneProgress, MONTHS,
  parts, prevMonth, renewalsDue, salesBetween, todayISO, totals, weekIndex, weekRanges,
} from '@/lib/calc';
import type { ChannelGoal } from '@/lib/types';
import { okrProgress, KR_LABEL, type Activity, type Okr } from '@/lib/manage';
import { useWriter } from '@/lib/db';
import { Badge, Card, Progress, Spinner, Stat } from '@/components/ui';

export default function PainelPage() {
  const { profile, tenant } = useSession();
  const today = todayISO();
  const t = parts(today);
  const pm = prevMonth(t.y, t.m);
  // sem data inicial definida, as conquistas contam todo o histórico
  const milestonesStart = tenant?.milestonesStart || '2000-01-01';
  const since = milestonesStart < iso(pm.y, pm.m, 1) ? milestonesStart : iso(pm.y, pm.m, 1);
  const sales = useSalesSince(since);
  const goals = useCollection<ChannelGoal>('goals', [where('year', '==', t.y), where('month', '==', t.m)], `${t.y}-${t.m}`);
  const clients = useClients();
  const channels = useChannels();
  const okrs = useCollection<Okr>('okrs');
  const acts = useCollection<Activity>('activities');
  const w = useWriter();

  const wi = weekIndex(today);
  const weeks = weekRanges(t.y, t.m);
  const week = weeks[wi];
  const goalBy = useMemo(() => Object.fromEntries(goals.data.map((g) => [g.channelId, g])), [goals.data]);
  const prog = useMemo(
    () => channels.active.map((c) => ({ c, p: channelProgress(c.id, t.y, t.m, sales.data, goalBy[c.id], today) })),
    [channels.active, sales.data, goalBy, today, t.y, t.m],
  );
  const weekGoal = prog.reduce((a, x) => a + x.p.weeks[wi].goalRevenue, 0);
  const weekDone = totals(salesBetween(sales.data, week.start, week.end)).gross
    + goals.data.reduce((a, g) => a + (g.manual?.[wi]?.revenue || 0), 0);
  // Semana passada (pode estar no mês anterior)
  const lastWeekStart = addDays(week.start, -7);
  const lastWeekEnd = addDays(week.start, -1);
  const lastWeek = totals(salesBetween(sales.data, lastWeekStart, lastWeekEnd)).gross;
  const month = totals(sales.data.filter((s) => s.date >= iso(t.y, t.m, 1)));

  const ms = milestoneProgress(sales.data, milestonesStart, tenant?.milestones ?? [50000, 100000, 500000, 1000000]);
  const active = clients.data.filter((c) => isActiveClient(c, today)).length;
  const due = renewalsDue(clients.data, today, 30);
  const drafts = clients.data.filter((c) => !c.deleted && c.status === 'rascunho').length;
  const recent = [...sales.data].filter(countable).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Recife', hour: 'numeric' }).format(new Date()));
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const okr = [...okrs.data].sort((a, b) => b.createdAt - a.createdAt).find((o) => o.status === 'ativo');
  const pending = acts.data.filter((a) => !a.done).sort((a, b) => ((a.due ?? '9999') < (b.due ?? '9999') ? -1 : 1));
  if (sales.loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{hello}, {profile?.name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-mute">
          {MONTHS[t.m - 1]} · semana {wi + 1} ({fmtDate(week.start).slice(0, 5)} a {fmtDate(week.end).slice(0, 5)}) · faturamento do mês {fmtBRL(month.gross)}
        </p>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Seu OKR atual" action={<Link href="/okr/" className="text-xs text-gold hover:underline">{okr ? 'Abrir' : 'Criar OKR'}</Link>}>
          {okr ? (
            <>
              <p className="font-medium">{okr.objective}</p>
              <div className="my-2"><Progress value={okrProgress(okr)} /></div>
              <ul className="space-y-1 text-sm">
                {okr.krs.map((k, i) => (
                  <li key={i} className="flex items-start justify-between gap-3"><span><b className="mr-1 text-mute">KR{i + 1}</b>{k.text}</span>
                    <Badge tone={k.status === 'concluido' ? 'good' : k.status === 'em-andamento' ? 'gold' : 'mute'}>{k.status === 'em-andamento' ? `${k.progress}%` : KR_LABEL[k.status]}</Badge></li>
                ))}
              </ul>
            </>
          ) : <p className="text-sm text-mute">Nenhum OKR ativo. Defina o objetivo dos próximos 90 dias.</p>}
        </Card>
        <Card title={`Atividades a fazer · ${pending.length}`} action={<Link href="/atividades/" className="text-xs text-gold hover:underline">Ver todas</Link>}>
          {pending.length === 0 ? <p className="text-sm text-mute">Nada pendente.</p> : (
            <ul className="space-y-2">
              {pending.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--gold))]" aria-label="Marcar como concluída"
                    onChange={() => w.update<Activity>('activities', a.id, { done: true, doneAt: today }, `Concluída: ${a.title}`)} />
                  <span>{a.title}{a.due && <span className={a.due < today ? 'block text-xs text-bad' : 'block text-xs text-mute'}>até {fmtDate(a.due)}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4 sm:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide text-mute">Meta da semana</div>
            <Link href="/metas/" className="text-xs text-gold hover:underline">Ver canais</Link>
          </div>
          <div className="mt-1 text-2xl font-semibold">{fmtBRL(weekDone)} <span className="text-base font-normal text-mute">/ {fmtBRL(weekGoal)}</span></div>
          <div className="my-2"><Progress value={weekGoal ? weekDone / weekGoal : 0} tone={weekGoal && weekDone >= weekGoal ? 'good' : 'gold'} /></div>
          <div className="text-xs text-mute">
            {weekGoal ? (weekDone >= weekGoal ? 'Meta da semana batida.' : `Faltam ${fmtBRL(weekGoal - weekDone)} esta semana.`) : 'Sem meta para esta semana. Crie em Metas por canal.'}
            {' '}Semana passada: {fmtBRL(lastWeek)}{lastWeek > 0 && ` (esta semana está em ${fmtPct(weekDone / lastWeek)})`}.
          </div>
        </div>
        <Stat label="Clientes ativos" value={active} sub={drafts ? `${drafts} rascunho(s) aguardando venda` : undefined} />
        <Stat label="Renovações em 30 dias" value={due.length} sub={<Link className="text-gold hover:underline" href="/renovacoes/">Abrir lista</Link>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Progresso por canal no mês" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {prog.map(({ c, p }) => (
              <div key={c.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide">{c.name}</span>
                  {p.goalRevenue > 0 && <Badge tone={p.status === 'atrasado' ? 'bad' : p.status === 'batida' ? 'good' : 'gold'}>{fmtPct(p.pct)}</Badge>}
                </div>
                <div className="mt-1 text-sm">{fmtBRL(p.revenue)} <span className="text-mute">/ {p.goalRevenue ? fmtBRL(p.goalRevenue) : 'sem meta'}</span></div>
                <div className="mt-2"><Progress value={p.pct} tone={p.status === 'atrasado' ? 'bad' : p.status === 'batida' ? 'good' : 'gold'} /></div>
                <div className="mt-1 text-xs text-mute">{p.sales} venda(s)</div>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Próxima conquista">
            {ms.next ? (
              <>
                <div className="text-sm"><b>{fmtBRL(ms.total)}</b> <span className="text-mute">de {fmtBRL(ms.next)}</span></div>
                <div className="my-2"><Progress value={ms.pctToNext} /></div>
                <div className="text-xs text-mute">Faltam {fmtBRL(ms.missing)} · {milestonesStart === '2000-01-01' ? 'todo o histórico' : `contando desde ${fmtDate(milestonesStart)}`}</div>
              </>
            ) : <div className="text-sm">Todos os marcos batidos: {fmtBRL(ms.total)}.</div>}
            {ms.reached.length > 0 && <div className="mt-2 text-xs text-good">Conquistado: {ms.reached.map(fmtBRL).join(' · ')}</div>}
          </Card>
          <Card title="Últimas vendas" action={<Link href="/vendas/" className="text-xs text-gold hover:underline">Ver todas</Link>}>
            {recent.length === 0 ? <p className="text-sm text-mute">Nenhuma venda ainda.</p> : (
              <ul className="space-y-2">
                {recent.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{s.clientName}<span className="block text-xs text-mute">{s.planName} · {fmtDate(s.date)}</span></span>
                    <span className="shrink-0 font-medium">{fmtBRL(s.gross)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
