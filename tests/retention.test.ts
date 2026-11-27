import { describe, expect, it } from 'vitest';
import { currentOutcome, recallList, recallMessage, renewalBoard, suggestedRecall, type RClient } from '../src/lib/retention';
import type { Sale } from '../src/lib/types';

const base = { createdAt: 0, updatedAt: 0 };
const c = (id: string, o: Partial<RClient>): RClient => ({ id, name: id, status: 'ativo', ...base, ...o } as RClient);
const today = '2026-11-27';

describe('retenção', () => {
  const clients: RClient[] = [
    c('aVencer', { endDate: '2026-11-30', lastValue: 650 }),
    c('semDecisao', { endDate: '2026-11-25', lastValue: 850 }),
    c('atrasada', { endDate: '2026-11-10', lastValue: 800 }),
    c('negocia', { endDate: '2026-11-12', lastValue: 700, outcome: { cycleEnd: '2026-11-12', status: 'negociando', decidedAt: today, followUpAt: '2026-11-30' } }),
    c('saiu', { endDate: '2026-11-05', status: 'inativo', lastValue: 1600, outcome: { cycleEnd: '2026-11-05', status: 'nao_renovou', reason: 'financeiro', decidedAt: today } }),
    c('pausa', { endDate: '2026-11-15', status: 'inativo', lastValue: 765, outcome: { cycleEnd: '2026-11-15', status: 'pausa', reason: 'saude', decidedAt: today, returnAt: '2027-02-01' } }),
    c('historico', { endDate: '2026-11-02', status: 'inativo', lastValue: 500 }),
    c('outroMes', { endDate: '2026-12-10' }),
    c('decisaoVelha', { endDate: '2026-11-20', outcome: { cycleEnd: '2026-08-20', status: 'nao_renovou', reason: 'rotina', decidedAt: '2026-08-25' } }),
  ];
  const sales = [{ id: 's', kind: 'renovacao', status: 'aprovada', date: '2026-11-09', gross: 1897 }] as unknown as Sale[];

  it('separa cada vencimento pelo destino', () => {
    const b = renewalBoard(clients, sales, 2026, 11, today);
    expect(b.aVencer.map((r) => r.client.id)).toEqual(['aVencer']);
    expect(b.semDecisao.map((r) => r.client.id)).toEqual(['atrasada', 'decisaoVelha', 'semDecisao']);
    expect(b.atrasadas.map((r) => r.client.id)).toEqual(['atrasada']);
    expect(b.negociando.map((r) => r.client.id)).toEqual(['negocia']);
    expect(b.perdidas.map((r) => r.client.id).sort()).toEqual(['historico', 'pausa', 'saiu']);
    expect(b.renovadas).toHaveLength(1);
    expect(b.receitaPerdida).toBe(1600 + 765 + 500);
    expect(b.taxaPerda).toBeCloseTo(3 / 9);
    expect(b.taxaRenovacao).toBeCloseTo(1 / 9);
    expect(b.motivos.map((m) => m.key).sort()).toEqual(['financeiro', 'saude', 'sem_motivo']);
  });

  it('decisão de um ciclo antigo não vale para o novo', () => {
    expect(currentOutcome(clients[8])).toBeUndefined();
    expect(currentOutcome(clients[4])?.status).toBe('nao_renovou');
  });

  it('sugere a data do recall pelo motivo ou pela volta da pausa', () => {
    expect(suggestedRecall({ status: 'nao_renovou', reason: 'financeiro' }, today)).toBe('2027-01-26');
    expect(suggestedRecall({ status: 'pausa', returnAt: '2027-02-01' }, today)).toBe('2027-01-25');
    expect(suggestedRecall({ status: 'pausa', returnAt: '2026-11-28' }, today)).toBe(today);
  });

  it('fila de recall: quem está na hora primeiro, sem quem pediu para não ser chamada', () => {
    const list = recallList([
      c('a', { status: 'inativo', endDate: '2026-06-01', recall: { nextAt: '2026-12-20', attempts: 0 } }),
      c('b', { status: 'inativo', endDate: '2026-05-01', recall: { nextAt: '2026-11-20', attempts: 1 } }),
      c('c', { status: 'inativo', endDate: '2026-09-01' }),
      c('d', { status: 'inativo', recall: { attempts: 2, optOut: true } }),
      c('e', { status: 'ativo' }),
    ], today);
    expect(list.map((r) => r.client.id)).toEqual(['b', 'a', 'c']);
    expect(list[0].due).toBe(true);
  });

  it('mensagem muda com o motivo', () => {
    expect(recallMessage('Ana', 'financeiro')).toContain('financeira');
    expect(recallMessage('Ana')).toContain('Oi, Ana!');
  });
});
