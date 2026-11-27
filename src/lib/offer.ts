// Construtor de ofertas: 4 planos (anual é a base), entregáveis por plano, taxas e texto para WhatsApp.
// Funções puras, testadas em tests/offer.test.ts.

export type TierKey = 'anual' | 'semestral' | 'trimestral' | 'mensal';
export const TIERS: TierKey[] = ['anual', 'semestral', 'trimestral', 'mensal'];
export const TIER_LABEL: Record<TierKey, string> = { anual: 'Anual', semestral: 'Semestral', trimestral: 'Trimestral', mensal: 'Mensal' };
export const TIER_MONTHS: Record<TierKey, number> = { anual: 12, semestral: 6, trimestral: 3, mensal: 1 };

export type Category = 'base' | 'proximidade' | 'pertencimento' | 'conveniencia' | 'extra';
export const CATEGORY_LABEL: Record<Category, { title: string; sub: string }> = {
  base: { title: 'Base', sub: 'Incluído em todos os planos' },
  proximidade: { title: 'Proximidade', sub: 'Quanto acesso a aluna tem a você' },
  pertencimento: { title: 'Pertencimento', sub: 'A aluna faz parte de algo maior' },
  conveniencia: { title: 'Conveniência', sub: 'Tudo em um lugar só' },
  extra: { title: 'Extras do Garimpo', sub: 'Entregáveis que você criou' },
};

export interface Deliverable {
  id: string;
  name: string;
  description?: string;
  category: Category;
  /** Tem quantidade (ex.: 3x calls) */
  countable?: boolean;
  /** Sempre incluso em todos os planos */
  always?: boolean;
}

export interface TierConfig {
  enabled: boolean;
  price: number;
  /** Plano cadastrado em Produtos e planos (opcional) */
  planId?: string;
  /** id do entregável → quantidade (0 = não incluso; 1 = incluso sem quantidade) */
  items: Record<string, number>;
}

export interface Fees {
  /** % do checkout sobre a venda (0–100) */
  checkoutPct: number;
  /** % total cobrado pela operadora para cada nº de parcelas: índice 0 = 1x … 11 = 12x */
  installmentPct: number[];
  maxInstallments: number;
  /** Juros do parcelamento repassados à aluna (ela paga mais, você recebe o preço cheio) */
  passToClient: boolean;
}

export interface Offer {
  id: string;
  name: string;
  tiers: Record<TierKey, TierConfig>;
  catalog: Deliverable[];
  fees: Fees;
  /** Prêmio sobre o mensal-equivalente do anual para sugerir o preço de cada plano */
  premiums: Record<Exclude<TierKey, 'anual'>, number>;
  header: string;
  closing: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_CATALOG: Deliverable[] = [
  { id: 'treino', name: 'Treino personalizado', category: 'base', always: true },
  { id: 'dieta', name: 'Dieta personalizada', category: 'base', always: true },
  { id: 'feedback', name: 'Feedback semanal', category: 'base', always: true },
  { id: 'plataforma', name: 'Acesso à plataforma', category: 'base', always: true },
  { id: 'call-boas-vindas', name: 'Call de boas-vindas', description: 'Uma call no início para receber a aluna, alinhar objetivos e criar o primeiro vínculo.', category: 'proximidade' },
  { id: 'calls', name: 'Calls de acompanhamento', description: 'Calls ao longo do plano para revisar o progresso.', category: 'proximidade', countable: true },
  { id: 'resposta', name: 'Tempo de resposta garantido', description: 'Resposta dentro do prazo combinado.', category: 'proximidade' },
  { id: 'close-friends', name: 'Close friends', description: 'Acesso aos bastidores: rotina real, erros, aprendizados.', category: 'proximidade' },
  { id: 'live', name: 'Live exclusiva', description: 'Live só para alunas do plano.', category: 'proximidade', countable: true },
  { id: 'masterclass', name: 'Masterclass exclusiva', description: 'Conteúdo gravado aprofundado, só para alunas do plano.', category: 'proximidade' },
  { id: 'comunidade', name: 'Comunidade', description: 'Grupo onde as alunas interagem entre si e com você.', category: 'pertencimento' },
  { id: 'historias', name: 'Histórias em destaque', description: 'Aluna que bate a meta vira case na comunidade.', category: 'pertencimento' },
  { id: 'desafio', name: 'Desafio interno', description: 'Competição entre as alunas do grupo.', category: 'pertencimento' },
  { id: 'badge', name: 'Badge de nível', description: 'Selo que identifica o plano da aluna na comunidade.', category: 'pertencimento' },
  { id: 'collab', name: 'Collab com top 3', description: 'As 3 melhores em resultado aparecem em conteúdo com você.', category: 'pertencimento' },
  { id: 'evento', name: 'Evento presencial anual', description: 'Um encontro presencial por ano.', category: 'pertencimento' },
  { id: 'consulta-medica', name: 'Consulta médica', description: 'Consulta com médico parceiro.', category: 'conveniencia', countable: true },
  { id: 'guia-exames', name: 'Guia de exames', description: 'Exames relevantes e como pedir.', category: 'conveniencia' },
  { id: 'suplementacao', name: 'Protocolo de suplementação', description: 'Alinhado ao treino e à dieta.', category: 'conveniencia' },
  { id: 'receita', name: 'Receita médica', description: 'Receita para suplementos ou medicamentos do protocolo.', category: 'conveniencia' },
  { id: 'cupom-farmacia', name: 'Cupom de farmácia', description: 'Desconto em farmácia parceira.', category: 'conveniencia' },
  { id: 'fisio', name: 'Suporte de fisioterapeuta', description: 'Acesso a fisioterapeuta parceiro.', category: 'conveniencia' },
  { id: 'psico', name: 'Suporte psicológico', description: 'Acesso a psicólogo parceiro.', category: 'conveniencia' },
];

/** Tabela padrão: ~1,9% por parcela a partir de 2x (substitua pela tabela real da sua maquininha) */
export const DEFAULT_INSTALLMENT_PCT = Array.from({ length: 12 }, (_, i) => (i === 0 ? 0 : Math.round(i * 1.9 * 100) / 100));

export function newOffer(name = 'Nova oferta'): Omit<Offer, 'id'> {
  const base = Object.fromEntries(DEFAULT_CATALOG.filter((d) => d.always).map((d) => [d.id, 1]));
  const tier = (price: number): TierConfig => ({ enabled: true, price, items: { ...base } });
  return {
    name,
    tiers: { anual: tier(0), semestral: tier(0), trimestral: tier(0), mensal: tier(0) },
    catalog: DEFAULT_CATALOG,
    fees: { checkoutPct: 0, installmentPct: [...DEFAULT_INSTALLMENT_PCT], maxInstallments: 12, passToClient: true },
    premiums: { semestral: 20, trimestral: 40, mensal: 100 },
    header: 'PLANOS DE ACOMPANHAMENTO',
    closing: 'Qual desses planos faz mais sentido pra você?',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Preço por mês do plano */
export const perMonth = (price: number, tier: TierKey) => price / TIER_MONTHS[tier];

/** Sugestão: mensal-equivalente do anual × meses × (1 + prêmio%) */
export function suggestedPrice(anualPrice: number, tier: TierKey, premiumPct: number): number {
  if (tier === 'anual' || !anualPrice) return anualPrice;
  return Math.round((anualPrice / 12) * TIER_MONTHS[tier] * (1 + premiumPct / 100));
}

/** Diferença do preço atual para a sugestão, em % */
export function vsSuggested(price: number, suggested: number): number | null {
  if (!suggested || !price) return null;
  return (price - suggested) / suggested;
}

/** "Preço bonito": próximo valor inteiro terminado em 7 (2.497 já é bonito; 1.600 → 1.607) */
export function prettyPrice(price: number): number {
  const p = Math.ceil(price);
  if (p % 10 === 7) return p;
  return p + ((17 - (p % 10)) % 10);
}

export interface InstallmentRow {
  n: number;
  /** Quanto a aluna paga em cada parcela */
  perInstallment: number;
  /** Total pago pela aluna */
  clientTotal: number;
  /** Quanto você recebe */
  net: number;
}

/**
 * Tabela de parcelamento de 1x até o máximo.
 * Sem repasse: a aluna paga o preço; você recebe preço − checkout − taxa da parcela.
 * Com repasse: a aluna paga o preço acrescido da taxa da parcela; você recebe preço − checkout.
 */
export function installmentTable(price: number, fees: Fees): InstallmentRow[] {
  const rows: InstallmentRow[] = [];
  const checkout = (fees.checkoutPct || 0) / 100;
  for (let n = 1; n <= Math.max(1, Math.min(12, fees.maxInstallments || 1)); n++) {
    const fee = (fees.installmentPct[n - 1] || 0) / 100;
    if (fees.passToClient) {
      const clientTotal = fee < 1 ? price / (1 - fee) : price;
      rows.push({ n, perInstallment: r2(clientTotal / n), clientTotal: r2(clientTotal), net: r2(price * (1 - checkout)) });
    } else {
      rows.push({ n, perInstallment: r2(price / n), clientTotal: r2(price), net: r2(price * (1 - checkout) * (1 - fee)) });
    }
  }
  return rows;
}

/** Calculadora reversa: quanto cobrar à vista para receber `wanted` líquido */
export function priceForNet(wanted: number, fees: Fees): number {
  const checkout = (fees.checkoutPct || 0) / 100;
  return checkout < 1 ? r2(wanted / (1 - checkout)) : wanted;
}

/** Entregáveis incluídos num plano, na ordem do catálogo */
export function includedItems(offer: Pick<Offer, 'catalog' | 'tiers'>, tier: TierKey): { d: Deliverable; qty: number }[] {
  const items = offer.tiers[tier].items;
  return offer.catalog.filter((d) => d.always || (items[d.id] ?? 0) > 0).map((d) => ({ d, qty: d.always ? 1 : items[d.id] }));
}

const fmtInt = (v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(v));

/** Texto da linha de preço: mensal à vista, demais "Nx de R$ …" (parcela sem juros ou com repasse) */
export function priceLine(offer: Pick<Offer, 'tiers' | 'fees'>, tier: TierKey): string {
  const price = offer.tiers[tier].price;
  const months = TIER_MONTHS[tier];
  if (months === 1) return `R$ ${fmtInt(price)}`;
  const n = Math.min(months, offer.fees.maxInstallments || months);
  const row = installmentTable(price, offer.fees).find((r) => r.n === n);
  return `${n}x de R$ ${fmtInt(row ? row.perInstallment : price / n)}`;
}

/**
 * Texto para WhatsApp: do menor para o maior plano, cada um com "Tudo do <anterior> +" e só o que muda.
 * Quantidades aparecem como "3x" quando o item tem contagem.
 */
export function whatsappText(offer: Offer, studentName?: string): string {
  const order = [...TIERS].reverse().filter((t) => offer.tiers[t].enabled && offer.tiers[t].price > 0);
  const lines: string[] = [];
  const first = studentName?.trim().split(/\s+/)[0];
  if (first) lines.push(`Oi, ${first}! Separei os planos pra você:`, '');
  if (offer.header) lines.push(offer.header, '');
  let prev: TierKey | null = null;
  for (const t of order) {
    lines.push(`🗓️ ${TIER_LABEL[t]} — ${priceLine(offer, t)}`);
    const cur = includedItems(offer, t);
    if (prev) {
      const before = new Map(includedItems(offer, prev).map((x) => [x.d.id, x.qty]));
      lines.push(`Tudo do ${TIER_LABEL[prev]} +`);
      cur.filter((x) => (before.get(x.d.id) ?? 0) !== x.qty).forEach((x) => lines.push(itemLabel(x.d, x.qty)));
    } else {
      cur.forEach((x) => lines.push(itemLabel(x.d, x.qty)));
    }
    lines.push('');
    prev = t;
  }
  if (offer.closing) lines.push(offer.closing);
  return lines.join('\n').trim();
}

function itemLabel(d: Deliverable, qty: number) {
  return d.countable && qty > 1 ? `${qty}x ${d.name}` : d.countable && qty === 1 ? `1x ${d.name}` : d.name;
}
