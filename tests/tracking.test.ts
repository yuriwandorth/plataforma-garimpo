import { describe, expect, it } from 'vitest';
import { codeFromMessage, defaultMessage, lastWeeks, originSlug, perWeek, waUrl, weekStart } from '../src/lib/tracking';

describe('links rastreados', () => {
  it('endereço: reaproveita o da Leadfy, senão o id', () => {
    expect(originSlug({ id: 'influ-geo', url: 'https://links.leadfy.chat/geozonna' })).toBe('geozonna');
    expect(originSlug({ id: 'bio-ig' })).toBe('bio-ig');
    expect(originSlug({ id: 'x', slug: 'Bio Insta!' })).toBe('bio-insta');
  });
  it('mensagem pronta traz a origem e o código, que a triagem reconhece', () => {
    const m = defaultMessage({ kind: 'influencer', name: 'Influ Geo' }, 'geozonna', 'Geovanna Silva');
    expect(m).toContain('indicação da Geovanna');
    expect(codeFromMessage(m)).toBe('geozonna');
    expect(defaultMessage({ kind: 'bio', name: 'Bio IG' }, 'ogarimpoig')).toContain('link da bio');
  });
  it('WhatsApp com DDI do Brasil', () => {
    expect(waUrl('81 99999-0000', 'oi')).toBe('https://wa.me/5581999990000?text=oi');
  });
  it('semanas de segunda a domingo e contagem', () => {
    expect(weekStart('2026-11-28')).toBe('2026-11-23'); // sábado → segunda
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
    const w = lastWeeks('2026-11-28', 2);
    expect(w.map((x) => [x.start, x.end])).toEqual([['2026-11-16', '2026-11-22'], ['2026-11-23', '2026-11-29']]);
    expect(perWeek(['2026-11-17', '2026-11-24', '2026-11-25', '2026-10-01'], (d) => d, w)).toEqual([1, 2]);
  });
});
