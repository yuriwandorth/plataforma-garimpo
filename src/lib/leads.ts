// Leads: contatos que ainda não compraram (Waspeed, checkout, manual).
// Cruzamento com alunas pelo telefone/e-mail. Funções puras, testadas em tests/leads.test.ts.
import type { Client, Sale } from './types';
import { countable, daysBetween } from './calc';

export type LeadStage = 'novo' | 'em_contato' | 'interesse' | 'apresentacao' | 'negociando' | 'link_enviado' | 'convertido' | 'perdido' | 'nao_lead';
export const LEAD_STAGES: Record<LeadStage, { label: string; tone: 'mute' | 'gold' | 'warn' | 'good' | 'bad' }> = {
  novo: { label: 'Sem contato', tone: 'mute' },
  em_contato: { label: 'Contato feito', tone: 'gold' },
  interesse: { label: 'Interesse identificado', tone: 'gold' },
  apresentacao: { label: 'Apresentação da consultoria', tone: 'gold' },
  negociando: { label: 'Negociação', tone: 'warn' },
  link_enviado: { label: 'Link de pagamento enviado', tone: 'warn' },
  convertido: { label: 'Virou aluna', tone: 'good' },
  perdido: { label: 'Perdido', tone: 'bad' },
  nao_lead: { label: 'Não é lead', tone: 'mute' },
};

/** Etapas do funil (colunas do quadro), na ordem */
export const FUNNEL: LeadStage[] = ['novo', 'em_contato', 'interesse', 'apresentacao', 'negociando', 'link_enviado', 'convertido', 'perdido'];

/** Etapas da Leadfy → etapas da plataforma */
export const LEADFY_STAGE: Record<string, LeadStage> = {
  'Sem Contato': 'novo', 'Contato Feito': 'em_contato', 'Identificação de Interesse': 'interesse', 'Apresentação de Consultoria': 'apresentacao',
  'Negociação': 'negociando', 'Link de Pagamento Enviado': 'link_enviado', 'Pago': 'convertido', 'Blacklist': 'perdido',
};

/** Avança a etapa só para frente (importação não "desfaz" progresso); perdido/convertido sempre valem */
export function furtherStage(cur: LeadStage, next: LeadStage): LeadStage {
  if (next === cur) return cur;
  if (cur === 'convertido' || cur === 'nao_lead') return cur;
  if (next === 'convertido' || next === 'perdido') return next;
  if (cur === 'perdido') return cur;
  return FUNNEL.indexOf(next) > FUNNEL.indexOf(cur) ? next : cur;
}

export interface Lead {
  id: string;
  name: string;
  /** Só números, com DDI quando estrangeiro */
  phone?: string;
  email?: string;
  /** De onde veio: waspeed, checkout, manual, planilha… */
  source: string;
  /** Lista / etiqueta / funil de origem (ex.: lista do Waspeed) */
  list?: string;
  /** Etapa como estava na ferramenta de origem */
  originStage?: string;
  stage: LeadStage;
  tags?: string[];
  firstSeenAt?: string;
  lastContactAt?: string;
  /** Última mensagem da conversa foi sua (true) ou dela (false) */
  lastFromMe?: boolean;
  /** Próximo follow-up marcado à mão (se vazio, a plataforma sugere) */
  followUpAt?: string;
  /** Revisado na triagem */
  reviewedAt?: string;
  channelId?: string;
  /** Influencer que trouxe o lead (cupom, link ou marcação manual) */
  influencerId?: string;
  /** Origem rastreada (link da bio, stories, campanha, influencer…) */
  origin?: string;
  notes?: string;
  lostReason?: string;
  clientId?: string;
  convertedAt?: string;
  importKey?: string;
  deleted?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Chave de telefone para cruzar registros: BR sem 55 e sem o 9 extra; estrangeiro com DDI */
export function phoneKey(p?: string): string {
  let d = (p ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3); // DDD + 9 + 8 dígitos → DDD + 8
  return d.length >= 8 ? d : '';
}

/** Acha a aluna que corresponde ao lead */
export function matchClient<C extends Pick<Client, 'id' | 'phone' | 'email' | 'deleted'>>(lead: Pick<Lead, 'phone' | 'email'>, clients: C[]): C | undefined {
  const pk = phoneKey(lead.phone);
  const em = (lead.email ?? '').trim().toLowerCase();
  return clients.find((c) => !c.deleted && ((pk && phoneKey(c.phone) === pk) || (em && (c.email ?? '').toLowerCase() === em)));
}

export interface LeadView { lead: Lead; client?: Pick<Client, 'id' | 'name' | 'status' | 'planName'>; firstSaleAt?: string }

/** Junta leads com as alunas e calcula a conversão */
export function leadBoard(leads: Lead[], clients: Client[], sales: Sale[]) {
  const firstSale = new Map<string, string>();
  for (const s of sales) {
    if (!countable(s)) continue;
    const cur = firstSale.get(s.clientId);
    if (!cur || s.date < cur) firstSale.set(s.clientId, s.date);
  }
  const views: LeadView[] = leads.filter((l) => !l.deleted && l.stage !== 'nao_lead').map((l) => {
    const c = (l.clientId && clients.find((x) => x.id === l.clientId && !x.deleted)) || matchClient(l, clients);
    return { lead: l, client: c || undefined, firstSaleAt: c ? firstSale.get(c.id) : undefined };
  });
  const converted = views.filter((v) => v.firstSaleAt || v.lead.stage === 'convertido');
  const lost = views.filter((v) => !v.firstSaleAt && v.lead.stage === 'perdido');
  const days = converted
    .filter((v) => v.firstSaleAt && v.lead.firstSeenAt && v.firstSaleAt >= v.lead.firstSeenAt)
    .map((v) => daysBetween(v.lead.firstSeenAt!, v.firstSaleAt!));
  const byList = new Map<string, { total: number; converted: number }>();
  for (const v of views) {
    const k = v.lead.list || 'Sem lista';
    const e = byList.get(k) ?? { total: 0, converted: 0 };
    e.total++;
    if (v.firstSaleAt || v.lead.stage === 'convertido') e.converted++;
    byList.set(k, e);
  }
  return {
    views,
    total: views.length,
    open: views.length - converted.length - lost.length,
    converted: converted.length,
    lost: lost.length,
    conversion: views.length ? converted.length / views.length : null,
    avgDaysToConvert: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    byList: [...byList.entries()].map(([list, v]) => ({ list, ...v, rate: v.total ? v.converted / v.total : 0 })).sort((a, b) => b.total - a.total),
  };
}

export function isConverted(v: LeadView) {
  return !!v.firstSaleAt || v.lead.stage === 'convertido';
}

export type FupKind = 'responder' | 'cobrar' | 'retomar' | 'frio' | 'agendado';
export const FUP_LABEL: Record<FupKind, string> = {
  responder: 'Responder (ela falou por último)',
  cobrar: 'Follow-up (você falou por último)',
  retomar: 'Retomar conversa',
  frio: 'Frio: campanha de reativação',
  agendado: 'Follow-up agendado',
};

/** Espalha datas de forma estável (mesmo lead, mesmo dia) para não acumular tudo num dia só */
function spread(id: string, days: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % days;
}

/**
 * Próximo follow-up do lead, pelos dados da conversa (sem ler mensagens):
 * - ela falou por último (até 30 dias): responder hoje
 * - você falou por último há 2–14 dias: cobrar 3 dias depois do seu último envio (mínimo hoje)
 * - 15–60 dias sem conversa: retomar nos próximos 14 dias (espalhado)
 * - mais de 60 dias: frio, sem data (vai para campanha)
 */
export function nextFollowUp(l: Pick<Lead, 'id' | 'lastContactAt' | 'lastFromMe' | 'followUpAt' | 'stage'>, today: string): { at?: string; kind: FupKind } | null {
  if (l.stage === 'convertido' || l.stage === 'perdido' || l.stage === 'nao_lead') return null;
  if (l.followUpAt) return { at: l.followUpAt, kind: 'agendado' };
  if (!l.lastContactAt) return { kind: 'frio' };
  const age = daysBetween(l.lastContactAt, today);
  if (l.lastFromMe === false && age <= 30) return { at: today, kind: 'responder' };
  if (age < 2) return { at: addDaysISO(today, 2 - age), kind: 'cobrar' };
  if (age <= 14) { const d = addDaysISO(l.lastContactAt, 3); return { at: d > today ? d : today, kind: 'cobrar' }; }
  if (age <= 60) return { at: addDaysISO(today, spread(l.id, 14)), kind: 'retomar' };
  return { kind: 'frio' };
}

function addDaysISO(d: string, n: number): string {
  const [y, m, dd] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd + n));
  return t.toISOString().slice(0, 10);
}
