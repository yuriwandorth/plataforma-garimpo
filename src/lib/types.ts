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
  /** Último contato sobre renovação (YYYY-MM-DD) */
  renewalContactAt?: string;
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
  createdAt: number;
  seed?: boolean;
}

export type SaleStatus = 'aprovada' | 'pendente' | 'estornada';

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
  status: SaleStatus;
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
