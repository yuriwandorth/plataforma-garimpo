'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvite, createTenant, useSession } from '@/lib/auth';
import { Button, Field, Spinner } from '@/components/ui';

export default function Onboarding() {
  const { loading, user, profile, invite, logout } = useSession();
  const router = useRouter();
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login/');
    else if (profile) router.replace('/painel/');
  }, [loading, user, profile, router]);

  if (loading || !user || profile) return <Spinner />;

  async function go(fn: () => Promise<void>) {
    setBusy(true); setErr('');
    try { await fn(); router.replace('/painel/'); } catch (e) {
      setErr('Não foi possível concluir. Confira se as regras do Firestore foram publicadas (README, passo 4).');
      console.error(e);
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md p-6">
        {invite ? (
          <>
            <h1 className="text-xl font-semibold">Você foi convidado(a)</h1>
            <p className="mt-1 text-sm text-mute">
              Para entrar no time de <b className="text-ink">{invite.tenantName}</b> como {invite.cargo || 'membro do time'}.
            </p>
            <Button className="mt-6 w-full" disabled={busy} onClick={() => go(() => acceptInvite(user, invite))}>Aceitar convite</Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Vamos abrir a sua consultoria</h1>
            <p className="mt-1 text-sm text-mute">Leva 10 segundos. Os canais de venda padrão já vêm prontos e você ajusta depois.</p>
            <form className="mt-6 space-y-3" onSubmit={(e) => { e.preventDefault(); go(() => createTenant(user, company.trim(), name.trim())); }}>
              <Field label="Nome da consultoria"><input className="input" required value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ex.: O Garimpo" /></Field>
              <Field label="Seu nome"><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Yuri Wandorth" /></Field>
              <Button className="w-full" disabled={busy}>Criar consultoria</Button>
            </form>
          </>
        )}
        {err && <p className="mt-3 text-sm text-bad">{err}</p>}
        <button className="mt-4 text-xs text-mute hover:text-ink" onClick={logout}>Sair ({user.email})</button>
      </div>
    </main>
  );
}
