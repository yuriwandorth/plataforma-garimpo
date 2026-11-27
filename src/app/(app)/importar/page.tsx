'use client';
// Importação em massa: cola o pacote de dados (JSON), confere o que é novo e grava em lotes.
import { useMemo, useState } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSession } from '@/lib/auth';
import { useCollection, colRef, docRef, deepClean, type Col } from '@/lib/db';
import { useClients, useInfluencers, usePlans, useProducts } from '@/lib/hooks';
import { todayISO } from '@/lib/calc';
import { planImport, type ImportPayload, type ImportPlan } from '@/lib/importer';
import type { Sale } from '@/lib/types';
import { Button, Card, ErrorNote, PageHeader, Stat } from '@/components/ui';

type Op = [Col, string, Record<string, unknown>, boolean];

export default function ImportarPage() {
  const { profile, user } = useSession();
  const clients = useClients();
  const plans = usePlans();
  const products = useProducts();
  const influencers = useInfluencers();
  const sales = useCollection<Sale & { importKey?: string }>('sales');
  const [raw, setRaw] = useState('');
  const [productId, setProductId] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState('');
  const [done, setDone] = useState('');

  const prodId = productId || products.data.find((p) => !p.archived)?.id || '';
  const ready = !clients.loading && !plans.loading && !influencers.loading && !sales.loading && !products.loading;

  const payload = useMemo<ImportPayload | null>(() => {
    try { const p = JSON.parse(raw); return p && typeof p === 'object' ? p : null; } catch { return null; }
  }, [raw]);

  function check() {
    setErr(''); setDone(''); setProgress('');
    if (!payload) return setErr('O conteúdo colado não é um pacote de importação válido.');
    if (!prodId) return setErr('Cadastre um produto em Produtos e planos antes de importar.');
    const tid = profile!.tenantId;
    setPlan(planImport(payload, { clients: clients.data, plans: plans.data, influencers: influencers.data, sales: sales.data }, {
      productId: prodId, today: todayISO(), by: user!.uid, newId: () => doc(collection(db, 'tenants', tid, 'clients')).id,
    }));
  }

  async function run() {
    if (!plan) return;
    setErr(''); setProgress('Gravando…');
    const tid = profile!.tenantId;
    const now = Date.now();
    const ops: Op[] = [
      ...plan.influencers.map(({ id, ...d }): Op => ['influencers', id, { ...d, createdAt: now, updatedAt: now }, false]),
      ...plan.plans.map(({ id, ...d }): Op => ['plans', id, { ...d, createdAt: now }, false]),
      ...plan.clients.map(({ id, ...d }): Op => ['clients', id, { ...d, createdAt: now, updatedAt: now }, false]),
      ...plan.sales.map(({ id, ...d }): Op => ['sales', id, { ...d, createdAt: now }, false]),
      ...plan.clientUpdates.map(({ id, data }): Op => ['clients', id, { ...data, updatedAt: now }, true]),
    ];
    try {
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(db);
        for (const [c, id, d, merge] of ops.slice(i, i + 400)) {
          if (merge) b.set(docRef(tid, c, id), deepClean(d), { merge: true });
          else b.set(docRef(tid, c, id), deepClean(d));
        }
        await b.commit();
        setProgress(`Gravados ${Math.min(i + 400, ops.length)} de ${ops.length}…`);
      }
      const summary = `Importação ${payload?.source}: ${plan.clients.length} clientes, ${plan.sales.length} vendas, ${plan.influencers.length} influencers, ${plan.plans.length} planos antigos`;
      const b = writeBatch(db);
      b.set(doc(colRef(tid, 'audit')), { entity: 'import', entityId: payload?.source ?? 'import', action: 'create', by: user!.uid, byName: profile!.name, at: Date.now(), summary });
      await b.commit().catch(() => {});
      setProgress(''); setDone(summary); setPlan(null);
    } catch (e) {
      console.error(e);
      setErr('A gravação parou no meio. Pode rodar de novo: o que já entrou não é duplicado.');
      setProgress('');
    }
  }

  if (profile?.role !== 'owner') return <p className="text-sm text-mute">Só o(a) dono(a) importa dados.</p>;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Importar dados" subtitle="Traz clientes, histórico de vendas e influencers de outra plataforma, sem duplicar o que já existe." />
      <Card>
        <div className="grid gap-3">
          <label className="block"><span className="label">Produto para os planos antigos</span>
            <select className="input" value={prodId} onChange={(e) => setProductId(e.target.value)}>
              {products.data.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Pacote de importação</span>
            <textarea aria-label="Pacote de importação" className="input min-h-[160px] font-mono text-xs" value={raw} onChange={(e) => { setRaw(e.target.value); setPlan(null); setDone(''); }} />
          </label>
          <div className="flex gap-2"><Button onClick={check} disabled={!raw.trim() || !ready}>Conferir</Button>{plan && <Button onClick={run} disabled={!!progress}>Importar</Button>}</div>
          {progress && <p className="text-sm text-mute">{progress}</p>}
          {done && <p className="text-sm text-good">Concluído. {done}.</p>}
          <ErrorNote error={err} />
        </div>
      </Card>
      {plan && (
        <div className="mt-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Clientes novas" value={plan.clients.length} sub={`${plan.skipped.clients} já existiam`} />
            <Stat label="Vendas novas" value={plan.sales.length} sub={`${plan.skipped.sales} já existiam`} />
            <Stat label="Influencers novas" value={plan.influencers.length} sub={`${plan.skipped.influencers} já existiam`} />
            <Stat label="Planos antigos" value={plan.plans.length} sub="criados inativos, só para o histórico" />
          </div>
          {plan.plans.length > 0 && <p className="mt-3 text-xs text-mute">Planos: {plan.plans.map((p) => `${p.name} (${p.period})`).join(' · ')}</p>}
          {plan.warnings.length > 0 && <div className="mt-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs">{plan.warnings.slice(0, 20).map((w) => <div key={w}>{w}</div>)}</div>}
        </div>
      )}
    </div>
  );
}
