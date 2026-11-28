'use client';
// Publica os links rastreados (go/{slug}) a partir das origens da consultoria.
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Influencer, TrackedOrigin } from './growth';
import type { Tenant } from './types';
import { defaultMessage, originSlug, type GoLink } from './tracking';

export function goFor(t: Pick<Tenant, 'id' | 'whatsapp'>, o: TrackedOrigin, inf?: Pick<Influencer, 'name'>): { slug: string; data: GoLink } {
  const slug = originSlug(o);
  return {
    slug,
    data: {
      tenantId: t.id, originId: o.id, name: o.name, whatsapp: (t.whatsapp ?? '').replace(/\D/g, ''),
      message: o.message?.trim() || defaultMessage(o, slug, inf?.name), active: !o.paused && !!t.whatsapp, updatedAt: Date.now(),
    },
  };
}

/** Grava/atualiza os links; devolve os que falharam (ex.: endereço já usado por outra consultoria) */
export async function syncGoLinks(t: Pick<Tenant, 'id' | 'whatsapp'>, origins: TrackedOrigin[], infById: Record<string, Pick<Influencer, 'name'>>, removed: TrackedOrigin[] = []) {
  const failed: string[] = [];
  for (const o of origins) {
    const { slug, data } = goFor(t, o, o.influencerId ? infById[o.influencerId] : undefined);
    try { await setDoc(doc(db, 'go', slug), data); } catch (e) { console.error(e); failed.push(`${o.name} (${slug})`); }
  }
  for (const o of removed) {
    const { slug, data } = goFor(t, o);
    try { await setDoc(doc(db, 'go', slug), { ...data, active: false }); } catch { /* não existia */ }
  }
  return failed;
}
