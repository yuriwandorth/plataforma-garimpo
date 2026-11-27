'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { auth, db, firebaseConfigured } from './firebase';
import type { Invite, Tenant, UserDoc } from './types';
import { DEFAULT_CHANNELS } from './defaults';

interface Session {
  loading: boolean;
  user: User | null;
  profile: UserDoc | null;
  tenant: Tenant | null;
  invite: Invite | null;
  logout: () => Promise<void>;
}

const Ctx = createContext<Session>({
  loading: true, user: null, profile: null, tenant: null, invite: null, logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) { setLoading(false); return; }
    let unsubProfile = () => {};
    let unsubTenant = () => {};
    const unsub = onAuthStateChanged(auth, async (u) => {
      unsubProfile(); unsubTenant();
      setUser(u); setProfile(null); setTenant(null); setInvite(null);
      if (!u) { setLoading(false); return; }
      setLoading(true);
      unsubProfile = onSnapshot(doc(db, 'users', u.uid), async (snap) => {
        if (snap.exists()) {
          const p = snap.data() as UserDoc;
          setProfile(p);
          unsubTenant();
          unsubTenant = onSnapshot(doc(db, 'tenants', p.tenantId), (t) => {
            setTenant(t.exists() ? ({ id: t.id, ...t.data() } as Tenant) : null);
            setLoading(false);
          }, () => setLoading(false));
        } else {
          setProfile(null);
          // Sem empresa: verifica se há convite para o e-mail
          if (u.email) {
            try {
              const inv = await getDoc(doc(db, 'invites', u.email.toLowerCase()));
              setInvite(inv.exists() ? ({ id: inv.id, ...inv.data() } as Invite) : null);
            } catch { setInvite(null); }
          }
          setLoading(false);
        }
      }, () => setLoading(false));
    });
    return () => { unsub(); unsubProfile(); unsubTenant(); };
  }, []);

  return (
    <Ctx.Provider value={{ loading, user, profile, tenant, invite, logout: () => signOut(auth) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);

/** Cria a consultoria (tenant) do usuário logado, já com os canais padrão */
export async function createTenant(user: User, name: string, ownerName: string) {
  const tenantRef = doc(db, 'tenants', crypto.randomUUID());
  const tid = tenantRef.id;
  const batch = writeBatch(db);
  batch.set(tenantRef, {
    name, ownerUid: user.uid, createdAt: Date.now(),
    milestones: [50000, 100000, 500000, 1000000],
    milestonesStart: new Date().toISOString().slice(0, 10),
  });
  batch.set(doc(db, 'tenants', tid, 'members', user.uid), {
    name: ownerName, email: user.email ?? '', role: 'owner', cargo: 'Dono(a)', isSeller: true, active: true,
    joinedAt: new Date().toISOString().slice(0, 10),
  });
  batch.set(doc(db, 'users', user.uid), { tenantId: tid, role: 'owner', name: ownerName, email: user.email ?? '' });
  DEFAULT_CHANNELS.forEach((c, i) => {
    batch.set(doc(db, 'tenants', tid, 'channels', c.id), { name: c.name, order: i, active: true });
  });
  await batch.commit();
}

/** Aceita o convite: entra na consultoria como membro do time */
export async function acceptInvite(user: User, inv: Invite) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'tenants', inv.tenantId, 'members', user.uid), {
    name: inv.name, email: user.email ?? '', role: inv.role, cargo: inv.cargo ?? '', isSeller: !!inv.isSeller,
    active: true, joinedAt: new Date().toISOString().slice(0, 10), inviteId: inv.id,
  });
  batch.set(doc(db, 'users', user.uid), { tenantId: inv.tenantId, role: inv.role, name: inv.name, email: user.email ?? '' });
  await batch.commit();
}
