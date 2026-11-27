// Checkout integrado InfinitePay (sem servidor).
// Fluxo: aluna preenche e aceita os termos → cria pedido → link da InfinitePay → paga → volta para /pagar/retorno/
// → a plataforma confere o pagamento na InfinitePay (/payment_check) → você confirma e vira aluna + venda.
// Funções puras testadas em tests/checkout.test.ts (nada de Firebase aqui).
import type { Period, Sale } from './types';
import { addDays, planEndDate } from './calc';

export const IP_API = 'https://api.checkout.infinitepay.io';

/** tenants/{t}/checkouts/{id} — leitura pública quando ativo */
export interface CheckoutLink {
  id: string;
  title: string;
  description?: string;
  brand: string;
  planId: string;
  planName: string;
  productId?: string;
  period: Period;
  /** Preço em reais */
  price: number;
  /** InfiniteTag sem o $ */
  handle: string;
  terms: string;
  channelId?: string;
  influencerId?: string;
  /** WhatsApp da consultoria (só números) para o botão da página de obrigado */
  whatsapp?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** tenants/{t}/coupons/{CÓDIGO} — a aluna consulta pelo código (leitura pública só do cupom ativo) */
export interface Coupon {
  id: string;
  code: string;
  /** % de desconto (1 a 90) */
  pct: number;
  active: boolean;
  influencerId?: string;
  influencerName?: string;
  createdAt?: number;
  updatedAt: number;
}

export const DEFAULT_COUPON_PCT = 10;

/** Código do cupom: maiúsculo, sem espaço nem acento, até 30 caracteres */
export function couponCode(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30);
}

/** Preço com desconto, arredondado em centavos (a regra do banco faz a mesma conta) */
export function discounted(price: number, pct: number): number {
  return Math.round(price * (100 - pct)) / 100;
}

export type OrderStatus = 'aguardando' | 'retornou' | 'pago' | 'nao_pago' | 'concluido' | 'cancelado';

export interface OrderReturn {
  slug: string;
  transaction_nsu: string;
  receipt_url?: string;
  capture_method?: string;
  at: number;
}

export interface OrderCheck {
  paid: boolean;
  amount?: number; // centavos
  paidAmount?: number; // centavos
  installments?: number;
  method?: string;
  manual?: boolean;
  at: number;
}

/** tenants/{t}/orders/{id} — o id é o order_nsu enviado à InfinitePay */
export interface Order {
  id: string;
  checkoutId: string;
  title: string;
  planId: string;
  planName: string;
  productId?: string;
  period: Period;
  /** Valor final cobrado (com desconto, se houver cupom) */
  price: number;
  /** Preço cheio do link, quando tem cupom */
  listPrice?: number;
  couponCode?: string;
  discountPct?: number;
  name: string;
  email: string;
  phone: string;
  cpf?: string;
  /** ?ref= da URL (cupom, influencer, campanha) */
  ref?: string;
  acceptedTerms: boolean;
  /** Cópia do texto aceito, como prova do aceite */
  termsText: string;
  acceptedAt: number;
  userAgent?: string;
  status: OrderStatus;
  linkUrl?: string;
  ret?: OrderReturn;
  check?: OrderCheck;
  clientId?: string;
  saleId?: string;
  createdAt: number;
  updatedAt?: number;
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'gold' | 'good' | 'warn' | 'bad' | 'mute' }> = {
  aguardando: { label: 'Não pagou ainda', tone: 'warn' },
  retornou: { label: 'Voltou do pagamento', tone: 'gold' },
  pago: { label: 'Pago · falta confirmar', tone: 'good' },
  nao_pago: { label: 'Pagamento não confirmado', tone: 'bad' },
  concluido: { label: 'Aluna criada', tone: 'mute' },
  cancelado: { label: 'Cancelado', tone: 'mute' },
};

export const DEFAULT_TERMS = `TERMOS DO ACOMPANHAMENTO (resumo)

1. O serviço é acompanhamento online de treino e/ou dieta, conforme o plano escolhido, pelo período contratado, contado a partir da data de início combinada.
2. O acompanhamento não substitui consulta médica. Se você tem alguma condição de saúde, informe na anamnese e siga a orientação do seu médico.
3. Resultados dependem da execução do plano, da rotina e de fatores individuais. Não há promessa de resultado específico.
4. Direito de arrependimento: você pode desistir em até 7 dias da compra, com devolução integral (Código de Defesa do Consumidor, art. 49). Depois disso, vale a política de cancelamento do contrato completo.
5. O plano é pessoal e intransferível. Treinos, dietas e materiais são de uso exclusivo seu.
6. Seus dados (nome, contato, CPF e, depois, as respostas da anamnese) são usados só para prestar o serviço, emitir nota fiscal e falar com você sobre o acompanhamento, conforme a LGPD. Você pode pedir acesso, correção ou exclusão a qualquer momento.

Ao marcar o aceite, você declara que leu e concorda com estes termos.`;

/** Reais → centavos (inteiro) */
export const cents = (v: number) => Math.round((v || 0) * 100);

export const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');

/** Telefone brasileiro → +55DDDNÚMERO (null se inválido) */
export function phoneE164(s: string): string | null {
  let d = onlyDigits(s);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return null;
  return '+55' + d;
}

export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((s || '').trim());

export function validCPF(s: string): boolean {
  const d = onlyDigits(s);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** A resposta de POST /links não é documentada: procura a URL do checkout em qualquer campo */
export function findUrl(v: unknown): string | null {
  if (typeof v === 'string') return /^https?:\/\//.test(v) ? v : null;
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  for (const k of ['url', 'link', 'checkout_url', 'payment_url']) {
    if (typeof o[k] === 'string' && /^https?:\/\//.test(o[k] as string)) return o[k] as string;
  }
  for (const val of Object.values(o)) {
    const f = findUrl(val);
    if (f) return f;
  }
  return null;
}

/** Corpo do POST /links */
export function linkPayload(link: Pick<CheckoutLink, 'handle' | 'title'>, order: Pick<Order, 'id' | 'name' | 'email' | 'phone' | 'price' | 'couponCode'>, redirectUrl: string) {
  const phone = phoneE164(order.phone);
  return {
    handle: link.handle.replace(/^\$/, '').trim(),
    items: [{ description: order.couponCode ? `${link.title} (cupom ${order.couponCode})` : link.title, price: cents(order.price), quantity: 1 }],
    order_nsu: order.id,
    redirect_url: redirectUrl,
    customer: { name: order.name, email: order.email, ...(phone ? { phone_number: phone } : {}) },
  };
}

/** Lê os parâmetros que a InfinitePay acrescenta na volta */
export function readReturn(search: string): Omit<OrderReturn, 'at'> | null {
  const p = new URLSearchParams(search);
  const slug = p.get('slug');
  const transaction_nsu = p.get('transaction_nsu');
  if (!slug || !transaction_nsu) return null;
  return {
    slug, transaction_nsu,
    ...(p.get('receipt_url') ? { receipt_url: p.get('receipt_url')! } : {}),
    ...(p.get('capture_method') ? { capture_method: p.get('capture_method')! } : {}),
  };
}

/** Cria o link de pagamento na InfinitePay */
export async function createPaymentLink(link: CheckoutLink, order: Pick<Order, 'id' | 'name' | 'email' | 'phone' | 'price' | 'couponCode'>, redirectUrl: string): Promise<string> {
  const r = await fetch(`${IP_API}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(linkPayload(link, order, redirectUrl)),
  });
  const json = await r.json().catch(() => null);
  const url = findUrl(json);
  if (!r.ok || !url) {
    console.error('InfinitePay /links', r.status, json);
    const msg = json && typeof json === 'object' && 'message' in json ? String((json as { message: unknown }).message) : `erro ${r.status}`;
    throw new Error(msg);
  }
  return url;
}

/** Confere o pagamento na InfinitePay. Só `paid: true` vale como pago. */
export async function checkPayment(handle: string, orderId: string, ret: Pick<OrderReturn, 'slug' | 'transaction_nsu'>): Promise<Omit<OrderCheck, 'at'>> {
  const r = await fetch(`${IP_API}/payment_check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle: handle.replace(/^\$/, '').trim(), order_nsu: orderId, transaction_nsu: ret.transaction_nsu, slug: ret.slug }),
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  const paid = j.success === true && j.paid === true;
  return {
    paid,
    ...(typeof j.amount === 'number' ? { amount: j.amount } : {}),
    ...(typeof j.paid_amount === 'number' ? { paidAmount: j.paid_amount } : {}),
    ...(typeof j.installments === 'number' ? { installments: j.installments } : {}),
    ...(typeof j.capture_method === 'string' ? { method: j.capture_method } : {}),
  };
}

/** Pedido "abandonado": criado há mais de 30 min e sem pagamento */
export function isAbandoned(o: Pick<Order, 'status' | 'createdAt'>, now = Date.now()): boolean {
  return o.status === 'aguardando' && now - o.createdAt > 30 * 60 * 1000;
}

/**
 * Monta a venda a partir de um pedido pago.
 * Renovação quando a aluna já tem plano: começa no dia seguinte ao vencimento atual (se ainda não venceu).
 */
export function saleFromOrder(
  o: Order,
  link: Pick<CheckoutLink, 'channelId' | 'influencerId'> | undefined,
  client: { id: string; name: string; planName?: string; endDate?: string; isTest?: boolean; hasHistory: boolean },
  today: string,
  by: string,
  /** Influencer dona do cupom usado (vale mais que a do link) */
  couponInfluencerId?: string,
): Omit<Sale, 'id' | 'createdAt'> {
  const kind = client.hasHistory ? 'renovacao' : 'nova';
  const start = kind === 'renovacao' && client.endDate && client.endDate >= today ? addDays(client.endDate, 1) : today;
  const method = o.check?.method === 'credit_card' ? 'cartao' : 'pix';
  return {
    clientId: client.id, clientName: client.name, planId: o.planId, planName: o.planName, productId: o.productId,
    period: o.period, gross: o.price, fees: 0, date: today, startDate: start, endDate: planEndDate(start, o.period),
    channelId: kind === 'renovacao' ? 'renovacao' : couponInfluencerId ? 'influencer' : link?.channelId,
    influencerId: couponInfluencerId ?? link?.influencerId,
    isRenewal: kind === 'renovacao', kind, prevPlanName: kind === 'renovacao' ? client.planName : undefined,
    status: 'aprovada', paymentMode: 'avista', parts: [], paymentMethod: method,
    installments: o.check?.installments || 1, isTest: !!client.isTest,
    notes: `Checkout InfinitePay · pedido ${o.id}${o.couponCode ? ` · cupom ${o.couponCode} (${o.discountPct}% off, cheio ${o.listPrice})` : ''}${o.ref && o.ref !== o.couponCode ? ` · ref ${o.ref}` : ''}${o.check?.paidAmount ? ` · pago pela aluna R$ ${(o.check.paidAmount / 100).toFixed(2).replace('.', ',')}` : ''}${o.check?.manual ? ' · confirmado manualmente' : ''}`,
    createdBy: by,
  };
}

/** Link público do checkout */
export function checkoutUrl(origin: string, basePath: string, tenantId: string, linkId: string, ref?: string) {
  return `${origin}${basePath}/pagar/?t=${encodeURIComponent(tenantId)}&c=${encodeURIComponent(linkId)}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`;
}
