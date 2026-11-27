// Leads: contatos que ainda não compraram (Waspeed, checkout, manual).
// Cruzamento com alunas pelo telefone/e-mail. Funções puras, testadas em tests/leads.test.ts.
import type { Client, Sale } from './types';
import { countable, daysBetween } from './calc';

export type LeadStage = 'novo' | 'em_contato' | 'negociando' | 'convertido' | 'perdido';
export const LEAD_STAGES: Record<LeadStage, { label: string; tone: 'mute' | 'gold' | 'warn' | 'good' | 'bad' }> = {
  novo: { label: 'Novo', tone: 'mute' },
  em_contato: { label: 'Em contato', tone: 'gold' },
  negociando: { label: 'Negociando', tone: 'warn' },
  convertido: { label: 'Virou aluna', tone: 'good' },
  perdido: { label: 'Perdido', tone: 'bad' },
};

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
  channelId?: string;
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
  const views: LeadView[] = leads.filter((l) => !l.deleted).map((l) => {
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
