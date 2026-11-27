import { describe, expect, it } from 'vitest';
import { ambassadorEarning, ambassadorRanking, commissionFor, DEFAULT_TIERS, opportunityQuadrant, overallAverage, rankLevel, referralRadar, trialDaysLeft } from '@/lib/growth';
import type { Client, Sale } from '@/lib/types';

let n = 0;
const sale = (o: Partial<Sale>): Sale => ({
  id: `s${n++}`, clientId: 'c1', clientName: 'Ana', planId: 'p', planName: 'Tri', period: 'trimestral',
  gross: 1000, fees: 0, date: '2026-11-03', startDate: '2026-11-03', endDate: '2027-02-02',
  isRenewal: false, status: 'aprovada', paymentMethod: 'pix', installments: 1, createdAt: 0, createdBy: 'u', ...o,
});
const client = (o: Partial<Client>): Client => ({ id: 'c', name: 'Ana', status: 'ativo', createdAt: 0, updatedAt: 0, ...o });

describe('comissão de influencer', () => {
  it('faixa pelo faturamento do mês (igual à Kairós)', () => {
    expect(commissionFor(0, DEFAULT_TIERS)).toMatchObject({ tier: { name: 'Bronze', pct: 10 }, value: 0, missing: 4000 });
    const r = commissionFor(5000, DEFAULT_TIERS);
    expect(r.tier.name).toBe('Prata');
    expect(r.value).toBe(600);
    expect(r.next?.name).toBe('Ouro');
    expect(r.missing).toBe(1500);
    expect(commissionFor(20000, DEFAULT_TIERS)).toMatchObject({ tier: { name: 'Diamante' }, value: 4000, next: null });
  });
  it('dias de permuta', () => {
    expect(trialDaysLeft({ trialEnd: '2026-12-01' }, '2026-11-27')).toBe(4);
    expect(trialDaysLeft({}, '2026-11-27')).toBeNull();
  });
});

describe('embaixadoras', () => {
  const clients = [client({ id: 'a', name: 'Fernando' }), client({ id: 'b', name: 'Yngra' }), client({ id: 'x', referredById: 'a', endDate: '2027-05-01' }), client({ id: 'y', referredById: 'b', status: 'inativo' })];
  const sales = [
    sale({ clientId: 'x', referredById: 'a', gross: 1897, date: '2026-11-10' }),
    sale({ clientId: 'y', referredById: 'b', gross: 1797, date: '2026-11-12' }),
    sale({ clientId: 'z', referredById: 'a', gross: 900, date: '2026-10-01' }),
    sale({ clientId: 'x', referredById: 'a', gross: 1897, date: '2026-11-20', isRenewal: true }),
  ];
  it('ranking do mês por receita com nível', () => {
    const r = ambassadorRanking(sales, clients, { y: 2026, m: 11 }, 'receita');
    expect(r.map((x) => [x.name, x.volume, x.revenue, x.level, x.prevVolume])).toEqual([
      ['Fernando', 1, 1897, 'Ouro', 1], ['Yngra', 1, 1797, 'Prata', 0],
    ]);
  });
  it('ranking de tudo soma meses', () => {
    expect(ambassadorRanking(sales, clients, 'tudo', 'volume')[0]).toMatchObject({ name: 'Fernando', volume: 2, revenue: 2797 });
  });
  it('ganho pela negociação', () => {
    expect(ambassadorEarning({ id: 'a', deal: 'meses', value: 1 }, { volume: 2, revenue: 0 })).toBe('2 mês(es) a mais de plano');
    expect(ambassadorEarning({ id: 'a', deal: 'comissao', value: 10 }, { volume: 1, revenue: 1897 })).toBe('R$ 190 de comissão');
    expect(ambassadorEarning(undefined, { volume: 1, revenue: 1 })).toBe('sem negociação');
  });
  it('radar e mapa de oportunidades', () => {
    const r = referralRadar(sales, clients, 2026, 11, '2026-11-27');
    expect(r).toMatchObject({ clients: 4, referrers: 2, notYet: 2, monthReferrals: 2, activated: 1, referredTotal: 2, retained: 1, retention: 0.5, renewedInMonth: 1 });
    const q = opportunityQuadrant(ambassadorRanking(sales, clients, { y: 2026, m: 11 }, 'receita'));
    expect(q.escalar.map((x) => x.name)).toEqual(['Fernando']);
  });
});

describe('ranking', () => {
  it('média e nível', () => {
    const avg = overallAverage({ scores: { marketing: [2, 2, 3, 2, 2, 2], vendas: [3, 2, 2, 3, 2], entrega: [3, 3, 2, 3, 2, 3, 2], operacao: [3, 3, 2], financeiro: [3, 2, 3, 2] } });
    expect(avg).toBe(2.48); // média das 5 áreas (2,2 · 2,4 · 2,6 · 2,7 · 2,5)
    expect(rankLevel(avg)).toBe('Prata');
    expect(rankLevel(3.6)).toBe('Diamante');
  });
});
