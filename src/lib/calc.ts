// Regras de cálculo dos indicadores. Funções puras: fáceis de testar (tests/calc.test.ts).
import type { Channel, ChannelGoal, Client, Part, Period, Sale, SaleKind, WeekGoal } from './types';
import { PERIOD_MONTHS } from './types';

export const TZ = 'America/Recife';

/** Hoje no fuso de Recife, YYYY-MM-DD */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Soma meses mantendo o dia (ajusta para o último dia quando o mês é menor) */
export function addMonths(date: string, n: number): string {
  const { y, m, d } = parts(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Vencimento do plano: início + período − 1 dia (ex.: 01/01 trimestral vence 31/03) */
export function planEndDate(start: string, period: Period): string {
  return addDays(addMonths(start, PERIOD_MONTHS[period]), -1);
}

export function daysBetween(a: string, b: string): number {
  const pa = parts(a), pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** Semanas do mês: S1 1–7, S2 8–14, S3 15–21, S4 22–fim */
export function weekRanges(y: number, m: number): { start: string; end: string; label: string }[] {
  const last = daysInMonth(y, m);
  const bounds: [number, number][] = [[1, 7], [8, 14], [15, 21], [22, last]];
  return bounds.map(([a, b], i) => ({ start: iso(y, m, a), end: iso(y, m, b), label: `S${i + 1}` }));
}

/** Índice 0..3 da semana do mês de uma data */
export function weekIndex(date: string): number {
  const { d } = parts(date);
  return d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3;
}

export function sameMonth(date: string, y: number, m: number): boolean {
  const p = parts(date);
  return p.y === y && p.m === m;
}

export function prevMonth(y: number, m: number): { y: number; m: number } {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

export function nextMonth(y: number, m: number): { y: number; m: number } {
  return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
}

/** Só vendas aprovadas de clientes reais entram em qualquer indicador */
export function countable(s: Sale): boolean {
  return s.status === 'aprovada' && !s.isTest;
}

export function net(s: Sale): number {
  return s.gross - (s.fees || 0);
}

export interface Totals {
  gross: number;
  fees: number;
  net: number;
  count: number;
  ticket: number;
  netTicket: number;
}

export function totals(sales: Sale[]): Totals {
  const ok = sales.filter(countable);
  const gross = ok.reduce((a, s) => a + s.gross, 0);
  const fees = ok.reduce((a, s) => a + (s.fees || 0), 0);
  const count = ok.length;
  return {
    gross,
    fees,
    net: gross - fees,
    count,
    ticket: count ? gross / count : 0,
    netTicket: count ? (gross - fees) / count : 0,
  };
}

export function salesInMonth(sales: Sale[], y: number, m: number): Sale[] {
  return sales.filter((s) => sameMonth(s.date, y, m));
}

export function salesBetween(sales: Sale[], start: string, end: string): Sale[] {
  return sales.filter((s) => s.date >= start && s.date <= end);
}

/** Variação percentual; null quando a base é zero */
export function delta(curr: number, prev: number): number | null {
  if (!prev) return null;
  return (curr - prev) / prev;
}

export const emptyWeeks = (): [WeekGoal, WeekGoal, WeekGoal, WeekGoal] => [
  { revenue: 0, sales: 0 },
  { revenue: 0, sales: 0 },
  { revenue: 0, sales: 0 },
  { revenue: 0, sales: 0 },
];

export interface WeekProgress {
  label: string;
  start: string;
  end: string;
  goalRevenue: number;
  goalSales: number;
  revenue: number;
  sales: number;
  ticket: number;
}

export interface ChannelProgress {
  channelId: string;
  weeks: WeekProgress[];
  goalRevenue: number;
  goalSales: number;
  revenue: number;
  sales: number;
  ticket: number;
  pct: number; // realizado / meta do mês (0 quando sem meta)
  /** Meta acumulada até a semana atual (para dizer se está em dia) */
  expectedToDate: number;
  status: 'sem-meta' | 'em-dia' | 'atrasado' | 'batida';
}

/**
 * Progresso de um canal no mês: realizado = vendas aprovadas com esse canal + ajustes manuais.
 * `today` define quantas semanas já deveriam estar cumpridas.
 */
export function channelProgress(
  channelId: string,
  y: number,
  m: number,
  sales: Sale[],
  goal: ChannelGoal | undefined,
  today: string,
): ChannelProgress {
  const ranges = weekRanges(y, m);
  const weeks: WeekProgress[] = ranges.map((r, i) => {
    const inWeek = sales.filter(
      (s) => countable(s) && s.channelId === channelId && s.date >= r.start && s.date <= r.end,
    );
    const manual = goal?.manual?.[i] ?? { revenue: 0, sales: 0 };
    const revenue = inWeek.reduce((a, s) => a + s.gross, 0) + (manual.revenue || 0);
    const count = inWeek.length + (manual.sales || 0);
    return {
      ...r,
      goalRevenue: goal?.weeks?.[i]?.revenue || 0,
      goalSales: goal?.weeks?.[i]?.sales || 0,
      revenue,
      sales: count,
      ticket: count ? revenue / count : 0,
    };
  });
  const goalRevenue = weeks.reduce((a, w) => a + w.goalRevenue, 0);
  const goalSales = weeks.reduce((a, w) => a + w.goalSales, 0);
  const revenue = weeks.reduce((a, w) => a + w.revenue, 0);
  const salesCount = weeks.reduce((a, w) => a + w.sales, 0);

  // Semanas já encerradas ou em curso contam na meta esperada até hoje
  let expectedToDate = 0;
  if (today > ranges[3].end) {
    expectedToDate = goalRevenue;
  } else if (today >= ranges[0].start) {
    const wi = weekIndex(today);
    expectedToDate = weeks.slice(0, wi + 1).reduce((a, w) => a + w.goalRevenue, 0);
  }

  let status: ChannelProgress['status'] = 'sem-meta';
  if (goalRevenue > 0) {
    if (revenue >= goalRevenue) status = 'batida';
    else if (revenue >= expectedToDate) status = 'em-dia';
    else status = 'atrasado';
  }
  return {
    channelId,
    weeks,
    goalRevenue,
    goalSales,
    revenue,
    sales: salesCount,
    ticket: salesCount ? revenue / salesCount : 0,
    pct: goalRevenue ? revenue / goalRevenue : 0,
    expectedToDate,
    status,
  };
}

/** Cliente ativo: status ativo, não excluído, não é teste e plano não vencido */
export function isActiveClient(c: Client, today: string): boolean {
  return c.status === 'ativo' && !c.deleted && !c.isTest && (!c.endDate || c.endDate >= today);
}

/** Clientes novos no mês = primeira venda (não renovação) aprovada no mês */
export function newClientsInMonth(sales: Sale[], y: number, m: number): number {
  const ids = new Set(
    sales.filter((s) => countable(s) && (s.kind ?? (s.isRenewal ? 'renovacao' : 'nova')) === 'nova' && sameMonth(s.date, y, m)).map((s) => s.clientId),
  );
  return ids.size;
}

/** Série dos últimos N meses terminando em (y, m) */
export function monthlySeries(sales: Sale[], y: number, m: number, n = 12) {
  const out: { y: number; m: number; gross: number; net: number; count: number }[] = [];
  let cur = { y, m };
  for (let i = 0; i < n; i++) {
    const t = totals(salesInMonth(sales, cur.y, cur.m));
    out.unshift({ y: cur.y, m: cur.m, gross: t.gross, net: t.net, count: t.count });
    cur = prevMonth(cur.y, cur.m);
  }
  return out;
}

/** Renovação: das vendas cujo plano venceu no período, quantas clientes compraram de novo */
export function renewalRate(sales: Sale[], start: string, end: string): { due: number; renewed: number; rate: number | null } {
  const ok = sales.filter(countable);
  const dueSales = ok.filter((s) => s.endDate >= start && s.endDate <= end);
  const dueClients = new Set(dueSales.map((s) => s.clientId));
  let renewed = 0;
  dueClients.forEach((cid) => {
    const venc = dueSales.filter((s) => s.clientId === cid).map((s) => s.endDate).sort().at(-1)!;
    // renovou se há venda de renovação entre 30 dias antes e 30 dias depois do vencimento
    const has = ok.some(
      (s) => s.clientId === cid && s.isRenewal && s.date >= addDays(venc, -30) && s.date <= addDays(venc, 30),
    );
    if (has) renewed++;
  });
  return { due: dueClients.size, renewed, rate: dueClients.size ? renewed / dueClients.size : null };
}

/** Faturamento acumulado desde a data inicial e próximo marco */
export function milestoneProgress(sales: Sale[], since: string, milestones: number[]) {
  const total = sales.filter((s) => countable(s) && s.date >= since).reduce((a, s) => a + s.gross, 0);
  const sorted = [...milestones].sort((a, b) => a - b);
  const reached = sorted.filter((v) => total >= v);
  const next = sorted.find((v) => total < v) ?? null;
  const prev = reached.at(-1) ?? 0;
  return {
    total,
    reached,
    next,
    pctToNext: next ? (total - prev) / (next - prev) : 1,
    missing: next ? next - total : 0,
  };
}

/** Clientes com plano vencendo nos próximos `days` dias (inclui vencidos há até 15 dias) */
export function renewalsDue(clients: Client[], today: string, days: number): Client[] {
  const limit = addDays(today, days);
  const floor = addDays(today, -15);
  return clients
    .filter((c) => !c.deleted && !c.isTest && c.status === 'ativo' && c.endDate && c.endDate <= limit && c.endDate >= floor)
    .sort((a, b) => (a.endDate! < b.endDate! ? -1 : 1));
}

// ---------- formatação ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brl2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtBRL = (v: number) => brl.format(Math.round(v || 0));
export const fmtBRL2 = (v: number) => brl2.format(v || 0);
export const fmtPct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
export function fmtDate(isoDate?: string): string {
  if (!isoDate) return '—';
  const { y, m, d } = parts(isoDate);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Converte "1.234,56" ou "1234.56" em número */
export function parseMoney(v: string): number {
  if (!v) return 0;
  const s = v.replace(/[^\d,.-]/g, '');
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  // "2.097" em pt-BR é dois mil e noventa e sete: ponto seguido de 3 dígitos = milhar
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  return Number(s) || 0;
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p.at(-1)![0] : '')).toUpperCase();
}

/** CSV com ; (abre direto no Excel em pt-BR) */
export function toCSV(rows: (string | number | undefined | null)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === undefined || v === null ? '' : String(v);
          return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(';'),
    )
    .join('\n');
}

// ======================= Renovações, cobranças e desempenho avançado =======================

export function saleKind(s: Sale): SaleKind {
  return s.kind ?? (s.isRenewal ? 'renovacao' : 'nova');
}

export function monthBounds(y: number, m: number) {
  return { start: iso(y, m, 1), end: iso(y, m, daysInMonth(y, m)) };
}

/** Renovações do mês de referência (como a Kairós) */
export function renewalMonth(clients: Client[], sales: Sale[], y: number, m: number, today: string) {
  const { start, end } = monthBounds(y, m);
  const toRenew = clients
    .filter((c) => !c.deleted && !c.isTest && c.status === 'ativo' && c.endDate && c.endDate >= start && c.endDate <= end)
    .sort((a, b) => (a.endDate! < b.endDate! ? -1 : 1));
  const renewed = sales
    .filter((s) => countable(s) && saleKind(s) === 'renovacao' && s.date >= start && s.date <= end)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const renewedValue = renewed.reduce((a, s) => a + s.gross, 0);
  return {
    toRenew,
    renewed,
    renewedValue,
    estimatedRevenue: toRenew.reduce((a, c) => a + (c.lastValue ?? 0), 0),
    overdue: toRenew.filter((c) => c.endDate! < today).length,
    /** renovadas ÷ (renovadas + ainda a renovar) */
    rate: renewed.length + toRenew.length ? renewed.length / (renewed.length + toRenew.length) : null,
  };
}

export interface PartRow extends Part {
  saleId: string;
  index: number;
  total: number;
  clientId: string;
  clientName: string;
  planName: string;
}

export function allParts(sales: Sale[]): PartRow[] {
  return sales
    .filter((s) => s.status !== 'estornada' && !s.isTest && s.parts?.length)
    .flatMap((s) => s.parts!.map((p, i) => ({ ...p, saleId: s.id, index: i, total: s.parts!.length, clientId: s.clientId, clientName: s.clientName, planName: s.planName })));
}

/** Cobranças do mês: parcelas a receber, recebidas, inadimplência e saldo em aberto (todos os meses) */
export function receivables(sales: Sale[], y: number, m: number, today: string) {
  const { start, end } = monthBounds(y, m);
  const parts = allParts(sales);
  const dueInMonth = parts.filter((p) => p.due >= start && p.due <= end);
  const pending = dueInMonth.filter((p) => p.status === 'pendente').sort((a, b) => (a.due < b.due ? -1 : 1));
  const received = parts.filter((p) => p.status === 'pago' && (p.paidAt ?? p.due) >= start && (p.paidAt ?? p.due) <= end);
  const overdue = pending.filter((p) => p.due < today);
  const dueValue = dueInMonth.reduce((a, p) => a + p.amount, 0);
  const overdueValue = overdue.reduce((a, p) => a + p.amount, 0);
  const open = parts.filter((p) => p.status === 'pendente');
  return {
    pending,
    received,
    pendingValue: pending.reduce((a, p) => a + p.amount, 0),
    receivedValue: received.reduce((a, p) => a + p.amount, 0),
    overdue,
    overdueValue,
    delinquency: dueValue ? overdueValue / dueValue : null,
    openBalance: open.reduce((a, p) => a + p.amount, 0),
    openClients: new Set(open.map((p) => p.clientId)).size,
  };
}

/** Divide um total em parcelas: sinal (pago na data) + restante, ou N parcelas mensais iguais */
export function buildParts(total: number, mode: 'sinal' | 'parcelado', count: number, firstDue: string, signal?: number): Part[] {
  const n = Math.max(2, Math.min(24, Math.round(count)));
  const parts: Part[] = [];
  if (mode === 'sinal') {
    const sig = Math.min(total, Math.max(0, signal ?? Math.round((total / n) * 100) / 100));
    parts.push({ due: firstDue, amount: sig, status: 'pago', paidAt: firstDue });
    const rest = total - sig;
    const each = Math.floor((rest / (n - 1)) * 100) / 100;
    for (let i = 1; i < n; i++) {
      const amount = i === n - 1 ? Math.round((rest - each * (n - 2)) * 100) / 100 : each;
      parts.push({ due: addMonths(firstDue, i), amount, status: 'pendente' });
    }
  } else {
    const each = Math.floor((total / n) * 100) / 100;
    for (let i = 0; i < n; i++) {
      const amount = i === n - 1 ? Math.round((total - each * (n - 1)) * 100) / 100 : each;
      parts.push({ due: addMonths(firstDue, i), amount, status: i === 0 ? 'pago' : 'pendente', paidAt: i === 0 ? firstDue : undefined });
    }
  }
  return parts;
}

/** Taxa de ascensão: em cada renovação ou troca, a cliente pagou mais, igual ou menos que antes? */
export function upgradeStats(sales: Sale[]) {
  const byClient = new Map<string, Sale[]>();
  sales.filter(countable).forEach((s) => { const l = byClient.get(s.clientId) ?? []; l.push(s); byClient.set(s.clientId, l); });
  let up = 0, same = 0, down = 0;
  const ups: { clientName: string; from: string; to: string; fromValue: number; toValue: number; diff: number; date: string }[] = [];
  byClient.forEach((list) => {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
    for (let i = 1; i < list.length; i++) {
      const k = saleKind(list[i]);
      if (k === 'nova') continue;
      const prev = list[i - 1], cur = list[i];
      if (cur.gross > prev.gross) {
        up++;
        ups.push({ clientName: cur.clientName, from: prev.planName, to: cur.planName, fromValue: prev.gross, toValue: cur.gross, diff: cur.gross - prev.gross, date: cur.date });
      } else if (cur.gross === prev.gross) same++;
      else down++;
    }
  });
  const total = up + same + down;
  return { up, same, down, total, rate: total ? up / total : null, ups: ups.sort((a, b) => (a.date < b.date ? 1 : -1)) };
}

/** MRR: valor de cada cliente ativa dividido pelos meses do plano */
export function mrr(clients: Client[], today: string): { value: number; count: number } {
  const act = clients.filter((c) => isActiveClient(c, today) && c.lastValue);
  const months = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 } as const;
  // sem período gravado (clientes antigas): deduz pelos meses entre início e vencimento
  const monthsOf = (c: Client) => c.period ? months[c.period]
    : c.startDate && c.endDate ? Math.max(1, Math.round((daysBetween(c.startDate, c.endDate) + 1) / 30.4)) : 1;
  return { value: act.reduce((a, c) => a + c.lastValue! / monthsOf(c), 0), count: act.length };
}

/** Comparação por semana com o mês anterior + canal com maior queda em cada semana */
export function weeklyCompare(sales: Sale[], y: number, m: number) {
  const pm = prevMonth(y, m);
  const cur = weekRanges(y, m), prev = weekRanges(pm.y, pm.m);
  const sumBy = (list: Sale[]) => {
    const g: Record<string, number> = {};
    list.forEach((s) => { g[s.channelId ?? ''] = (g[s.channelId ?? ''] ?? 0) + net(s); });
    return g;
  };
  return cur.map((w, i) => {
    const a = salesBetween(sales, w.start, w.end).filter(countable);
    const b = salesBetween(sales, prev[i].start, prev[i].end).filter(countable);
    const ca = sumBy(a), cb = sumBy(b);
    let worst: { channelId: string; drop: number } | null = null;
    Object.keys(cb).forEach((k) => {
      const drop = cb[k] ? ((ca[k] ?? 0) - cb[k]) / cb[k] : 0;
      if (drop < 0 && (!worst || drop < worst.drop)) worst = { channelId: k, drop };
    });
    const value = a.reduce((x, s) => x + net(s), 0);
    const prevValue = b.reduce((x, s) => x + net(s), 0);
    return { label: w.label, value, count: a.length, prevValue, delta: delta(value, prevValue), worst: worst as { channelId: string; drop: number } | null };
  });
}

export const DEFAULT_FARMER = new Set(['renovacao', 'winning-back']);
export function channelKind(c: Pick<Channel, 'id' | 'kind'> | undefined, id: string): 'hunter' | 'farmer' {
  return c?.kind ?? (DEFAULT_FARMER.has(id) ? 'farmer' : 'hunter');
}

/** Receita do mês agrupada por uma chave, com contagem e % do total */
export function groupRevenue(sales: Sale[], key: (s: Sale) => string) {
  const ok = sales.filter(countable);
  const total = ok.reduce((a, s) => a + net(s), 0);
  const g = new Map<string, { value: number; count: number }>();
  ok.forEach((s) => { const k = key(s); const v = g.get(k) ?? { value: 0, count: 0 }; v.value += net(s); v.count++; g.set(k, v); });
  return [...g.entries()].map(([k, v]) => ({ key: k, ...v, share: total ? v.value / total : 0 })).sort((a, b) => b.value - a.value);
}
