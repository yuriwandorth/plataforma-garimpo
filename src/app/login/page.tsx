'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup,
} from 'firebase/auth';
import { auth, firebaseConfigured } from '@/lib/firebase';
import { useSession } from '@/lib/auth';
import { Button, Field } from '@/components/ui';
import { SetupNeeded } from '@/components/SetupNeeded';

const ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Use "Entrar".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos.',
  'auth/popup-closed-by-user': 'Login com Google cancelado.',
};

export default function LoginPage() {
  const { user, loading } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ t: 'ok' | 'erro'; s: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) router.replace('/'); }, [loading, user, router]);
  if (!firebaseConfigured) return <SetupNeeded />;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      setMsg({ t: 'erro', s: ERRORS[code] ?? 'Não deu certo. Tente de novo.' });
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Garimpo</div>
          <h1 className="mt-1 text-xl font-semibold">{mode === 'entrar' ? 'Entrar na plataforma' : 'Criar sua conta'}</h1>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => mode === 'entrar'
              ? signInWithEmailAndPassword(auth, email.trim(), password)
              : createUserWithEmailAndPassword(auth, email.trim(), password));
          }}
        >
          <Field label="E-mail"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          <Field label="Senha"><input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'} /></Field>
          {msg && <p className={msg.t === 'erro' ? 'text-sm text-bad' : 'text-sm text-good'}>{msg.s}</p>}
          <Button className="w-full" disabled={busy}>{mode === 'entrar' ? 'Entrar' : 'Criar conta'}</Button>
        </form>
        <Button variant="outline" className="mt-2 w-full" disabled={busy} onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>
          Entrar com Google
        </Button>
        <div className="mt-4 flex justify-between text-xs">
          <button className="text-mute hover:text-ink" onClick={() => setMode(mode === 'entrar' ? 'criar' : 'entrar')}>
            {mode === 'entrar' ? 'Não tenho conta' : 'Já tenho conta'}
          </button>
          {mode === 'entrar' && (
            <button
              className="text-mute hover:text-ink"
              onClick={() => {
                if (!email) { setMsg({ t: 'erro', s: 'Digite o e-mail acima primeiro.' }); return; }
                run(async () => { await sendPasswordResetEmail(auth, email.trim()); setMsg({ t: 'ok', s: 'Enviamos um link para redefinir a senha.' }); });
              }}
            >
              Esqueci a senha
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
