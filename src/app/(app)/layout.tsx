'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth';
import { firebaseConfigured } from '@/lib/firebase';
import { cx, Spinner } from '@/components/ui';
import { SetupNeeded } from '@/components/SetupNeeded';
import { canSee, NAV } from '@/lib/nav';
import { useMembers } from '@/lib/hooks';

const SOON = ['Atendimento às alunas', 'Área da aluna'];

/** #RRGGBB → "r g b" (formato das variáveis de cor) e uma versão mais clara para o tema escuro */
function hexToVars(hex: string): { light: string; dark: string } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lighter = rgb.map((c) => Math.round(c + (255 - c) * 0.25));
  return { light: rgb.join(' '), dark: lighter.join(' ') };
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, profile, tenant, logout } = useSession();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  const members = useMembers();

  useEffect(() => { try { setClosed(JSON.parse(localStorage.getItem('menu-fechado') ?? '[]')); } catch {} }, []);
  function toggleGroup(g: string) {
    setClosed((c) => {
      const next = c.includes(g) ? c.filter((x) => x !== g) : [...c, g];
      try { localStorage.setItem('menu-fechado', JSON.stringify(next)); } catch {}
      return next;
    });
  }
  // cor da marca escolhida em Configurações
  useEffect(() => {
    const root = document.documentElement;
    const v = tenant?.brandColor ? hexToVars(tenant.brandColor) : null;
    if (!v) { root.style.removeProperty('--gold'); return; }
    root.style.setProperty('--gold', dark ? v.dark : v.light);
  }, [tenant?.brandColor, dark]);

  useEffect(() => { setDark(document.documentElement.classList.contains('dark')); }, []);
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login/');
    else if (!profile) router.replace('/onboarding/');
  }, [loading, user, profile, router]);
  useEffect(() => setOpen(false), [path]);

  if (!firebaseConfigured) return <SetupNeeded />;
  if (loading || !user || !profile) return <Spinner />;

  const isOwner = profile.role === 'owner';
  const allowed = members.byId[user.uid]?.allowedPages;
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('tema', next ? 'escuro' : 'claro'); } catch {}
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-5 p-4">
      <Link href="/painel/" className="block rounded-lg px-2 py-1 hover:bg-line/40" title="Ir para o Painel">
        <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">Garimpo</div>
        <div className="mt-0.5 truncate text-sm font-semibold">{tenant?.name ?? '…'}</div>
      </Link>
      {NAV.map((g) => {
        const items = g.items.filter((i) => canSee(i.href, isOwner, allowed));
        if (!items.length) return null;
        // a categoria da página aberta fica sempre aberta
        const isClosed = closed.includes(g.group) && !items.some((i) => i.href === path);
        return (
          <div key={g.group}>
            <button type="button" onClick={() => toggleGroup(g.group)} aria-expanded={!isClosed}
              className="mb-1 flex w-full items-center justify-between rounded px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-mute hover:text-ink">
              {g.group}
              <span className={cx('text-xs transition-transform', isClosed ? '-rotate-90' : '')}>▾</span>
            </button>
            {!isClosed && items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={cx(
                  'block rounded-lg px-2 py-1.5 text-sm',
                  path === i.href ? 'bg-gold/15 font-medium text-ink' : 'text-mute hover:bg-line/40 hover:text-ink',
                )}
              >
                {i.label}
              </Link>
            ))}
          </div>
        );
      })}
      <div>
        <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-mute">Próximas etapas</div>
        {SOON.map((s) => <div key={s} className="px-2 py-1 text-sm text-mute/60">{s}</div>)}
      </div>
      <div className="mt-auto space-y-1 border-t border-line pt-3 text-sm">
        <div className="truncate px-2 text-xs text-mute">{profile.name} · {isOwner ? 'dono(a)' : 'time'}</div>
        <button className="block w-full rounded-lg px-2 py-1.5 text-left text-mute hover:bg-line/40 hover:text-ink" onClick={toggleTheme}>
          Tema {dark ? 'claro' : 'escuro'}
        </button>
        <button className="block w-full rounded-lg px-2 py-1.5 text-left text-mute hover:bg-line/40 hover:text-ink" onClick={logout}>Sair</button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-panel lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">{sidebar}</aside>
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-panel px-4 py-3 lg:hidden">
        <button className="rounded-lg border border-line px-3 py-1 text-sm" onClick={() => setOpen(true)} aria-label="Abrir menu">☰ Menu</button>
        <Link href="/painel/" className="truncate text-sm font-semibold">{tenant?.name}</Link>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-64 overflow-y-auto bg-panel" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{members.loading && !isOwner ? <Spinner /> : canSee(path, isOwner, allowed) ? children : (
        <div className="mx-auto max-w-md py-16 text-center">
          <h1 className="text-lg font-semibold">Sem acesso a esta tela</h1>
          <p className="mt-2 text-sm text-mute">Peça ao responsável pela conta para liberar em Time → editar seu acesso.</p>
          <Link href="/painel/" className="mt-4 inline-block text-sm text-gold hover:underline">Ir para o Painel</Link>
        </div>
      )}</main>
    </div>
  );
}
