import { describe, expect, it } from 'vitest';
import {
  addMonths, channelProgress, isActiveClient, milestoneProgress, monthlySeries, newClientsInMonth,
  parseMoney, planEndDate, renewalRate, renewalsDue, todayISO, totals, weekIndex, weekRanges,
} from '@/lib/calc';
import type { ChannelGoal, Client, Sale } from '@/lib/types';

let n = 0;
const sale = (o: Partial<Sale>): Sale => ({
  id: `s${n++}`, clientId: 'c1', clientName: 'A', planId: 'p', planName: 'Tri', period: 'trimestral',
  gross: 1000, fees: 50, date: '2026-11-03', startDate: '2026-11-03', endDate: '2027-02-02',
  isRenewal: false, status: 'aprovada', paymentMethod: 'pix', installments: 1, createdAt: 0, createdBy: 'u',
  ...o,
});
const client = (o: Partial<Client>): Client => ({
  id: 'c', name: 'Ana', status: 'ativo', createdAt: 0, updatedAt: 0, ...o,
});

describe('datas', () => {
  it('vencimento do plano', () => {
    expect(planEndDate('2026-01-01', 'trimestral')).toBe('2026-03-31');
    expect(planEndDate('2026-01-31', 'mensal')).toBe('2026-02-27');
    expect(planEndDate('2026-11-26', 'anual')).toBe('2027-11-25');
  });
  it('soma meses no fim do mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
  });
  it('semanas S1–S4, S4 até o fim', () => {
    const w = weekRanges(2026, 11);
    expect(w[0]).toMatchObject({ start: '2026-11-01', end: '2026-11-07' });
    expect(w[3]).toMatchObject({ start: '2026-11-22', end: '2026-11-30' });
    expect(weekIndex('2026-11-29')).toBe(3);
    expect(weekIndex('2026-11-08')).toBe(1);
  });
  it('hoje em Recife', () => {
    // 02:00 UTC de 27/11 ainda é 26/11 em Recife (UTC-3)
    expect(todayISO(new Date('2026-11-27T02:00:00Z'))).toBe('2026-11-26');
  });
});

describe('totais', () => {
  it('ignora pendentes, estornadas e clientes de teste', () => {
    const t = totals([
      sale({ gross: 1000, fees: 50 }),
      sale({ gross: 500, fees: 0 }),
      sale({ status: 'pendente' }),
      sale({ status: 'estornada' }),
      sale({ isTest: true }),
    ]);
    expect(t.count).toBe(2);
    expect(t.gross).toBe(1500);
    expect(t.net).toBe(1450);
    expect(t.ticket).toBe(750);
  });
});

describe('metas por canal', () => {
  const goal: ChannelGoal = {
    id: '2026-11__ind', year: 2026, month: 11, channelId: 'ind',
    weeks: [{ revenue: 1000, sales: 1 }, { revenue: 1000, sales: 1 }, { revenue: 1000, sales: 1 }, { revenue: 1000, sales: 1 }],
    manual: [{ revenue: 0, sales: 0 }, { revenue: 200, sales: 1 }, { revenue: 0, sales: 0 }, { revenue: 0, sales: 0 }],
  };
  const sales = [
    sale({ channelId: 'ind', date: '2026-11-02', gross: 1500 }),
    sale({ channelId: 'ind', date: '2026-11-23', gross: 800 }),
    sale({ channelId: 'outro', date: '2026-11-02', gross: 9999 }),
    sale({ channelId: 'ind', date: '2026-10-30', gross: 9999 }),
  ];
  it('soma vendas do canal por semana + ajuste manual', () => {
    const p = channelProgress('ind', 2026, 11, sales, goal, '2026-11-26');
    expect(p.weeks.map((w) => w.revenue)).toEqual([1500, 200, 0, 800]);
    expect(p.revenue).toBe(2500);
    expect(p.sales).toBe(3);
    expect(p.goalRevenue).toBe(4000);
    expect(p.expectedToDate).toBe(4000); // dia 26 = S4
    expect(p.status).toBe('atrasado');
  });
  it('em dia no começo do mês', () => {
    const p = channelProgress('ind', 2026, 11, sales, goal, '2026-11-05');
    expect(p.expectedToDate).toBe(1000);
    expect(p.status).toBe('em-dia');
  });
  it('sem meta', () => {
    expect(channelProgress('x', 2026, 11, sales, undefined, '2026-11-05').status).toBe('sem-meta');
  });
});

describe('clientes', () => {
  it('ativo exige status, não teste, não excluído e plano vigente', () => {
    expect(isActiveClient(client({ endDate: '2026-12-01' }), '2026-11-26')).toBe(true);
    expect(isActiveClient(client({ endDate: '2026-11-01' }), '2026-11-26')).toBe(false);
    expect(isActiveClient(client({ isTest: true }), '2026-11-26')).toBe(false);
    expect(isActiveClient(client({ deleted: true }), '2026-11-26')).toBe(false);
    expect(isActiveClient(client({ status: 'inativo' }), '2026-11-26')).toBe(false);
  });
  it('novos no mês contam clientes únicos sem renovação', () => {
    expect(newClientsInMonth([
      sale({ clientId: 'a' }), sale({ clientId: 'a' }), sale({ clientId: 'b', isRenewal: true }), sale({ clientId: 'c' }),
    ], 2026, 11)).toBe(2);
  });
  it('renovações a vencer', () => {
    const list = renewalsDue([
      client({ id: '1', endDate: '2026-12-10' }),
      client({ id: '2', endDate: '2027-03-01' }),
      client({ id: '3', endDate: '2026-11-20' }),
      client({ id: '4', endDate: '2026-12-05', isTest: true }),
    ], '2026-11-26', 30);
    expect(list.map((c) => c.id)).toEqual(['3', '1']);
  });
  it('taxa de renovação', () => {
    const r = renewalRate([
      sale({ clientId: 'a', endDate: '2026-11-10' }),
      sale({ clientId: 'a', isRenewal: true, date: '2026-11-05' }),
      sale({ clientId: 'b', endDate: '2026-11-15' }),
    ], '2026-11-01', '2026-11-30');
    expect(r).toEqual({ due: 2, renewed: 1, rate: 0.5 });
  });
});

describe('marcos e séries', () => {
  it('faturamento acumulado desde a data inicial', () => {
    const m = milestoneProgress([
      sale({ gross: 30000, date: '2026-09-01' }),
      sale({ gross: 25000, date: '2026-10-01' }),
      sale({ gross: 99999, date: '2026-07-01' }),
    ], '2026-08-05', [50000, 100000]);
    expect(m.total).toBe(55000);
    expect(m.reached).toEqual([50000]);
    expect(m.next).toBe(100000);
    expect(m.missing).toBe(45000);
    expect(m.pctToNext).toBeCloseTo(0.1);
  });
  it('série de 12 meses termina no mês pedido', () => {
    const s = monthlySeries([sale({ date: '2026-11-01', gross: 100 }), sale({ date: '2025-12-31', gross: 50 })], 2026, 11);
    expect(s).toHaveLength(12);
    expect(s[0]).toMatchObject({ y: 2025, m: 12, gross: 50 });
    expect(s[11]).toMatchObject({ y: 2026, m: 11, gross: 100 });
  });
  it('lê valores em reais', () => {
    expect(parseMoney('1.797,50')).toBe(1797.5);
    expect(parseMoney('R$ 2.097')).toBe(2097);
    expect(parseMoney('19.90')).toBe(19.9);
    expect(parseMoney('2097')).toBe(2097);
  });
});

import { deepClean } from '@/lib/calc';
describe('limpeza para o Firestore', () => {
  it('remove undefined em qualquer nível', () => {
    expect(deepClean({ a: 1, b: undefined, c: [{ d: undefined, e: 2 }], f: { g: undefined } })).toEqual({ a: 1, c: [{ e: 2 }], f: {} });
  });
});
