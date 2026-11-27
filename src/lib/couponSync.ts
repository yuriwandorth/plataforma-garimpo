'use client';
// Mantém o cupom de checkout em dia com o cupom de divulgação da influencer.
import type { useWriter } from './db';
import type { Influencer } from './growth';
import { couponCode, DEFAULT_COUPON_PCT } from './checkout';

type Writer = ReturnType<typeof useWriter>;

/** Cria/atualiza o cupom da influencer. Cupom ativo só com parceria fechada e influencer ativa. */
export async function syncInfluencerCoupon(w: Writer, inf: Pick<Influencer, 'id' | 'name' | 'coupon' | 'couponPct' | 'stage' | 'active'>, oldCoupon?: string) {
  const code = couponCode(inf.coupon ?? '');
  const old = couponCode(oldCoupon ?? '');
  if (old && old !== code) {
    try { await w.update('coupons', old, { active: false }, `Cupom ${old} desativado (trocado na influencer ${inf.name})`); } catch { /* não existia */ }
  }
  if (!code) return;
  const pct = Math.round(Number(inf.couponPct) || DEFAULT_COUPON_PCT);
  await w.set('coupons', code, {
    code, pct: Math.min(90, Math.max(1, pct)), active: inf.stage === 'fechado' && inf.active !== false,
    influencerId: inf.id, influencerName: inf.name, updatedAt: Date.now(),
  });
}
