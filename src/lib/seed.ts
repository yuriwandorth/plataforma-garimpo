'use client';
// Dados de exemplo (fictícios) para testar a plataforma. Tudo marcado com seed: true para apagar depois.
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { addDays, addMonths, planEndDate, todayISO } from './calc';
import type { Period } from './types';

const FIRST = ['Ana', 'Beatriz', 'Camila', 'Débora', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Júlia', 'Larissa', 'Mariana', 'Natália', 'Paula', 'Rafaela', 'Sabrina', 'Tatiane', 'Vanessa', 'Yasmin', 'Lucas'];
const LAST = ['Silva', 'Souza', 'Oliveira', 'Lima', 'Costa', 'Pereira', 'Almeida', 'Barbosa', 'Rocha', 'Cavalcanti'];
const CHANNELS = ['social-selling', 'winning-back', 'organico', 'influencer', 'indicacao'];

function rnd(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export async function loadSeed(tenantId: string, uid: string) {
  const r = rnd(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const today = todayISO();
  const ops: { path: string[]; data: Record<string, unknown> }[] = [];
  const id = () => crypto.randomUUID();

  const products = [
    { id: id(), name: 'Treino', includes: { treino: true, dieta: false, cardio: true, medico: false } },
    { id: id(), name: 'Treino e dieta', includes: { treino: true, dieta: true, cardio: true, medico: false } },
    { id: id(), name: 'Treino, dieta e médico', includes: { treino: true, dieta: true, cardio: true, medico: true } },
  ];
  products.forEach((p) => ops.push({ path: ['products', p.id], data: {
    name: p.name, description: 'Exemplo', active: true, forSale: true, grantsApp: true, modality: 'online', includes: p.includes, createdAt: Date.now(), seed: true,
  } }));

  const price: Record<string, Record<Period, number>> = {
    Treino: { mensal: 197, trimestral: 650, semestral: 1200, anual: 2197 },
    'Treino e dieta': { mensal: 400, trimestral: 850, semestral: 1600, anual: 2497 },
    'Treino, dieta e médico': { mensal: 497, trimestral: 1100, semestral: 1900, anual: 2997 },
  };
  const plans: { id: string; name: string; period: Period; price: number; productId: string }[] = [];
  products.forEach((p) => (['mensal', 'trimestral', 'semestral', 'anual'] as Period[]).forEach((per) => {
    if (p.name === 'Treino, dieta e médico' && per !== 'anual') return;
    const pl = { id: id(), name: `${p.name} ${per[0].toUpperCase()}${per.slice(1)}`, period: per, price: price[p.name][per], productId: p.id };
    plans.push(pl);
    ops.push({ path: ['plans', pl.id], data: {
      productId: p.id, name: pl.name, period: per, price: pl.price, paymentMethods: ['pix', 'cartao'], maxInstallments: 12, couple: false, active: true, createdAt: Date.now(), seed: true,
    } });
  }));

  // 60 clientes com vendas espalhadas nos últimos 12 meses, algumas renovações e indicações
  const created: string[] = [];
  for (let i = 0; i < 60; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)} (exemplo)`;
    const cid = id();
    const channel = pick(CHANNELS);
    const referredById = channel === 'indicacao' && created.length > 3 ? created[Math.floor(r() * Math.min(created.length, 8))] : undefined;
    created.push(cid);
    let start = addDays(addMonths(today, -12), Math.floor(r() * 360));
    let last: { plan: typeof plans[0]; start: string; end: string } | null = null;
    let first = true;
    while (start <= today) {
      const plan = r() < 0.5 ? pick(plans.filter((p) => p.period === 'trimestral' || p.period === 'semestral')) : pick(plans);
      const end = planEndDate(start, plan.period);
      const card = r() < 0.5;
      ops.push({ path: ['sales', id()], data: {
        clientId: cid, clientName: name, planId: plan.id, planName: plan.name, productId: plan.productId, period: plan.period,
        gross: plan.price, fees: card ? Math.round(plan.price * 0.04) : 0, date: start, startDate: start, endDate: end,
        channelId: first ? channel : 'renovacao', isRenewal: !first, kind: first ? 'nova' : 'renovacao', status: 'aprovada',
        referredById: first ? referredById : undefined, paymentMethod: card ? 'cartao' : 'pix',
        installments: card ? 12 : 1, isTest: false, createdAt: Date.now(), createdBy: uid, seed: true,
      } });
      last = { plan, start, end };
      first = false;
      if (r() < 0.45) break; // não renovou
      start = addDays(end, Math.floor(r() * 10) + 1);
    }
    const isActive = last && last.end >= today;
    ops.push({ path: ['clients', cid], data: {
      name, email: `exemplo${i}@exemplo.com`, phone: `81 9${String(80000000 + i)}`, status: isActive ? 'ativo' : 'inativo',
      channelId: channel, referredById, period: last?.plan.period, planId: last?.plan.id, planName: last?.plan.name, startDate: last?.start, endDate: last?.end,
      lastValue: last?.plan.price, isTest: false, createdAt: Date.now(), updatedAt: Date.now(), seed: true,
    } });
  }

  // grava em lotes de 400
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach((o) => {
      const clean = Object.fromEntries(Object.entries(o.data).filter(([, v]) => v !== undefined));
      b.set(doc(db, 'tenants', tenantId, o.path[0], o.path[1]), clean);
    });
    await b.commit();
  }
  return ops.length;
}

export async function clearSeed(tenantId: string) {
  let n = 0;
  for (const c of ['sales', 'clients', 'plans', 'products']) {
    const snap = await getDocs(query(collection(db, 'tenants', tenantId, c), where('seed', '==', true)));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
      n += Math.min(400, snap.docs.length - i);
    }
  }
  return n;
}
