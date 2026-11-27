'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth';
import { firebaseConfigured } from '@/lib/firebase';
import { cx, Spinner } from '@/components/ui';
import { SetupNeeded } from '@/components/SetupNeeded';

const NAV: { group: string; items: { href: string; label: string; owner?: boolean }[] }[] = [
  { group: 'Visão', items: [{ href: '/painel/', label: 'Painel' }, { href: '/desempenho/', label: 'Desempenho' }] },
  { group: 'Clientes', items: [{ href: '/clientes/', label: 'Central de clientes' }, { href: '/renovacoes/', label: 'Renovações' }] },
  { group: 'Comercial', items: [
    { href: '/vendas/', label: 'Vendas' },
    { href: '/metas/', label: 'Metas por canal' },
    { href: '/produtos/', label: 'Produtos e planos' },
    { href: '/ofertas/', label: 'Ofertas' },
  ] },
  { group: 'Gestão', items: [
    { href: '/time/', label: 'Time', owner: true },
    { href: '/configuracoes/', label: 'Configurações', owner: true },
  ] },
];
const SOON = ['Influencers', 'Embaixadoras', 'OKR e atividades', 'Base de conhecimento', 'Atendimento às alunas'];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, profile, tenant, logout } = useSession();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);

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
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('tema', next ? 'escuro' : 'claro'); } catch {}
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-5 p-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">Garimpo</div>
        <div className="mt-0.5 truncate text-sm font-semibold">{tenant?.name ?? '…'}</div>
      </div>
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.owner || isOwner);
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-mute">{g.group}</div>
            {items.map((i) => (
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
      <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-3 lg:hidden">
        <span className="text-sm font-semibold">{tenant?.name}</span>
        <button className="rounded-lg border border-line px-3 py-1 text-sm" onClick={() => setOpen(true)}>Menu</button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-64 overflow-y-auto bg-panel" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
