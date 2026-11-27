// Influencers, embaixadoras, campanhas e ranking: tipos e cálculos puros (tests/growth.test.ts).
import { countable, iso, daysInMonth, isActiveClient, saleKind } from './calc';
import type { Client, Sale } from './types';

// ---------------- Influencers ----------------
export type InfluencerStage = 'prospectar' | 'prospectando' | 'negociacao' | 'fechado' | 'perdido';
export const STAGES: { id: InfluencerStage; label: string }[] = [
  { id: 'prospectar', label: 'A prospectar' },
  { id: 'prospectando', label: 'Prospectando' },
  { id: 'negociacao', label: 'Em negociação' },
  { id: 'fechado', label: 'Fechado' },
  { id: 'perdido', label: 'Perdido' },
];
export const NETWORKS = ['Instagram', 'TikTok', 'YouTube', 'Twitter / X', 'Facebook', 'Kwai', 'Outro'];

export interface Tier { name: string; min: number; pct: number }
export interface CommissionModel { id: string; name: string; tiers: Tier[]; createdAt: number }

export type DealType = 'comissao' | 'permuta' | 'ambos';
export interface Influencer {
  id: string;
  name: string;
  network: string;
  handle: string;
  email?: string;
  coupon?: string;
  stage: InfluencerStage;
  modelId?: string;
  deal: DealType;
  /** Permuta do Garimpo: acesso à consultoria em troca de conteúdo */
  trialStart?: string;
  trialEnd?: string;
  storiesPerMonth?: number;
  reelsPerMonth?: number;
  active: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface InfluencerMonth {
  id: string; // `${influencerId}__YYYY-MM`
  influencerId: string;
  year: number;
  month: number;
  goals: [number, number, number, number];
  leads: [number, number, number, number];
  stories: number;
  reels: number;
  links: string[];
  notes?: string;
}

export const DEFAULT_TIERS: Tier[] = [
  { name: 'Bronze', min: 0, pct: 10 },
  { name: 'Prata', min: 4000, pct: 12 },
  { name: 'Ouro', min: 6500, pct: 15 },
  { name: 'Diamante', min: 12000, pct: 20 },
];

/** Faixa atingida pelo faturamento do mês, comissão e quanto falta para a próxima */
export function commissionFor(revenue: number, tiers: Tier[]) {
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  const reached = sorted.filter((t) => revenue >= t.min);
  const tier = reached.at(-1) ?? sorted[0] ?? { name: '—', min: 0, pct: 0 };
  const next = sorted.find((t) => t.min > revenue) ?? null;
  return { tier, value: Math.round(revenue * tier.pct) / 100, next, missing: next ? next.min - revenue : 0 };
}

/** Dias que faltam para o fim do teste de permuta (negativo = já acabou) */
export function trialDaysLeft(inf: Pick<Influencer, 'trialEnd'>, today: string): number | null {
  if (!inf.trialEnd) return null;
  const [a, b] = [today, inf.trialEnd].map((d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
  return Math.round((b - a) / 86400000);
}

// ---------------- Embaixadoras (indicações) ----------------
export type AmbassadorDeal = 'nenhuma' | 'meses' | 'comissao' | 'desconto';
export const DEAL_LABEL: Record<AmbassadorDeal, string> = {
  nenhuma: 'Sem negociação', meses: 'Mais meses de plano', comissao: 'Comissão', desconto: 'Desconto de renovação',
};
export interface Ambassador { id: string; deal: AmbassadorDeal; value: number; approachedAt?: string; notes?: string }

export interface AmbassadorRow { clientId: string; name: string; volume: number; revenue: number; ticket: number; prevVolume: number; rank: number; level: 'Ouro' | 'Prata' | 'Bronze' | null }

/** Indicações = vendas novas com "indicado por". Período: um mês ou tudo. */
export function ambassadorRanking(sales: Sale[], clients: Client[], period: { y: number; m: number } | 'tudo', metric: 'volume' | 'receita'): AmbassadorRow[] {
  const inRange = (s: Sale, y: number, m: number) => s.date >= iso(y, m, 1) && s.date <= iso(y, m, daysInMonth(y, m));
  const refs = sales.filter((s) => countable(s) && s.referredById && saleKind(s) === 'nova');
  const cur = period === 'tudo' ? refs : refs.filter((s) => inRange(s, period.y, period.m));
  const prevP = period === 'tudo' ? null : period.m === 1 ? { y: period.y - 1, m: 12 } : { y: period.y, m: period.m - 1 };
  const prev = prevP ? refs.filter((s) => inRange(s, prevP.y, prevP.m)) : [];
  const names = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const g = new Map<string, { volume: Set<string>; revenue: number; prev: Set<string> }>();
  cur.forEach((s) => { const k = s.referredById!; const v = g.get(k) ?? { volume: new Set(), revenue: 0, prev: new Set() }; v.volume.add(s.clientId); v.revenue += s.gross; g.set(k, v); });
  prev.forEach((s) => { const v = g.get(s.referredById!); if (v) v.prev.add(s.clientId); });
  const rows = [...g.entries()].map(([k, v]) => ({
    clientId: k, name: names[k] ?? 'Cliente removida', volume: v.volume.size, revenue: v.revenue,
    ticket: v.volume.size ? v.revenue / v.volume.size : 0, prevVolume: v.prev.size, rank: 0, level: null as AmbassadorRow['level'],
  }));
  rows.sort((a, b) => (metric === 'volume' ? b.volume - a.volume || b.revenue - a.revenue : b.revenue - a.revenue || b.volume - a.volume));
  rows.forEach((r, i) => { r.rank = i + 1; r.level = i === 0 ? 'Ouro' : i === 1 ? 'Prata' : i === 2 ? 'Bronze' : null; });
  return rows;
}

/** Ganho acumulado da embaixadora pela negociação */
export function ambassadorEarning(a: Ambassador | undefined, row: Pick<AmbassadorRow, 'volume' | 'revenue'>): string {
  if (!a || a.deal === 'nenhuma') return 'sem negociação';
  if (a.deal === 'meses') return `${a.value * row.volume} mês(es) a mais de plano`;
  if (a.deal === 'comissao') return `R$ ${Math.round((row.revenue * a.value) / 100).toLocaleString('pt-BR')} de comissão`;
  return `${a.value}% de desconto na renovação`;
}

/** Radar de indicações do mês */
export function referralRadar(sales: Sale[], clients: Client[], y: number, m: number, today: string) {
  const live = clients.filter((c) => !c.deleted && !c.isTest);
  const start = iso(y, m, 1), end = iso(y, m, daysInMonth(y, m));
  const refSales = sales.filter((s) => countable(s) && s.referredById && saleKind(s) === 'nova');
  const referred = live.filter((c) => c.referredById);
  const referrers = new Set(referred.map((c) => c.referredById!));
  refSales.forEach((s) => referrers.add(s.referredById!));
  const monthRefs = refSales.filter((s) => s.date >= start && s.date <= end);
  const firstBy = new Map<string, string>();
  refSales.forEach((s) => { const f = firstBy.get(s.referredById!); if (!f || s.date < f) firstBy.set(s.referredById!, s.date); });
  const activated = [...firstBy.values()].filter((d) => d >= start && d <= end).length;
  const referredIds = new Set(referred.map((c) => c.id));
  const renewedInMonth = new Set(sales.filter((s) => countable(s) && saleKind(s) === 'renovacao' && referredIds.has(s.clientId) && s.date >= start && s.date <= end).map((s) => s.clientId)).size;
  const retained = referred.filter((c) => isActiveClient(c, today)).length;
  return {
    clients: live.length,
    referrers: referrers.size,
    notYet: Math.max(0, live.length - referrers.size),
    monthReferrals: monthRefs.length,
    activated,
    referredTotal: referred.length,
    renewedInMonth,
    renewedRate: referred.length ? renewedInMonth / referred.length : null,
    retained,
    retention: referred.length ? retained / referred.length : null,
  };
}

/** Mapa de oportunidades: volume × ticket comparados à mediana */
export function opportunityQuadrant(rows: AmbassadorRow[]) {
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const i = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2) : 0; };
  const mv = med(rows.map((r) => r.volume)), mt = med(rows.map((r) => r.ticket));
  const q = { escalar: [] as AmbassadorRow[], ticket: [] as AmbassadorRow[], premium: [] as AmbassadorRow[], estimular: [] as AmbassadorRow[] };
  rows.forEach((r) => {
    const hv = r.volume >= mv, ht = r.ticket >= mt;
    (hv && ht ? q.escalar : hv ? q.ticket : ht ? q.premium : q.estimular).push(r);
  });
  return q;
}

// ---------------- Ranking (autoavaliação) ----------------
export const AREAS: { id: string; name: string; pillars: string[] }[] = [
  { id: 'marketing', name: 'Marketing', pillars: ['Posicionamento e oferta claros', 'Conteúdo com constância', 'Conteúdo que gera conversa (funil)', 'Prova social organizada', 'Parcerias e influencers', 'Métricas de marketing acompanhadas'] },
  { id: 'vendas', name: 'Vendas', pillars: ['Processo comercial definido', 'Follow-up e CRM em dia', 'Conversão medida por canal', 'Canais de aquisição diversificados', 'Renovação e upgrade ativos'] },
  { id: 'entrega', name: 'Entrega', pillars: ['Onboarding padronizado', 'Anamnese e coleta de dados', 'Prazos de entrega cumpridos', 'Acompanhamento e feedback recorrentes', 'Comunidade ativa', 'Experiência e encantamento', 'Resultado das alunas medido'] },
  { id: 'operacao', name: 'Operação', pillars: ['Processos documentados', 'Ferramentas integradas', 'Time e papéis definidos'] },
  { id: 'financeiro', name: 'Financeiro', pillars: ['Receitas e despesas controladas (DRE)', 'Preço e margem por plano', 'Fluxo de caixa e reserva', 'PF/PJ separados e impostos em dia'] },
];
export const SCORE_LABEL = ['', 'Inexistente', 'Básico', 'Estruturado', 'Otimizado'];

export interface Assessment { id: string; date: string; scores: Record<string, number[]>; notes?: string; createdAt: number }

export function areaAverage(scores: number[] | undefined): number {
  const v = (scores ?? []).filter((x) => x > 0);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : 0;
}
export function overallAverage(a: Pick<Assessment, 'scores'>): number {
  const avgs = AREAS.map((ar) => areaAverage(a.scores[ar.id])).filter((x) => x > 0);
  return avgs.length ? Math.round((avgs.reduce((x, y) => x + y, 0) / avgs.length) * 100) / 100 : 0;
}
export function rankLevel(avg: number): 'Bronze' | 'Prata' | 'Ouro' | 'Diamante' {
  return avg >= 3.5 ? 'Diamante' : avg >= 3 ? 'Ouro' : avg >= 2 ? 'Prata' : 'Bronze';
}

// ---------------- Campanhas ----------------
export interface Tactic { title: string; text: string; worked?: boolean | null }
export interface CampaignChannel { channelId: string; why: string; goalRevenue: number; goalSales: number; tactics: Tactic[]; triggered: boolean }
export interface Campaign {
  id: string;
  name: string;
  occasion: string;
  start: string;
  end: string;
  status: 'rascunho' | 'ativa' | 'encerrada';
  offer: string;
  prices: { label: string; value: number }[];
  channels: CampaignChannel[];
  result?: 'deu-certo' | 'parcial' | 'nao' | null;
  resultNotes?: string;
  createdAt: number;
  updatedAt: number;
}

export const OCCASIONS = [
  { name: 'Black Friday', hint: 'Última sexta de novembro. Pico de conversão do ano: desconto forte no anual.' },
  { name: 'Natal e Ano Novo', hint: 'Metas de ano novo: oferta de começo de ano e reajuste em janeiro como gatilho.' },
  { name: 'Carnaval', hint: 'Antes: desafio pré-carnaval. Depois: retomada da rotina.' },
  { name: 'Dia das Mães', hint: 'Plano para presentear ou plano mãe + filha.' },
  { name: 'Volta às aulas / retomada', hint: 'Rotina nova em fevereiro e agosto.' },
  { name: 'Verão', hint: 'De setembro a dezembro: objetivo de praia e biquíni.' },
  { name: 'Aniversário do Garimpo', hint: 'Data da marca: condição especial e prova social.' },
  { name: 'Outra', hint: 'Campanha livre.' },
];

/** Táticas sugeridas por canal (ponto de partida; edite à vontade) */
export const TACTICS: Record<string, Tactic[]> = {
  renovacao: [
    { title: 'Antecipe a renovação', text: 'Fale primeiro com quem vence perto da data e ofereça a condição da campanha por tempo limitado.' },
    { title: 'Renovação em dupla', text: 'Proponha renovar junto com uma amiga: o valor por pessoa cai e a decisão acelera.' },
    { title: 'Use o resultado dela', text: 'Mostre a evolução da aluna (fotos, cargas, medidas) antes de apresentar a oferta.' },
  ],
  'winning-back': [
    { title: 'Lista de ex-alunas', text: 'Separe quem saiu nos últimos 12 meses e mande uma mensagem pessoal com a condição da campanha.' },
    { title: 'Motivo da saída', text: 'Retome a conversa pelo motivo que ela deu ao sair e mostre o que mudou desde então.' },
    { title: 'Prazo curto', text: 'Deixe claro que a condição vale só até o fim da campanha.' },
  ],
  indicacao: [
    { title: 'Peça indicação às mais engajadas', text: 'Chame as alunas com melhores resultados e ofereça a recompensa por indicação durante a campanha.' },
    { title: 'Prova social no grupo', text: 'Poste no grupo um resultado real (com autorização) junto com a condição para quem indicar.' },
    { title: 'Indicação em dupla', text: 'Indicada e indicadora ganham algo ao fechar dentro da campanha.' },
  ],
  organico: [
    { title: 'Sequência de stories', text: 'Abertura, prova, oferta e prazo: uma sequência curta por dia da campanha.' },
    { title: 'Caixa de perguntas', text: 'Responda dúvidas e objeções em público e puxe para o direct.' },
    { title: 'Conteúdo de bastidor', text: 'Mostre a rotina com as alunas para gerar confiança antes da oferta.' },
  ],
  'social-selling': [
    { title: 'Lista quente', text: 'Retome quem já interagiu ou perguntou preço nos últimos meses.' },
    { title: 'Mensagem curta e direta', text: 'Oferta simples, um benefício principal e o prazo.' },
    { title: 'Blocos de prospecção', text: 'Reserve 30 minutos de manhã e à tarde só para abordagens.' },
  ],
  influencer: [
    { title: 'Cupom da campanha', text: 'Combine com as influencers fechadas um cupom com a condição da campanha.' },
    { title: 'Collab no feed', text: 'Um Reels collab com depoimento real e chamada para o link.' },
    { title: 'Stories no dia D', text: 'Peça stories nos dias de abertura e encerramento.' },
  ],
};
export const DEFAULT_TACTICS: Tactic[] = [
  { title: 'Oferta clara', text: 'Uma condição só, com prazo e motivo.' },
  { title: 'Lembrete de prazo', text: 'Avise 48 h e 24 h antes de encerrar.' },
];
