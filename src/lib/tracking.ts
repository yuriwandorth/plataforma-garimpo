// Links rastreados: cada origem tem um link curto (/r/?l=slug) que conta o clique e abre o WhatsApp com mensagem pronta.
// Funções puras, testadas em tests/tracking.test.ts.
import { addDays } from './calc';
import type { TrackedOrigin } from './growth';

/** go/{slug}: o que a página pública precisa para redirecionar */
export interface GoLink {
  tenantId: string;
  originId: string;
  name: string;
  whatsapp: string;
  message: string;
  active: boolean;
  updatedAt: number;
}

/** tenants/{t}/clicks/{id} */
export interface Click { id: string; slug: string; originId: string; day: string; at: number }

/** Endereço curto do link: o que estava na Leadfy (links.leadfy.chat/geozonna → geozonna) ou o id da origem */
export function originSlug(o: Pick<TrackedOrigin, 'id' | 'slug' | 'url'>): string {
  if (o.slug) return cleanSlug(o.slug);
  const m = (o.url ?? '').match(/links\.leadfy\.chat\/([^/?#]+)/);
  return cleanSlug(m ? m[1] : o.id);
}
export const cleanSlug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function trackUrl(origin: string, slug: string): string {
  return `${origin}/r/?l=${slug}`;
}

/** Mensagem pronta que chega no WhatsApp: diz de onde a pessoa veio (e traz o código para a triagem) */
export function defaultMessage(o: Pick<TrackedOrigin, 'kind' | 'name'>, slug: string, influencerName?: string): string {
  const first = influencerName?.trim().split(/\s+/)[0];
  const how = o.kind === 'influencer' || o.kind === 'embaixadora'
    ? `Vim pela indicação da ${first || o.name}`
    : o.kind === 'bio' ? 'Vim pelo link da bio'
    : o.kind === 'stories' ? 'Vim pelos stories'
    : o.kind === 'campanha' ? `Vim pela campanha ${o.name}`
    : `Vim pelo link ${o.name}`;
  return `Oi! ${how} e quero saber mais sobre a consultoria 💛 (cód. ${slug})`;
}

export function waUrl(phone: string, message: string): string {
  const d = phone.replace(/\D/g, '');
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}?text=${encodeURIComponent(message)}`;
}

/** Acha o código do link numa mensagem ("cód. geozonna") */
export function codeFromMessage(text: string): string | null {
  const m = text.match(/c[óo]d\.?\s*([a-z0-9-]{2,60})/i);
  return m ? m[1].toLowerCase() : null;
}

/** Semana de segunda a domingo que contém o dia */
export function weekStart(day: string): string {
  const [y, m, dd] = day.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7; // segunda = 0
  return addDays(day, -dow);
}

/** Últimas N semanas (segunda→domingo), da mais antiga para a atual */
export function lastWeeks(today: string, n: number): { start: string; end: string; label: string }[] {
  const cur = weekStart(today);
  return Array.from({ length: n }, (_, i) => {
    const start = addDays(cur, -7 * (n - 1 - i));
    const end = addDays(start, 6);
    return { start, end, label: `${start.slice(8, 10)}/${start.slice(5, 7)}` };
  });
}

/** Conta itens por semana pelo campo de dia */
export function perWeek<T>(items: T[], day: (x: T) => string | undefined, weeks: { start: string; end: string }[]): number[] {
  return weeks.map((w) => items.filter((x) => { const d = day(x); return !!d && d >= w.start && d <= w.end; }).length);
}
