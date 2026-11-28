// Tipos centrais da plataforma. Todo documento de negócio vive em tenants/{tenantId}/...

export type Role = 'owner' | 'staff';

export interface UserDoc {
  tenantId: string;
  role: Role;
  name: string;
  email: string;
}

export interface Tenant {
  id: string;
  name: string;
  ownerUid: string;
  createdAt: number;
  /** Data (YYYY-MM-DD) a partir da qual o faturamento conta para as conquistas */
  milestonesStart?: string;
  /** Marcos de faturamento acumulado, em reais */
  milestones?: number[];
  /** InfiniteTag da InfinitePay (sem o $), usada no checkout */
  infinitePayHandle?: string;
  /** WhatsApp da consultoria (só números) */
  whatsapp?: string;
  /** Cor principal da marca (#RRGGBB) */
  brandColor?: string;
}

export interface Member {
  id: string; // uid
  name: string;
  email: string;
  role: Role;
  cargo?: string;
  isSeller?: boolean;
  active: boolean;
  joinedAt?: string;
  /** Telas liberadas (href). Vazio/indefinido = todas, menos as exclusivas do dono */
  allowedPages?: string[];
}

export interface Invite {
  id: string; // e-mail em minúsculas
  tenantId: string;
  tenantName: string;
  name: string;
  role: Role;
  cargo?: string;
  isSeller?: boolean;
  createdAt: number;
}

export interface Channel {
  id: string;
  name: string;
  order: number;
  active: boolean;
  /** hunter = aquisição (cliente novo) · farmer = retenção (renovação, winning back) */
  kind?: 'hunter' | 'farmer';
}

export type ClientStatus = 'ativo' | 'inativo' | 'cancelado' | 'rascunho';

export interface Client {
  id: string;
  name: string;
  email?: string;
  cpf?: string;
  phone?: string;
  status: ClientStatus;
  isTest?: boolean;
  sendAppAccess?: boolean;
  notes?: string;
  channelId?: string;
  sellerId?: string;
  referredById?: string;
  influencerId?: string;
  /** Plano vigente, copiado da última venda aprovada */
  planId?: string;
  planName?: string;
  startDate?: string;
  endDate?: string;
  lastValue?: number;
  /** Período do plano vigente (para o MRR) */
  period?: Period;
  /** Último contato sobre renovação (YYYY-MM-DD) */
  renewalContactAt?: string;
  /** Destino do vencimento atual: em negociação, pausa ou não renovou */
  outcome?: import('./retention').RenewalOutcome;
  /** Recall (winning back) de ex-aluna */
  recall?: import('./retention').Recall;
  deleted?: boolean;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
  seed?: boolean;
}

export type Period = 'mensal' | 'trimestral' | 'semestral' | 'anual';
export const PERIOD_MONTHS: Record<Period, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
export const PERIOD_LABEL: Record<Period, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export type Modality = 'online' | 'presencial' | 'consulta';

export interface Product {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  forSale: boolean;
  grantsApp: boolean;
  modality: Modality;
  includes: { treino: boolean; dieta: boolean; cardio: boolean; medico: boolean };
  archived?: boolean;
  createdAt: number;
  seed?: boolean;
}

export type PaymentMethod = 'pix' | 'cartao' | 'boleto';

export interface Plan {
  id: string;
  productId: string;
  name: string;
  description?: string;
  period: Period;
  price: number;
  paymentMethods: PaymentMethod[];
  maxInstallments: number;
  couple: boolean;
  active: boolean;
  /** O que está incluso (aparece na página de pagamento) */
  benefits?: string[];
  /** Plano juntado a outro (fica só para histórico) */
  mergedInto?: string;
  createdAt: number;
  seed?: boolean;
}

export type SaleStatus = 'aprovada' | 'pendente' | 'estornada';

/** Tipo da venda: nova, renovação ou troca de plano no meio do ciclo */
export type SaleKind = 'nova' | 'renovacao' | 'troca';

/** Como a cliente paga você (fora o parcelamento da maquininha) */
export type PaymentMode = 'avista' | 'sinal' | 'parcelado';

export interface Part {
  due: string; // YYYY-MM-DD
  amount: number;
  status: 'pago' | 'pendente';
  /** Data em que entrou o dinheiro (define o mês no caixa) */
  paidAt?: string;
}

export interface Sale {
  id: string;
  clientId: string;
  clientName: string;
  planId: string;
  planName: string;
  productId?: string;
  period: Period;
  /** Valor bruto cobrado */
  gross: number;
  /** Taxas do meio de pagamento (não repassadas) */
  fees: number;
  /** Data da venda YYYY-MM-DD */
  date: string;
  startDate: string;
  endDate: string;
  channelId?: string;
  sellerId?: string;
  influencerId?: string;
  referredById?: string;
  isRenewal: boolean;
  /** Ausente em vendas antigas: deduzido de isRenewal */
  kind?: SaleKind;
  /** Plano/valor anterior, em trocas e renovações (para a taxa de ascensão) */
  prevPlanName?: string;
  status: SaleStatus;
  paymentMode?: PaymentMode;
  /** Parcelas a receber (sinal + restante ou parcelado). Vazio = à vista */
  parts?: Part[];
  paymentMethod: PaymentMethod;
  installments: number;
  /** Copiado do cliente: vendas de cliente de teste não entram nos indicadores */
  isTest?: boolean;
  notes?: string;
  createdAt: number;
  createdBy: string;
  seed?: boolean;
}

export interface WeekGoal {
  revenue: number;
  sales: number;
}

/** tenants/{t}/goals/{YYYY-MM}__{channelId} */
export interface ChannelGoal {
  id: string;
  year: number;
  month: number; // 1-12
  channelId: string;
  weeks: [WeekGoal, WeekGoal, WeekGoal, WeekGoal];
  /** Ajustes manuais de realizado (ex.: venda feita fora da plataforma) */
  manual: [WeekGoal, WeekGoal, WeekGoal, WeekGoal];
}

export interface AuditEntry {
  entity: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'restore';
  by: string;
  byName: string;
  at: number;
  summary: string;
}
