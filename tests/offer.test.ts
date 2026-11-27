import { describe, expect, it } from 'vitest';
import { installmentTable, newOffer, prettyPrice, priceForNet, suggestedPrice, vsSuggested, whatsappText, type Offer } from '@/lib/offer';

function sample(): Offer {
  const o = { id: 'x', ...newOffer('Teste') } as Offer;
  o.tiers.anual.price = 2497; o.tiers.semestral.price = 1600; o.tiers.trimestral.price = 950; o.tiers.mensal.price = 497;
  o.tiers.trimestral.items = { ...o.tiers.trimestral.items, comunidade: 1, desafio: 1 };
  o.tiers.semestral.items = { ...o.tiers.trimestral.items, calls: 3, live: 2, 'consulta-medica': 1 };
  o.tiers.anual.items = { ...o.tiers.semestral.items, calls: 6, live: 4, evento: 1 };
  o.fees = { ...o.fees, maxInstallments: 12, passToClient: false, installmentPct: [0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24] };
  return o;
}

describe('preços', () => {
  it('sugestão a partir do anual', () => {
    expect(suggestedPrice(2497, 'semestral', 20)).toBe(1498); // igual à Kairós
    expect(Math.round((vsSuggested(1600, 1498) ?? 0) * 100)).toBe(7);
  });
  it('preço bonito termina em 7', () => {
    expect(prettyPrice(2497)).toBe(2497);
    expect(prettyPrice(1600)).toBe(1607);
    expect(prettyPrice(950)).toBe(957);
    expect(prettyPrice(958)).toBe(967);
  });
  it('calculadora reversa', () => {
    expect(priceForNet(1000, { checkoutPct: 5, installmentPct: [], maxInstallments: 1, passToClient: false })).toBe(1052.63);
  });
});

describe('parcelamento', () => {
  it('sem repasse: você absorve a taxa', () => {
    const t = installmentTable(1000, { checkoutPct: 0, installmentPct: [0, 4], maxInstallments: 2, passToClient: false });
    expect(t).toEqual([
      { n: 1, perInstallment: 1000, clientTotal: 1000, net: 1000 },
      { n: 2, perInstallment: 500, clientTotal: 1000, net: 960 },
    ]);
  });
  it('com repasse: a aluna paga a taxa e você recebe o preço', () => {
    const t = installmentTable(1000, { checkoutPct: 0, installmentPct: [0, 4], maxInstallments: 2, passToClient: true });
    expect(t[1]).toEqual({ n: 2, perInstallment: 520.83, clientTotal: 1041.67, net: 1000 });
  });
});

describe('texto do WhatsApp', () => {
  it('do menor para o maior, só o que muda', () => {
    const txt = whatsappText(sample(), 'Maria Silva');
    expect(txt.startsWith('Oi, Maria! Separei os planos pra você:')).toBe(true);
    expect(txt).toContain('🗓️ Mensal — R$ 497\nTreino personalizado');
    expect(txt).toContain('🗓️ Trimestral — 3x de R$ 317\nTudo do Mensal +\nComunidade\nDesafio interno');
    expect(txt).toContain('Tudo do Trimestral +\n3x Calls de acompanhamento\n2x Live exclusiva\n1x Consulta médica');
    expect(txt).toContain('🗓️ Anual — 12x de R$ 208\nTudo do Semestral +\n6x Calls de acompanhamento\n4x Live exclusiva\nEvento presencial anual');
    expect(txt.endsWith('Qual desses planos faz mais sentido pra você?')).toBe(true);
  });
  it('plano desligado não aparece', () => {
    const o = sample(); o.tiers.mensal.enabled = false;
    const txt = whatsappText(o);
    expect(txt).not.toContain('Mensal —');
    expect(txt).toContain('🗓️ Trimestral — 3x de R$ 317\nTreino personalizado');
  });
});
