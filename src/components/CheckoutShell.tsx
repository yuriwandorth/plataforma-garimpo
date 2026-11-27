'use client';

/** Moldura das páginas públicas do checkout */
export function Shell({ children, brand }: { children: React.ReactNode; brand?: string }) {
  return (
    <main className="min-h-screen bg-bg px-4 py-8 text-ink">
      <div className="mx-auto max-w-md">
        {brand && <div className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">{brand}</div>}
        <div className="card p-5 sm:p-6">{children}</div>
      </div>
    </main>
  );
}
