// Importação em massa (ex.: dados da Kairós): planeja o que é novo e o que já existe, sem duplicar.
// Função pura testada em tests/importer.test.ts; a página /importar só grava o plano.
import type { Client, ClientStatus, PaymentMethod, Period, Plan, Sale, SaleKind } from './types';
import type { Influencer } from './growth';
import { planEndDate } from './calc';
import { matchClient, phoneKey, type Lead, type LeadStage } from './leads';

export interface ImpInfluencer { key: string; name: string; handle: string; email?: string; network?: string; closedAt?: string; coupon?: string }
export interface ImpClient { key: string; name: string; email?: string; phone?: string; cpf?: string; status?: ClientStatus; notes?: string; channelId?: string; referredByKey?: string; isTest?: boolean }
export interface ImpSale {
  key: string;
  clientKey: string;
  planName: string;
  period?: Period;
  gross: number;
  fees?: number;
  date: string;
  startDate?: string;
  endDate?: string;
  kind?: SaleKind;
  paymentMethod?: PaymentMethod;
  installments?: number;
  influencerKey?: string;
  channelId?: string;
  notes?: string;
}
export interface ImpLead { key: string; name: string; phone?: string; email?: string; list?: string; originStage?: string; stage?: LeadStage; tags?: string[]; firstSeenAt?: string; lastContactAt?: string; lastFromMe?: boolean; notes?: string; channelId?: string }
export interface ImportPayload { source: string; influencers?: ImpInfluencer[]; clients?: ImpClient[]; sales?: ImpSale[]; leads?: ImpLead[] }

type WithId<T> = T & { id: string };
export interface Existing {
  clients: Pick<Client, 'id' | 'name' | 'email' | 'phone' | 'endDate' | 'deleted'>[];
  plans: Pick<Plan, 'id' | 'name' | 'period' | 'productId'>[];
  influencers: Pick<Influencer, 'id' | 'name' | 'handle' | 'email'>[];
  sales: (Pick<Sale, 'id' | 'clientId' | 'date' | 'gross'> & { importKey?: string })[];
  leads?: Pick<Lead, 'id' | 'name' | 'phone' | 'email' | 'list' | 'tags' | 'deleted' | 'stage' | 'clientId' | 'lastContactAt'>[];
}

export interface ImportPlan {
  influencers: WithId<Omit<Influencer, 'id' | 'createdAt' | 'updatedAt'> & { importKey: string }>[];
  plans: WithId<Omit<Plan, 'id' | 'createdAt'>>[];
  clients: WithId<Omit<Client, 'id' | 'createdAt' | 'updatedAt'> & { importKey: string }>[];
  sales: WithId<Omit<Sale, 'id' | 'createdAt'> & { importKey: string }>[];
  /** Plano vigente recalculado para cada cliente que recebeu vendas */
  clientUpdates: { id: string; data: Partial<Client> }[];
  leads: WithId<Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>>[];
  /** Leads que já existiam e ganharam lista/etiqueta nova */
  leadUpdates: { id: string; data: Partial<Lead> }[];
  skipped: { influencers: number; clients: number; sales: number; leads: number };
  warnings: string[];
}

const norm = (s?: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const handleKey = (s?: string) => norm(s).replace(/^@/, '');
/** Palavras do nome sem apelidos da comunidade (ex.: "Garimpeira") */
const nameTokens = (s?: string) => norm(s).replace(/[^a-z\s]/g, ' ').split(' ').filter((w) => w.length > 1 && !/^garimp(eir[oa]s?|o)$/.test(w));
const hasLetters = (s?: string) => /[a-zà-ú]/i.test(s ?? '');

/** Período deduzido do nome do plano quando não vier informado */
export function periodFromName(name: string): Period | null {
  const n = norm(name);
  if (/anual|12 ?m/.test(n)) return 'anual';
  if (/semestral|6 ?m/.test(n)) return 'semestral';
  if (/trimestral|3 ?m/.test(n)) return 'trimestral';
  if (/mensal|1 ?m/.test(n)) return 'mensal';
  return null;
}

export function planImport(p: ImportPayload, ex: Existing, opts: { productId: string; today: string; by: string; newId: () => string }): ImportPlan {
  const out: ImportPlan = { influencers: [], plans: [], clients: [], sales: [], clientUpdates: [], leads: [], leadUpdates: [], skipped: { influencers: 0, clients: 0, sales: 0, leads: 0 }, warnings: [] };
  const src = p.source;

  // Influencers: casa por @ ou e-mail
  const infByKey = new Map<string, string>();
  for (const i of p.influencers ?? []) {
    const found = ex.influencers.find((e) => (i.handle && handleKey(e.handle) === handleKey(i.handle)) || (i.email && norm(e.email) === norm(i.email)));
    if (found) { infByKey.set(i.key, found.id); out.skipped.influencers++; continue; }
    const id = opts.newId();
    infByKey.set(i.key, id);
    out.influencers.push({
      id, importKey: `${src}:${i.key}`, name: i.name.trim(), network: i.network ?? 'Instagram', handle: handleKey(i.handle) || norm(i.name).replace(/\s/g, ''),
      email: i.email?.trim().toLowerCase() || undefined, coupon: i.coupon?.toUpperCase() || undefined, stage: 'fechado', deal: 'comissao', active: true,
      notes: `Importada de ${src}${i.closedAt ? ` · fechada em ${i.closedAt}` : ''}`,
    } as ImportPlan['influencers'][number]);
  }

  // Clientes: casa por e-mail; sem e-mail, por nome
  const cliByKey = new Map<string, { id: string; isNew: boolean }>();
  const live = ex.clients.filter((c) => !c.deleted);
  for (const c of p.clients ?? []) {
    const found = live.find((e) => (c.email && e.email && norm(e.email) === norm(c.email)) || (!c.email && norm(e.name) === norm(c.name)))
      ?? out.clients.find((e) => (c.email && e.email && norm(e.email) === norm(c.email)) || (!c.email && norm(e.name) === norm(c.name)));
    if (found) { cliByKey.set(c.key, { id: found.id, isNew: false }); out.skipped.clients++; continue; }
    const id = opts.newId();
    cliByKey.set(c.key, { id, isNew: true });
    out.clients.push({
      id, importKey: `${src}:${c.key}`, name: c.name.trim(), email: c.email?.trim().toLowerCase() || undefined, phone: c.phone || undefined, cpf: c.cpf || undefined,
      status: c.status ?? 'ativo', notes: c.notes || undefined, channelId: c.channelId || undefined, isTest: c.isTest || undefined,
    } as ImportPlan['clients'][number]);
  }
  // Indicações: quem indicou (só nas clientes novas)
  for (const c of p.clients ?? []) {
    if (!c.referredByKey) continue;
    const me = cliByKey.get(c.key);
    const by = cliByKey.get(c.referredByKey);
    const rec = me?.isNew ? out.clients.find((x) => x.id === me.id) : undefined;
    if (rec && by && by.id !== me!.id) rec.referredById = by.id;
  }

  // Planos: casa pelo nome; cria os que faltam (inativos, só para o histórico)
  const planByName = new Map<string, { id: string; name: string; period: Period }>();
  for (const pl of ex.plans) planByName.set(norm(pl.name), { id: pl.id, name: pl.name, period: pl.period });
  function planFor(s: ImpSale) {
    const k = norm(s.planName || 'Sem plano');
    const hit = planByName.get(k);
    if (hit) return hit;
    const period = s.period ?? periodFromName(s.planName) ?? 'trimestral';
    const id = opts.newId();
    const created = { id, name: s.planName?.trim() || 'Sem plano', period };
    planByName.set(k, created);
    out.plans.push({ id, productId: opts.productId, name: created.name, description: `Plano antigo importado de ${src}`, period, price: s.gross, paymentMethods: ['pix', 'cartao'], maxInstallments: 12, couple: false, active: false, seed: false });
    return created;
  }

  // Vendas: não repete a mesma (importKey, ou cliente + data + valor)
  const clientNames = new Map<string, string>([...live.map((c) => [c.id, c.name] as const), ...out.clients.map((c) => [c.id, c.name] as const)]);
  for (const s of p.sales ?? []) {
    const cli = cliByKey.get(s.clientKey);
    if (!cli) { out.warnings.push(`Venda ${s.key}: cliente ${s.clientKey} não encontrada`); continue; }
    const importKey = `${src}:${s.key}`;
    const dup = ex.sales.some((e) => e.importKey === importKey || (e.clientId === cli.id && e.date === s.date && Math.abs(e.gross - s.gross) < 0.01));
    if (dup) { out.skipped.sales++; continue; }
    const pl = planFor(s);
    const start = s.startDate || s.date;
    const kind: SaleKind = s.kind ?? 'nova';
    const inf = s.influencerKey ? infByKey.get(s.influencerKey) : undefined;
    out.sales.push({
      id: opts.newId(), importKey, clientId: cli.id, clientName: clientNames.get(cli.id) ?? '', planId: pl.id, planName: pl.name, productId: opts.productId,
      period: pl.period, gross: s.gross, fees: s.fees ?? 0, date: s.date, startDate: start, endDate: s.endDate || planEndDate(start, pl.period),
      channelId: s.channelId || (kind === 'renovacao' ? 'renovacao' : inf ? 'influencer' : undefined), influencerId: inf,
      isRenewal: kind === 'renovacao', kind, status: 'aprovada', paymentMode: 'avista', parts: [], paymentMethod: s.paymentMethod ?? 'pix',
      installments: s.installments ?? 1, notes: [`Importada de ${src}`, s.notes].filter(Boolean).join(' · '), createdBy: opts.by,
    } as ImportPlan['sales'][number]);
  }

  // Plano vigente: a venda com o maior vencimento de cada cliente
  const latest = new Map<string, ImportPlan['sales'][number]>();
  for (const s of out.sales) {
    const cur = latest.get(s.clientId);
    if (!cur || s.endDate > cur.endDate || (s.endDate === cur.endDate && s.date > cur.date)) latest.set(s.clientId, s);
  }
  for (const [clientId, s] of latest) {
    const prevEnd = ex.clients.find((c) => c.id === clientId)?.endDate;
    if (prevEnd && prevEnd > s.endDate) continue;
    const imported = out.clients.find((c) => c.id === clientId);
    out.clientUpdates.push({
      id: clientId,
      data: {
        planId: s.planId, planName: s.planName, startDate: s.startDate, endDate: s.endDate, lastValue: s.gross, period: s.period,
        ...(imported?.status ? {} : { status: s.endDate >= opts.today ? 'ativo' : 'inativo' }),
        ...(s.influencerId ? { influencerId: s.influencerId } : {}),
      },
    });
  }
  // Leads: um por telefone (ou e-mail); se já existe, só soma lista/etiquetas; se já é aluna, entra como convertido
  const exLeads = (ex.leads ?? []).filter((l) => !l.deleted);
  const seen = new Map<string, number>();
  const phoneFilled = new Set<string>();
  const allClients = [...live, ...out.clients.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, deleted: false }))];
  for (const l of p.leads ?? []) {
    const pk = phoneKey(l.phone);
    const em = (l.email ?? '').trim().toLowerCase();
    if (!pk && !em) { out.warnings.push(`Lead ${l.name || l.key}: sem telefone nem e-mail`); continue; }
    const k = pk || `e:${em}`;
    const dupIdx = seen.get(k);
    if (dupIdx !== undefined) {
      const d = out.leads[dupIdx];
      d.tags = [...new Set([...(d.tags ?? []), ...(l.tags ?? []), ...(l.list && l.list !== d.list ? [l.list] : [])])];
      if (l.firstSeenAt && (!d.firstSeenAt || l.firstSeenAt < d.firstSeenAt)) d.firstSeenAt = l.firstSeenAt;
      continue;
    }
    const exist = exLeads.find((e) => (pk && phoneKey(e.phone) === pk) || (em && (e.email ?? '').toLowerCase() === em));
    let client = matchClient({ phone: l.phone, email: em }, allClients);
    let byName = false;
    if (!client && l.name) {
      // nome (2+ palavras) que bate com uma única aluna: mesmo primeiro nome e o resto contido no nome dela
      const t = nameTokens(l.name);
      if (t.length >= 2) {
        const fl = `${t[0]} ${t[t.length - 1]}`;
        const hits = allClients.filter((c) => {
          const ct = nameTokens(c.name);
          return ct.length >= 2 && ct[0] === t[0] && (`${ct[0]} ${ct[ct.length - 1]}` === fl || t.every((w) => ct.includes(w)));
        });
        if (hits.length === 1) { client = hits[0]; byName = true; }
      }
    }
    // aluna reconhecida sem telefone na ficha: ganha o telefone do lead
    if (client && l.phone && !client.phone && !phoneFilled.has(client.id)) {
      phoneFilled.add(client.id);
      const isNew = out.clients.find((c) => c.id === client!.id);
      if (isNew) isNew.phone = l.phone.replace(/\D/g, '');
      else out.clientUpdates.push({ id: client.id, data: { phone: l.phone.replace(/\D/g, '') } });
    }
    if (exist) {
      out.skipped.leads++;
      const data: Partial<Lead> = {};
      const generic = !exist.list || /sem etiqueta|sem lista/i.test(exist.list);
      if (generic && l.list) data.list = l.list;
      const tags = [...new Set([...(exist.tags ?? []), ...(l.tags ?? []), ...(l.list && l.list !== exist.list && !data.list ? [l.list] : [])])];
      if (tags.length !== (exist.tags ?? []).length) data.tags = tags;
      if (client && !exist.clientId && exist.stage !== 'convertido') { data.clientId = client.id; data.stage = 'convertido'; }
      if (!hasLetters(exist.name) && hasLetters(l.name)) data.name = l.name.trim();
      if (l.lastContactAt && (!exist.lastContactAt || l.lastContactAt > exist.lastContactAt || (l.lastContactAt === exist.lastContactAt && l.lastFromMe !== undefined))) { data.lastContactAt = l.lastContactAt; if (l.lastFromMe !== undefined) data.lastFromMe = l.lastFromMe; }
      if (Object.keys(data).length) out.leadUpdates.push({ id: exist.id, data });
      continue;
    }
    const id = opts.newId();
    seen.set(k, out.leads.length);
    out.leads.push({
      id, importKey: `${src}:${l.key}`, name: (hasLetters(l.name) ? l.name : l.phone || em).trim(), phone: l.phone?.replace(/\D/g, '') || undefined, email: em || undefined,
      source: src.split(':')[0], list: l.list || undefined, originStage: l.originStage || undefined,
      stage: client ? 'convertido' : (l.stage ?? 'novo'), tags: l.tags?.length ? l.tags : undefined,
      firstSeenAt: l.firstSeenAt || undefined, lastContactAt: l.lastContactAt || undefined, lastFromMe: l.lastFromMe, notes: l.notes || undefined, channelId: l.channelId || undefined,
      clientId: client?.id,
      ...(byName ? { notes: [l.notes, 'Ligada à aluna pelo nome'].filter(Boolean).join(' · ') } : {}),
    });
  }
  return out;
}
