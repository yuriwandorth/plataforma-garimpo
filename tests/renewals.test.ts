import { describe, expect, it } from 'vitest';
import { buildParts, mrr, newClientsInMonth, receivables, renewalMonth, upgradeStats, weeklyCompare } from '@/lib/calc';
import type { Client, Sale } from '@/lib/types';

let n = 0;
const sale = (o: Partial<Sale>): Sale => ({
  id: `s${n++}`, clientId: 'c1', clientName: 'Ana', planId: 'p', planName: 'Tri', period: 'trimestral',
  gross: 1000, fees: 0, date: '2026-11-03', startDate: '2026-11-03', endDate: '2027-02-02',
  isRenewal: false, status: 'aprovada', paymentMethod: 'pix', installments: 1, createdAt: 0, createdBy: 'u', ...o,
});
const client = (o: Partial<Client>): Client => ({ id: 'c', name: 'Ana', status: 'ativo', createdAt: 0, updatedAt: 0, ...o });

describe('renovações do mês', () => {
  it('a renovar, renovadas, vencidos, taxa', () => {
    const clients = [
      client({ id: 'a', endDate: '2026-11-10', lastValue: 800 }),
      client({ id: 'b', endDate: '2026-11-30', lastValue: 650 }),
      client({ id: 'c', endDate: '2026-12-10', lastValue: 999 }),
      client({ id: 'd', endDate: '2026-11-15', isTest: true }),
    ];
    const sales = [sale({ isRenewal: true, date: '2026-11-05', gross: 1997 }), sale({ date: '2026-11-06' })];
    const r = renewalMonth(clients, sales, 2026, 11, '2026-11-27');
    expect(r.toRenew.map((c) => c.id)).toEqual(['a', 'b']);
    expect(r.estimatedRevenue).toBe(1450);
    expect(r.overdue).toBe(1);
    expect(r.renewed).toHaveLength(1);
    expect(r.rate).toBeCloseTo(1 / 3);
  });
});

describe('cobranças', () => {
  it('monta sinal + restante e parcelado somando o total', () => {
    const s = buildParts(1000, 'sinal', 3, '2026-11-10', 400);
    expect(s.map((p) => p.amount)).toEqual([400, 300, 300]);
    expect(s[0]).toMatchObject({ status: 'pago', paidAt: '2026-11-10' });
    expect(s[2].due).toBe('2027-01-10');
    const p = buildParts(1000, 'parcelado', 3, '2026-11-10');
    expect(p.map((x) => x.amount)).toEqual([333.33, 333.33, 333.34]);
  });
  it('a receber, recebidas, inadimplência e saldo em aberto', () => {
    const sales = [
      sale({ clientId: 'a', parts: [
        { due: '2026-10-15', amount: 300, status: 'pago', paidAt: '2026-10-15' },
        { due: '2026-11-15', amount: 300, status: 'pendente' },
        { due: '2026-12-15', amount: 300, status: 'pendente' },
      ] }),
      sale({ clientId: 'b', parts: [
        { due: '2026-11-25', amount: 200, status: 'pago', paidAt: '2026-11-26' },
        { due: '2026-11-30', amount: 200, status: 'pendente' },
      ] }),
      sale({ clientId: 'x', status: 'estornada', parts: [{ due: '2026-11-01', amount: 999, status: 'pendente' }] }),
    ];
    const r = receivables(sales, 2026, 11, '2026-11-27');
    expect(r.pending.map((p) => p.amount)).toEqual([300, 200]);
    expect(r.pendingValue).toBe(500);
    expect(r.receivedValue).toBe(200);
    expect(r.overdueValue).toBe(300);
    expect(r.delinquency).toBeCloseTo(300 / 700);
    expect(r.openBalance).toBe(800);
    expect(r.openClients).toBe(2);
  });
});

describe('ascensão e MRR', () => {
  it('subiu, manteve, caiu (só renovação e troca)', () => {
    const st = upgradeStats([
      sale({ clientId: 'a', date: '2026-01-01', gross: 765, planName: 'Tri' }),
      sale({ clientId: 'a', date: '2026-04-01', gross: 2247, planName: 'Anual', isRenewal: true }),
      sale({ clientId: 'b', date: '2026-01-01', gross: 1600 }),
      sale({ clientId: 'b', date: '2026-07-01', gross: 1600, isRenewal: true }),
      sale({ clientId: 'c', date: '2026-01-01', gross: 1600 }),
      sale({ clientId: 'c', date: '2026-07-01', gross: 800, kind: 'troca' }),
    ]);
    expect([st.up, st.same, st.down]).toEqual([1, 1, 1]);
    expect(st.ups[0]).toMatchObject({ from: 'Tri', to: 'Anual', diff: 1482 });
  });
  it('troca de plano não conta como cliente novo', () => {
    expect(newClientsInMonth([sale({ clientId: 'a', kind: 'troca' }), sale({ clientId: 'b' })], 2026, 11)).toBe(1);
  });
  it('MRR normaliza pelo período', () => {
    const r = mrr([
      client({ lastValue: 2400, period: 'anual', endDate: '2027-01-01' }),
      client({ lastValue: 900, period: 'trimestral', endDate: '2027-01-01' }),
    ], '2026-11-27');
    expect(r).toEqual({ value: 500, count: 2 });
  });
  it('semana vs mês anterior e maior queda', () => {
    const w = weeklyCompare([
      sale({ date: '2026-11-03', gross: 500, channelId: 'org' }),
      sale({ date: '2026-10-02', gross: 1000, channelId: 'ren' }),
      sale({ date: '2026-10-03', gross: 200, channelId: 'org' }),
    ], 2026, 11);
    expect(w[0]).toMatchObject({ value: 500, prevValue: 1200 });
    expect(w[0].worst).toEqual({ channelId: 'ren', drop: -1 });
  });
});
