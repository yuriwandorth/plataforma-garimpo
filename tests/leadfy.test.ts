import { describe, expect, it } from 'vitest';
import { furtherStage } from '../src/lib/leads';
import { originKind, suggestCoupons } from '../src/lib/growth';
import { planImport, type Existing } from '../src/lib/importer';

describe('migração Leadfy', () => {
  it('etapa só avança (perdido e convertido sempre valem)', () => {
    expect(furtherStage('novo', 'negociando')).toBe('negociando');
    expect(furtherStage('negociando', 'em_contato')).toBe('negociando');
    expect(furtherStage('interesse', 'perdido')).toBe('perdido');
    expect(furtherStage('convertido', 'novo')).toBe('convertido');
  });
  it('tipo de origem pelo nome', () => {
    expect(originKind('Bio IG')).toBe('bio');
    expect(originKind('Story IG')).toBe('stories');
    expect(originKind('BK26')).toBe('campanha');
    expect(originKind('Luiza Goedert Embaixadora')).toBe('embaixadora');
    expect(originKind('Influ Geo')).toBe('influencer');
  });
  it('cupom sugerido: primeiro nome + %, sem repetir', () => {
    const r = suggestCoupons([
      { id: 'a', name: 'Isabela Pinheiro' }, { id: 'b', name: 'Isabela de Deus' }, { id: 'c', name: 'Geovanna', coupon: 'GEO10' }, { id: 'd', name: 'Júlia Moreira', couponPct: 15 },
    ]);
    expect(r).toEqual([{ id: 'a', coupon: 'ISABELA10' }, { id: 'b', coupon: 'ISABELAD10' }, { id: 'd', coupon: 'JULIA15' }]);
  });
  it('lead existente ganha etapa, origem e influencer; origem liga na influencer', () => {
    const ex: Existing = {
      clients: [], plans: [], sales: [], influencers: [{ id: 'g', name: 'Geovanna', handle: 'geozonna' }],
      leads: [{ id: 'L1', name: 'Ana', phone: '5581999990000', stage: 'em_contato' }],
    };
    const r = planImport({
      source: 'leadfy',
      leads: [{ key: 'x', name: 'Ana', phone: '5581999990000', stage: 'link_enviado', origin: 'Influ Geo', influencer: 'Geovanna' }, { key: 'y', name: 'Bia', phone: '5581988887777', stage: 'perdido', lostReason: 'Blacklist' }],
      origins: [{ name: 'Influ Geo', url: 'https://links.leadfy.chat/geozonna', influencer: 'Geovanna' }, { name: 'Bio IG' }],
    }, ex, { productId: 'p', today: '2026-11-28', by: 'u', newId: () => 'n1' });
    expect(r.leadUpdates[0].data).toMatchObject({ stage: 'link_enviado', origin: 'Influ Geo', influencerId: 'g' });
    expect(r.leads[0]).toMatchObject({ stage: 'perdido', lostReason: 'Blacklist' });
    expect(r.origins).toEqual([
      { id: 'influ-geo', name: 'Influ Geo', kind: 'influencer', source: 'leadfy', url: 'https://links.leadfy.chat/geozonna', influencerId: 'g' },
      { id: 'bio-ig', name: 'Bio IG', kind: 'bio', source: 'leadfy' },
    ]);
  });
});
