// Importação por planilha (.xlsx ou .csv): casa as colunas com os campos da plataforma
// e transforma as linhas no pacote de importação (importer.ts). Funções puras, testadas em tests/sheetImport.test.ts.
import type { ImpClient, ImpInfluencer, ImpLead, ImpSale, ImportPayload } from './importer';
import type { ClientStatus, PaymentMethod, SaleKind } from './types';
import { parseMoney } from './calc';

export type SheetKind = 'clientes' | 'influencers' | 'leads';
export type Cell = string | number | boolean | Date | null | undefined;

export interface FieldDef { id: string; label: string; required?: boolean; hint?: string; synonyms: string[] }

export const FIELDS: Record<SheetKind, FieldDef[]> = {
  clientes: [
    { id: 'name', label: 'Nome', required: true, synonyms: ['nome', 'nome completo', 'cliente', 'aluna', 'aluno', 'nome do cliente'] },
    { id: 'email', label: 'E-mail', synonyms: ['email', 'e-mail', 'e mail', 'mail'] },
    { id: 'phone', label: 'Telefone / WhatsApp', synonyms: ['telefone', 'whatsapp', 'celular', 'fone', 'contato', 'phone'] },
    { id: 'cpf', label: 'CPF', synonyms: ['cpf', 'documento'] },
    { id: 'status', label: 'Status', hint: 'ativo, inativo ou cancelado', synonyms: ['status', 'situacao', 'situação'] },
    { id: 'channel', label: 'Canal de origem', synonyms: ['canal', 'origem', 'canal de venda', 'fonte'] },
    { id: 'notes', label: 'Observação', synonyms: ['observacao', 'observação', 'obs', 'notas', 'anotacoes'] },
    { id: 'plan', label: 'Plano', hint: 'a linha só vira venda se tiver plano, valor e data', synonyms: ['plano', 'produto', 'oferta'] },
    { id: 'value', label: 'Valor da venda', synonyms: ['valor', 'valor da venda', 'preco', 'preço', 'total', 'valor pago', 'bruto'] },
    { id: 'date', label: 'Data da venda', synonyms: ['data', 'data da venda', 'data venda', 'data de compra', 'data da compra', 'contratacao', 'contratação', 'inicio', 'início'] },
    { id: 'end', label: 'Vencimento', hint: 'se vazio, calcula pelo período do plano', synonyms: ['vencimento', 'fim', 'data fim', 'termino', 'término', 'validade', 'expira'] },
    { id: 'kind', label: 'Tipo da venda', hint: 'nova, renovação ou troca', synonyms: ['tipo', 'tipo da venda', 'tipo de venda'] },
    { id: 'method', label: 'Forma de pagamento', hint: 'pix, cartão ou boleto', synonyms: ['forma de pagamento', 'pagamento', 'meio de pagamento', 'metodo'] },
    { id: 'installments', label: 'Parcelas', synonyms: ['parcelas', 'nº de parcelas', 'qtd parcelas', 'parcelamento'] },
  ],
  influencers: [
    { id: 'name', label: 'Nome', required: true, synonyms: ['nome', 'influencer', 'nome completo'] },
    { id: 'handle', label: '@ do perfil', required: true, synonyms: ['@', 'instagram', 'perfil', 'usuario', 'usuário', 'arroba', 'handle', 'insta'] },
    { id: 'email', label: 'E-mail', synonyms: ['email', 'e-mail', 'mail'] },
    { id: 'coupon', label: 'Cupom', synonyms: ['cupom', 'cupom de desconto', 'codigo', 'código'] },
    { id: 'network', label: 'Rede', synonyms: ['rede', 'rede social', 'plataforma'] },
  ],
  leads: [
    { id: 'name', label: 'Nome', synonyms: ['nome', 'contato', 'nome do contato', 'cliente', 'lead', 'name'] },
    { id: 'phone', label: 'Telefone / WhatsApp', required: true, synonyms: ['telefone', 'whatsapp', 'numero', 'número', 'celular', 'phone', 'fone'] },
    { id: 'email', label: 'E-mail', synonyms: ['email', 'e-mail', 'mail'] },
    { id: 'list', label: 'Lista / funil', synonyms: ['lista', 'funil', 'coluna', 'quadro', 'pipeline', 'kanban'] },
    { id: 'stage', label: 'Etapa', synonyms: ['etapa', 'status', 'estagio', 'estágio', 'fase'] },
    { id: 'tags', label: 'Etiquetas', hint: 'separadas por vírgula', synonyms: ['etiquetas', 'etiqueta', 'tags', 'tag', 'labels'] },
    { id: 'date', label: 'Data de entrada', synonyms: ['data', 'data de entrada', 'criado em', 'entrada', 'data de criacao', 'data de criação', 'created'] },
    { id: 'notes', label: 'Observação', synonyms: ['observacao', 'observação', 'obs', 'notas', 'anotacao', 'anotação'] },
  ],
};

export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Lê CSV (vírgula ou ponto e vírgula, aspas, quebras de linha dentro de aspas) */
export function parseCSV(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Acha a linha de cabeçalho (a primeira com 2+ textos) e casa cada campo com uma coluna */
export function autoMap(headers: Cell[], kind: SheetKind): Record<string, number> {
  const h = headers.map(norm);
  const map: Record<string, number> = {};
  const used = new Set<number>();
  // 1º: nome exato; 2º: contém
  for (const pass of ['exact', 'contains'] as const) {
    for (const f of FIELDS[kind]) {
      if (map[f.id] !== undefined) continue;
      const idx = h.findIndex((col, i) => !used.has(i) && col && f.synonyms.some((s) => (pass === 'exact' ? col === norm(s) : col.includes(norm(s)) && norm(s).length >= 3)));
      if (idx >= 0) { map[f.id] = idx; used.add(idx); }
    }
  }
  return map;
}

export function headerRowIndex(rows: Cell[][]): number {
  const i = rows.findIndex((r) => r.filter((c) => typeof c === 'string' && c.trim() && !/^\d+([.,]\d+)?$/.test(c.trim())).length >= 2);
  return i < 0 ? 0 : i;
}

/** Data em vários formatos → YYYY-MM-DD ('' se inválida) */
export function toISODate(v: Cell): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // número de série do Excel (dias desde 30/12/1899)
    return toISODate(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5));
  }
  const s = String(v ?? '').trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = Number(m[1]); const mo = Number(m[2]);
    const real = new Date(Date.UTC(y, mo - 1, d));
    if (mo >= 1 && mo <= 12 && real.getUTCDate() === d && real.getUTCMonth() === mo - 1) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return '';
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

export function toMoney(v: Cell): number {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  const s = String(v ?? '').replace(/[R$\s]/g, '');
  if (!s) return 0;
  // 1.234,56 (BR) ou 1234.56 (EN)
  if (/,\d{1,2}$/.test(s)) return parseMoney(s);
  if (/^\d+(\.\d{1,2})$/.test(s)) return Number(s);
  return parseMoney(s);
}

const STATUS: Record<string, ClientStatus> = { ativo: 'ativo', ativa: 'ativo', active: 'ativo', inativo: 'inativo', inativa: 'inativo', vencido: 'inativo', vencida: 'inativo', cancelado: 'cancelado', cancelada: 'cancelado' };
function toStatus(v: Cell): ClientStatus | undefined { const n = norm(v); return STATUS[n] ?? (n.startsWith('ativ') ? 'ativo' : n.startsWith('inativ') ? 'inativo' : n.startsWith('cancel') ? 'cancelado' : undefined); }
function toKind(v: Cell): SaleKind | undefined { const n = norm(v); if (!n) return undefined; if (n.startsWith('renov')) return 'renovacao'; if (n.startsWith('troca') || n.includes('upgrade')) return 'troca'; if (n.startsWith('nov')) return 'nova'; return undefined; }
function toMethod(v: Cell): PaymentMethod | undefined { const n = norm(v); if (!n) return undefined; if (n.includes('pix')) return 'pix'; if (n.includes('cart') || n.includes('credito') || n.includes('card')) return 'cartao'; if (n.includes('boleto')) return 'boleto'; return undefined; }

export interface SheetResult { payload: ImportPayload; rowErrors: string[]; rows: number }

/**
 * Transforma as linhas no pacote de importação.
 * Clientes: cada linha é uma cliente; se tiver plano + valor + data, vira também uma venda.
 * A mesma cliente pode aparecer em várias linhas (uma por venda).
 */
export function sheetToPayload(rows: Cell[][], headerIdx: number, map: Record<string, number>, kind: SheetKind, channels: { id: string; name: string }[], source = 'planilha'): SheetResult {
  const get = (r: Cell[], f: string) => (map[f] === undefined ? undefined : r[map[f]]);
  const str = (r: Cell[], f: string) => { const v = get(r, f); return v === undefined || v === null ? '' : v instanceof Date ? toISODate(v) : String(v).trim(); };
  const errors: string[] = [];
  const data = rows.slice(headerIdx + 1);
  const chanByName = new Map(channels.map((c) => [norm(c.name), c.id] as const));
  const chan = (v: string) => { const n = norm(v); if (!n) return undefined; return chanByName.get(n) ?? channels.find((c) => norm(c.name).includes(n) || n.includes(norm(c.name)))?.id; };

  if (kind === 'influencers') {
    const influencers: ImpInfluencer[] = [];
    data.forEach((r, i) => {
      const name = str(r, 'name'); const handle = str(r, 'handle').replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
      if (!name && !handle) return;
      if (!name || !handle) { errors.push(`Linha ${headerIdx + i + 2}: falta ${!name ? 'o nome' : 'o @'}`); return; }
      influencers.push({ key: handle.toLowerCase(), name, handle, email: str(r, 'email') || undefined, coupon: str(r, 'coupon') || undefined, network: str(r, 'network') || 'Instagram' });
    });
    return { payload: { source, influencers }, rowErrors: errors, rows: influencers.length };
  }

  if (kind === 'leads') {
    const leads: ImpLead[] = [];
    data.forEach((r, i) => {
      const phone = str(r, 'phone').replace(/\D/g, '');
      const email = str(r, 'email').toLowerCase();
      if (!phone && !email) { if (r.some((c) => String(c ?? '').trim())) errors.push(`Linha ${headerIdx + i + 2}: sem telefone`); return; }
      const tags = str(r, 'tags').split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
      leads.push({ key: phone || email, name: str(r, 'name'), phone: phone || undefined, email: email || undefined, list: str(r, 'list') || undefined,
        originStage: str(r, 'stage') || undefined, tags: tags.length ? tags : undefined, firstSeenAt: toISODate(get(r, 'date')) || undefined, notes: str(r, 'notes') || undefined });
    });
    return { payload: { source, leads }, rowErrors: errors, rows: leads.length };
  }

  const clients = new Map<string, ImpClient>();
  const sales: ImpSale[] = [];
  let n = 0;
  data.forEach((r, i) => {
    const line = headerIdx + i + 2;
    const name = str(r, 'name');
    if (!name) { if (r.some((c) => String(c ?? '').trim())) errors.push(`Linha ${line}: sem nome, ignorada`); return; }
    n++;
    const email = str(r, 'email').toLowerCase();
    const key = email || `nome:${norm(name)}`;
    const prev = clients.get(key);
    const phone = str(r, 'phone').replace(/\D/g, '');
    clients.set(key, {
      key, name: prev?.name ?? name, email: email || undefined,
      phone: prev?.phone ?? (phone.length >= 8 ? phone : undefined),
      cpf: prev?.cpf ?? (str(r, 'cpf').replace(/\D/g, '') || undefined),
      status: toStatus(get(r, 'status')) ?? prev?.status,
      channelId: prev?.channelId ?? chan(str(r, 'channel')),
      notes: [prev?.notes, str(r, 'notes')].filter(Boolean).join(' · ') || undefined,
    });
    const plan = str(r, 'plan'); const value = toMoney(get(r, 'value')); const date = toISODate(get(r, 'date'));
    if (plan || map.value !== undefined) {
      if (!plan && !value && !date) return;
      if (!plan || !value || !date) { errors.push(`Linha ${line} (${name}): venda ignorada, falta ${[!plan && 'plano', !value && 'valor', !date && 'data válida'].filter(Boolean).join(', ')}`); return; }
      const end = toISODate(get(r, 'end'));
      const inst = Number(String(get(r, 'installments') ?? '').replace(/\D/g, '')) || undefined;
      sales.push({ key: `${key}|${date}|${value}|${line}`, clientKey: key, planName: plan, gross: value, date, endDate: end || undefined,
        kind: toKind(get(r, 'kind')), paymentMethod: toMethod(get(r, 'method')), installments: inst, channelId: chan(str(r, 'channel')) });
    }
  });
  // venda mais antiga sem tipo = nova; as seguintes = renovação
  const byClient = new Map<string, ImpSale[]>();
  for (const s of sales) byClient.set(s.clientKey, [...(byClient.get(s.clientKey) ?? []), s]);
  for (const list of byClient.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    list.forEach((s, i) => { if (!s.kind) s.kind = i === 0 ? 'nova' : 'renovacao'; if (s.kind === 'renovacao') delete s.channelId; });
  }
  return { payload: { source, clients: [...clients.values()], sales }, rowErrors: errors, rows: n };
}
