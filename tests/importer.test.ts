import { describe, expect, it } from 'vitest';
import { periodFromName, planImport, type Existing, type ImportPayload } from '../src/lib/importer';

let n = 0;
const opts = { productId: 'prod', today: '2026-11-27', by: 'u', newId: () => `id${++n}` };
const empty: Existing = { clients: [], plans: [], influencers: [], sales: [] };

describe('importação', () => {
  it('deduz o período pelo nome do plano', () => {
    expect(periodFromName('Garimpo Anual BK26')).toBe('anual');
    expect(periodFromName('Semestral 10%OFF')).toBe('semestral');
    expect(periodFromName('Trimestral Treino Cond. Esp')).toBe('trimestral');
    expect(periodFromName('Sem plano')).toBeNull();
  });

  const payload: ImportPayload = {
    source: 'kairos',
    influencers: [{ key: 'g', name: 'Geovanna', handle: '@geozonna', email: 'geo@x.com' }],
    clients: [
      { key: 'a', name: 'Ana', email: 'ANA@x.com' },
      { key: 'b', name: 'Bia', referredByKey: 'a', channelId: 'indicacao' },
    ],
    sales: [
      { key: 's1', clientKey: 'a', planName: 'Trimestral 25', gross: 800, date: '2025-11-10' },
      { key: 's2', clientKey: 'a', planName: 'Garimpo Anual', gross: 2097, date: '2026-02-10', kind: 'renovacao', influencerKey: 'g' },
      { key: 's3', clientKey: 'b', planName: 'Garimpo Trimestral', gross: 850, date: '2026-01-05' },
      { key: 's4', clientKey: 'x', planName: 'Anual', gross: 1, date: '2026-01-01' },
    ],
  };

  it('cria o que falta, reaproveita planos e calcula o plano vigente', () => {
    const ex: Existing = { ...empty, plans: [{ id: 'pA', name: 'Garimpo Anual', period: 'anual', productId: 'prod' }] };
    const r = planImport(payload, ex, opts);
    expect(r.clients).toHaveLength(2);
    expect(r.clients[0].email).toBe('ana@x.com');
    expect(r.clients[1].referredById).toBe(r.clients[0].id);
    expect(r.clients[1].channelId).toBe('indicacao');
    expect(r.influencers[0].handle).toBe('geozonna');
    expect(r.plans.map((p) => p.name).sort()).toEqual(['Garimpo Trimestral', 'Trimestral 25']);
    expect(r.plans.every((p) => !p.active)).toBe(true);
    expect(r.sales).toHaveLength(3);
    expect(r.warnings).toHaveLength(1);
    const s2 = r.sales.find((s) => s.importKey === 'kairos:s2')!;
    expect(s2.planId).toBe('pA');
    expect(s2.endDate).toBe('2027-02-09');
    expect(s2.channelId).toBe('renovacao');
    expect(s2.influencerId).toBe(r.influencers[0].id);
    const ana = r.clientUpdates.find((u) => u.id === r.clients[0].id)!;
    expect(ana.data.planName).toBe('Garimpo Anual');
    expect(ana.data.endDate).toBe('2027-02-09');
  });

  it('não duplica na segunda vez', () => {
    const first = planImport(payload, empty, opts);
    const ex: Existing = {
      clients: first.clients.map((c) => ({ id: c.id, name: c.name, email: c.email })),
      plans: first.plans.map((p) => ({ id: p.id, name: p.name, period: p.period, productId: p.productId })),
      influencers: first.influencers.map((i) => ({ id: i.id, name: i.name, handle: i.handle, email: i.email })),
      sales: first.sales.map((s) => ({ id: s.id, clientId: s.clientId, date: s.date, gross: s.gross, importKey: s.importKey })),
    };
    const again = planImport(payload, ex, opts);
    expect(again.clients).toHaveLength(0);
    expect(again.sales).toHaveLength(0);
    expect(again.influencers).toHaveLength(0);
    expect(again.plans).toHaveLength(0);
    expect(again.skipped).toEqual({ influencers: 1, clients: 2, sales: 3, leads: 0 });
  });
});

describe('migração: metas, indicações, campanhas', () => {
  const ex: Existing = {
    clients: [{ id: 'c1', name: 'Ludmila Souza Neres' }, { id: 'c2', name: 'Bia Garimpeira Lima' }, { id: 'c3', name: 'Carla Melo' }],
    plans: [], influencers: [{ id: 'i1', name: 'Geovanna', handle: 'geozonna' }],
    sales: [{ id: 's1', clientId: 'c1', date: '2026-11-23', gross: 2097 }, { id: 's2', clientId: 'c1', date: '2025-11-01', gross: 800, influencerId: 'i1' }, { id: 's3', clientId: 'c3', date: '2026-01-01', gross: 1 }],
    campaigns: [{ id: 'kairos-old' }],
  };
  const r = planImport({
    source: 'kairos',
    goals: [{ year: 2026, month: 9, channelId: 'renovacao', weeks: [{ revenue: 2500 }, { revenue: 2500 }, { revenue: 2500 }, { revenue: 2500 }] }],
    referrals: [{ client: 'Ludmila Souza Neres', by: 'Geovanna' }, { client: 'Carla Melo', by: 'Bia Lima' }, { client: 'Ninguém', by: 'X' }],
    campaigns: [{ key: 'old', name: 'x', occasion: 'Black Friday', start: '', end: '', status: 'ativa', offer: '', prices: [], channels: [] }, { key: 'bf', name: 'BF', occasion: 'Black Friday', start: '2026-11-20', end: '2026-11-27', status: 'ativa', offer: '', prices: [], channels: [] }],
  }, ex, opts);
  it('meta vira doc do mês/canal', () => {
    expect(r.goals).toEqual([{ id: '2026-09__renovacao', data: { year: 2026, month: 9, channelId: 'renovacao', weeks: [2500, 2500, 2500, 2500].map((v) => ({ revenue: v, sales: 0 })) } }]);
  });
  it('indicação de influencer liga cliente e vendas; de aluna vira indicada por', () => {
    expect(r.saleUpdates).toEqual([{ id: 's1', data: { influencerId: 'i1' } }]);
    expect(r.clientUpdates).toContainEqual({ id: 'c1', data: { influencerId: 'i1' } });
    expect(r.clientUpdates).toContainEqual({ id: 'c3', data: { referredById: 'c2' } });
    expect(r.warnings.some((w) => w.includes('Ninguém'))).toBe(true);
  });
  it('campanha já importada não repete', () => {
    expect(r.campaigns.map((c) => c.id)).toEqual(['kairos-bf']);
  });
});
