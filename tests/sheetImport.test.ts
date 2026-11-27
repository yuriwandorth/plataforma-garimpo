import { describe, expect, it } from 'vitest';
import { autoMap, headerRowIndex, parseCSV, sheetToPayload, toISODate, toMoney } from '../src/lib/sheetImport';
import { planImport } from '../src/lib/importer';

const channels = [{ id: 'organico', name: 'Orgânico Próprio' }, { id: 'indicacao', name: 'Indicação' }, { id: 'influencer', name: 'Influencer' }];

describe('planilha', () => {
  it('lê CSV com ; e aspas', () => {
    const r = parseCSV('﻿Nome;Valor;Obs\n"Ana; Lima";"1.497,00";"disse ""oi"""\nBia;850;\n\n');
    expect(r).toEqual([['Nome', 'Valor', 'Obs'], ['Ana; Lima', '1.497,00', 'disse "oi"'], ['Bia', '850', '']]);
  });

  it('acha cabeçalho e casa colunas pelo nome', () => {
    const rows = [['Relatório de vendas'], ['Nome do cliente', 'E-mail', 'WhatsApp', 'Plano', 'Valor pago', 'Data da venda', 'Vencimento', 'Canal']];
    const h = headerRowIndex(rows);
    expect(h).toBe(1);
    const m = autoMap(rows[h], 'clientes');
    expect(m).toMatchObject({ name: 0, email: 1, phone: 2, plan: 3, value: 4, date: 5, end: 6, channel: 7 });
  });

  it('entende datas e valores em vários formatos', () => {
    expect(toISODate('05/03/2026')).toBe('2026-03-05');
    expect(toISODate('5/3/26')).toBe('2026-03-05');
    expect(toISODate('2026-03-05')).toBe('2026-03-05');
    expect(toISODate(46086)).toBe('2026-03-05');
    expect(toISODate(new Date(Date.UTC(2026, 2, 5)))).toBe('2026-03-05');
    expect(toISODate('31/02/2026')).toBe('');
    expect(toISODate('abc')).toBe('');
    expect(toMoney('R$ 2.247,00')).toBe(2247);
    expect(toMoney('1497.5')).toBe(1497.5);
    expect(toMoney(850)).toBe(850);
  });

  it('linhas viram clientes e vendas; a mesma cliente em várias linhas', () => {
    const rows = [
      ['Nome', 'E-mail', 'Plano', 'Valor', 'Data', 'Canal', 'Status'],
      ['Ana Lima', 'ANA@x.com', 'Trimestral', '850', '10/01/2026', 'Indicação', 'Ativo'],
      ['Ana Lima', 'ana@x.com', 'Anual', '2.097', '10/04/2026', 'Indicação', 'ativo'],
      ['Bia', '', '', '', '', 'orgânico próprio', 'inativa'],
      ['', '', 'x', '1', '01/01/2026', '', ''],
      ['Carla', 'c@x.com', 'Anual', '', '01/01/2026', '', ''],
    ];
    const m = autoMap(rows[0], 'clientes');
    const r = sheetToPayload(rows, 0, m, 'clientes', channels);
    expect(r.payload.clients).toHaveLength(3);
    expect(r.payload.clients![0]).toMatchObject({ email: 'ana@x.com', status: 'ativo', channelId: 'indicacao' });
    expect(r.payload.clients![1]).toMatchObject({ name: 'Bia', status: 'inativo', channelId: 'organico' });
    expect(r.payload.sales).toHaveLength(2);
    expect(r.payload.sales![0]).toMatchObject({ kind: 'nova', channelId: 'indicacao', gross: 850, date: '2026-01-10' });
    expect(r.payload.sales![1]).toMatchObject({ kind: 'renovacao', gross: 2097 });
    expect(r.payload.sales![1].channelId).toBeUndefined();
    expect(r.rowErrors).toHaveLength(2);
    const plan = planImport(r.payload, { clients: [], plans: [], influencers: [], sales: [] }, { productId: 'p', today: '2026-11-27', by: 'u', newId: (() => { let i = 0; return () => `i${++i}`; })() });
    expect(plan.clients).toHaveLength(3);
    expect(plan.sales).toHaveLength(2);
  });

  it('influencers: @ de link do Instagram', () => {
    const rows = [['Nome', 'Instagram', 'Cupom'], ['Geovanna', 'https://instagram.com/geozonna/', 'GEO10'], ['Sem arroba', '', '']];
    const r = sheetToPayload(rows, 0, autoMap(rows[0], 'influencers'), 'influencers', channels);
    expect(r.payload.influencers).toEqual([{ key: 'geozonna', name: 'Geovanna', handle: 'geozonna', email: undefined, coupon: 'GEO10', network: 'Instagram' }]);
    expect(r.rowErrors).toHaveLength(1);
  });
});

import { listFromFileName } from '../src/lib/sheetImport';
describe('lista pelo nome do arquivo', () => {
  it('waspeed', () => {
    expect(listFromFileName('waspeed_aba_Leads_frios.xlsx')).toBe('Leads frios');
    expect(listFromFileName('a7bb0b99-waspeed_aba_Ex-Alunos.xlsx')).toBe('Ex-Alunos');
    expect(listFromFileName('contatos junho.csv')).toBe('contatos junho');
  });
  it('lista padrão nas linhas sem coluna de lista', () => {
    const rows = [['WhatsApp', 'Name'], ['558195707014', '+55 81 95707-014'], ['556792622203', 'Ana Costa Garimpeira']];
    const r = sheetToPayload(rows, 0, autoMap(rows[0], 'leads'), 'leads', [], 'planilha', 'Leads frios');
    expect(r.payload.leads).toHaveLength(2);
    expect(r.payload.leads![1]).toMatchObject({ name: 'Ana Costa Garimpeira', phone: '556792622203', list: 'Leads frios' });
  });
});
