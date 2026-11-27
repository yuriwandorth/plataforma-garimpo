import { describe, expect, it } from 'vitest';
import { cents, couponCode, discounted, findUrl, isAbandoned, linkPayload, phoneE164, readReturn, saleFromOrder, validCPF, validEmail, type Order } from '../src/lib/checkout';

describe('checkout', () => {
  it('converte reais em centavos', () => {
    expect(cents(1497)).toBe(149700);
    expect(cents(10.1)).toBe(1010);
  });

  it('normaliza telefone brasileiro', () => {
    expect(phoneE164('(81) 99999-8888')).toBe('+5581999998888');
    expect(phoneE164('+55 81 99999-8888')).toBe('+5581999998888');
    expect(phoneE164('081 3333-4444')).toBe('+558133334444');
    expect(phoneE164('9999')).toBeNull();
  });

  it('valida e-mail e CPF', () => {
    expect(validEmail('ana@gmail.com')).toBe(true);
    expect(validEmail('ana@gmail')).toBe(false);
    expect(validCPF('529.982.247-25')).toBe(true);
    expect(validCPF('111.111.111-11')).toBe(false);
    expect(validCPF('529.982.247-24')).toBe(false);
  });

  it('acha a URL do checkout em qualquer formato de resposta', () => {
    expect(findUrl({ url: 'https://checkout.infinitepay.io/x' })).toBe('https://checkout.infinitepay.io/x');
    expect(findUrl({ data: { link: 'https://pay.io/y' } })).toBe('https://pay.io/y');
    expect(findUrl({ success: false, message: 'erro' })).toBeNull();
  });

  it('monta o pedido para a InfinitePay', () => {
    const p = linkPayload({ handle: '$garimpo ', title: 'Treino e dieta · Trimestral' },
      { id: 'abc', name: 'Ana', email: 'a@a.com', phone: '81999998888', price: 597 }, 'https://x/retorno');
    expect(p.handle).toBe('garimpo');
    expect(p.items[0]).toEqual({ description: 'Treino e dieta · Trimestral', price: 59700, quantity: 1 });
    expect(p.order_nsu).toBe('abc');
    expect(p.customer.phone_number).toBe('+5581999998888');
  });

  it('lê a volta da InfinitePay', () => {
    expect(readReturn('?t=1&o=2&slug=s1&transaction_nsu=tx&capture_method=pix')).toEqual({ slug: 's1', transaction_nsu: 'tx', capture_method: 'pix' });
    expect(readReturn('?t=1&o=2')).toBeNull();
  });

  it('marca abandono depois de 30 minutos', () => {
    const now = 10_000_000;
    expect(isAbandoned({ status: 'aguardando', createdAt: now - 31 * 60000 }, now)).toBe(true);
    expect(isAbandoned({ status: 'aguardando', createdAt: now - 5 * 60000 }, now)).toBe(false);
    expect(isAbandoned({ status: 'pago', createdAt: 0 }, now)).toBe(false);
  });

  const order: Order = {
    id: 'o1', checkoutId: 'c1', title: 'T', planId: 'p1', planName: 'Treino e dieta · Trimestral', period: 'trimestral', price: 597,
    name: 'Ana', email: 'a@a.com', phone: '81999998888', acceptedTerms: true, termsText: 'x', acceptedAt: 1, status: 'pago',
    check: { paid: true, installments: 3, method: 'credit_card', paidAmount: 62000, at: 1 }, createdAt: 1,
  };

  it('venda nova a partir do pedido pago', () => {
    const s = saleFromOrder(order, { channelId: 'instagram' }, { id: 'cl', name: 'Ana', hasHistory: false }, '2026-11-27', 'u');
    expect(s.kind).toBe('nova');
    expect(s.startDate).toBe('2026-11-27');
    expect(s.endDate).toBe('2027-02-26');
    expect(s.paymentMethod).toBe('cartao');
    expect(s.installments).toBe(3);
    expect(s.channelId).toBe('instagram');
    expect(s.gross).toBe(597);
  });

  it('renovação começa no dia seguinte ao vencimento atual', () => {
    const s = saleFromOrder(order, undefined, { id: 'cl', name: 'Ana', hasHistory: true, endDate: '2026-12-10', planName: 'Antigo' }, '2026-11-27', 'u');
    expect(s.kind).toBe('renovacao');
    expect(s.startDate).toBe('2026-12-11');
    expect(s.prevPlanName).toBe('Antigo');
    const late = saleFromOrder(order, undefined, { id: 'cl', name: 'Ana', hasHistory: true, endDate: '2026-10-01' }, '2026-11-27', 'u');
    expect(late.startDate).toBe('2026-11-27');
  });

  it('cupom: código limpo e desconto em centavos', () => {
    expect(couponCode(' geo 10! ')).toBe('GEO10');
    expect(couponCode('Bárbara10')).toBe('BARBARA10');
    expect(discounted(2497, 10)).toBe(2247.3);
    expect(discounted(850, 10)).toBe(765);
    expect(discounted(1600, 15)).toBe(1360);
    expect(discounted(849.9, 10)).toBe(764.91);
  });

  it('pedido com cupom cobra o valor com desconto e credita a influencer', () => {
    const p = linkPayload({ handle: 'g', title: 'Garimpo Anual' }, { id: 'x', name: 'A', email: 'a@a.com', phone: '', price: 2247.3, couponCode: 'GEO10' }, 'https://x');
    expect(p.items[0]).toEqual({ description: 'Garimpo Anual (cupom GEO10)', price: 224730, quantity: 1 });
    const s = saleFromOrder({ ...order, price: 537.3, listPrice: 597, couponCode: 'GEO10', discountPct: 10 }, { channelId: 'organico', influencerId: 'outra' },
      { id: 'cl', name: 'Ana', hasHistory: false }, '2026-11-27', 'u', 'inf1');
    expect(s.gross).toBe(537.3);
    expect(s.influencerId).toBe('inf1');
    expect(s.channelId).toBe('influencer');
    expect(s.notes).toContain('cupom GEO10');
  });
});
