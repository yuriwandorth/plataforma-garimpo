'use client';
// Acesso ao Firestore. Tudo fica em tenants/{tenantId}/{coleção}.
import { useEffect, useState } from 'react';
import {
  addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, query, setDoc, updateDoc, where,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from './firebase';
import { useSession } from './auth';
import type { AuditEntry } from './types';
import { deepClean } from './calc';
export { deepClean };

export type Col =
  | 'clients' | 'products' | 'plans' | 'sales' | 'channels' | 'goals' | 'members' | 'audit' | 'offers'
  | 'influencers' | 'commissionModels' | 'influencerMonths' | 'ambassadors'
  | 'okrs' | 'activities' | 'journal' | 'campaigns' | 'knowledge' | 'assessments';

export const colRef = (tenantId: string, c: Col) => collection(db, 'tenants', tenantId, c);
export const docRef = (tenantId: string, c: Col, id: string) => doc(db, 'tenants', tenantId, c, id);

export function clean<T extends object>(o: T): T {
  return deepClean(o);
}

/** Assina uma coleção em tempo real. `constraints` filtram no servidor. */
export function useCollection<T>(c: Col, constraints: QueryConstraint[] = [], key = ''): { data: T[]; loading: boolean; error?: string } {
  const { profile } = useSession();
  const [state, setState] = useState<{ data: T[]; loading: boolean; error?: string }>({ data: [], loading: true });
  const tid = profile?.tenantId;
  useEffect(() => {
    if (!tid) return;
    setState((s) => ({ ...s, loading: true }));
    const q = query(colRef(tid, c), ...constraints);
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), loading: false }),
      (err) => setState({ data: [], loading: false, error: err.message }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid, c, key]);
  return state;
}

/** Vendas a partir de uma data (YYYY-MM-DD) */
export function useSalesSince(since: string) {
  return useCollection<import('./types').Sale>('sales', [where('date', '>=', since)], since);
}

/** Funções de escrita com registro de auditoria */
export function useWriter() {
  const { profile, user } = useSession();
  const tid = profile?.tenantId ?? '';
  const by = user?.uid ?? '';
  const byName = profile?.name ?? '';

  async function log(entity: string, entityId: string, action: AuditEntry['action'], summary: string) {
    try {
      await addDoc(colRef(tid, 'audit'), { entity, entityId, action, by, byName, at: Date.now(), summary });
    } catch { /* auditoria nunca bloqueia a operação */ }
  }

  return {
    tid,
    async create<T extends object>(c: Col, data: T, summary: string, id?: string) {
      const payload = clean({ ...data, createdAt: Date.now(), updatedAt: Date.now() });
      let newId = id;
      if (id) await setDoc(docRef(tid, c, id), payload);
      else newId = (await addDoc(colRef(tid, c), payload)).id;
      await log(c, newId!, 'create', summary);
      return newId!;
    },
    async update<T extends object>(c: Col, id: string, data: Partial<T>, summary: string) {
      // campo apagado no formulário (undefined) = remove o campo no banco
      const payload = Object.fromEntries(
        Object.entries({ ...data, updatedAt: Date.now() }).map(([k, v]) => [k, v === undefined ? deleteField() : deepClean(v)]),
      );
      await updateDoc(docRef(tid, c, id), payload as never);
      await log(c, id, 'update', summary);
    },
    async set<T extends object>(c: Col, id: string, data: T) {
      await setDoc(docRef(tid, c, id), clean(data), { merge: true });
    },
    async softDelete(c: Col, id: string, summary: string) {
      await updateDoc(docRef(tid, c, id), { deleted: true, deletedAt: Date.now() });
      await log(c, id, 'delete', summary);
    },
    async restore(c: Col, id: string, summary: string) {
      await updateDoc(docRef(tid, c, id), { deleted: false, deletedAt: null });
      await log(c, id, 'restore', summary);
    },
    async hardDelete(c: Col, id: string, summary: string) {
      await deleteDoc(docRef(tid, c, id));
      await log(c, id, 'delete', summary);
    },
  };
}
