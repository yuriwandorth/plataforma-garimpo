import { describe, expect, it } from 'vitest';
import { leadBoard, matchClient, phoneKey, type Lead } from '../src/lib/leads';
import { planImport } from '../src/lib/importer';
import type { Client, Sale } from '../src/lib/types';

const L = (o: Partial<Lead>): Lead => ({ id: o.id ?? Math.random().toString(), name: 'x', source: 'waspeed', stage: 'novo', createdAt: 0, updatedAt: 0, ...o });

describe('leads', () => {
  it('telefone: mesma pessoa com ou sem 55, com ou sem o 9', () => {
    expect(phoneKey('+55 (81) 99999-1111')).toBe(phoneKey('81 9999-1111'));
    expect(phoneKey('5581999991111')).toBe('8199991111');
    expect(phoneKey('+351 910359673')).toBe('351910359673');
    expect(phoneKey('123')).toBe('');
  });

  it('cruza lead com aluna pelo telefone ou e-mail', () => {
    const clients = [{ id: 'a', phone: '81999991111' }, { id: 'b', email: 'bia@x.com' }] as Client[];
    expect(matchClient({ phone: '+55 81 9999-1111' }, clients)?.id).toBe('a');
    expect(matchClient({ email: 'BIA@x.com ' }, clients)?.id).toBe('b');
    expect(matchClient({ phone: '81888887777' }, clients)).toBeUndefined();
  });

  it('conversão e tempo até comprar', () => {
    const clients = [{ id: 'a', name: 'Ana', phone: '81999991111', status: 'ativo' }] as Client[];
    const sales = [{ id: 's', clientId: 'a', date: '2026-03-11', status: 'aprovada', gross: 850 }] as Sale[];
    const b = leadBoard([
      L({ name: 'Ana', phone: '5581999991111', list: 'Aquisição', firstSeenAt: '2026-03-01' }),
      L({ name: 'Bia', phone: '81988887777', list: 'Aquisição' }),
      L({ name: 'Cris', phone: '81977776666', list: 'Recall', stage: 'perdido' }),
    ], clients, sales);
    expect(b.converted).toBe(1);
    expect(b.lost).toBe(1);
    expect(b.open).toBe(1);
    expect(b.conversion).toBeCloseTo(1 / 3);
    expect(b.avgDaysToConvert).toBe(10);
    expect(b.byList[0]).toMatchObject({ list: 'Aquisição', total: 2, converted: 1 });
  });

  it('importação de leads: um por telefone, junta listas e reconhece quem já é aluna', () => {
    let n = 0;
    const r = planImport({
      source: 'waspeed',
      leads: [
        { key: '1', name: 'Ana', phone: '81999991111', list: 'Aquisição' },
        { key: '2', name: 'Ana', phone: '+55 81 9999-1111', list: 'Recall' },
        { key: '3', name: 'Bia', phone: '81988887777', list: 'Aquisição', firstSeenAt: '2026-01-01' },
        { key: '4', name: 'Sem contato' },
      ],
    }, { clients: [{ id: 'cA', name: 'Ana', phone: '5581999991111' } as Client], plans: [], influencers: [], sales: [], leads: [{ id: 'old', name: 'Bia', phone: '8188887777', list: 'Aquisição', stage: 'novo' }] },
    { productId: 'p', today: '2026-11-27', by: 'u', newId: () => `id${++n}` });
    expect(r.leads).toHaveLength(1);
    expect(r.leads[0]).toMatchObject({ name: 'Ana', stage: 'convertido', clientId: 'cA', list: 'Aquisição', tags: ['Recall'] });
    expect(r.skipped.leads).toBe(1);
    expect(r.warnings).toHaveLength(1);
  });
});
