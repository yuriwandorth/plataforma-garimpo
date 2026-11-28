'use client';
// Link rastreado público: conta o clique e abre o WhatsApp com a mensagem pronta da origem.
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, firebaseConfigured } from '@/lib/firebase';
import { todayISO } from '@/lib/calc';
import { waUrl, type GoLink } from '@/lib/tracking';

export default function RedirectPage() {
  const [state, setState] = useState<'loading' | 'off' | 'erro'>('loading');
  const [dest, setDest] = useState('');

  useEffect(() => {
    const slug = (new URLSearchParams(window.location.search).get('l') ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug || !firebaseConfigured) { setState('off'); return; }
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'go', slug));
        const g = snap.data() as GoLink | undefined;
        if (!g || !g.active || !g.whatsapp) { setState('off'); return; }
        const url = waUrl(g.whatsapp, g.message);
        setDest(url);
        // conta uma vez por aparelho a cada 30 min (recarregar a página não infla o número)
        const key = `clk-${slug}`;
        let last = 0;
        try { last = Number(localStorage.getItem(key) || 0); } catch { /* sem storage */ }
        if (Date.now() - last > 30 * 60 * 1000) {
          const save = setDoc(doc(collection(db, 'tenants', g.tenantId, 'clicks')), { slug, originId: g.originId, day: todayISO(), at: Date.now() })
            .then(() => { try { localStorage.setItem(key, String(Date.now())); } catch { /* */ } })
            .catch((e) => console.error(e));
          await Promise.race([save, new Promise((r) => setTimeout(r, 1500))]);
        }
        window.location.replace(url);
      } catch (e) {
        console.error(e);
        setState('erro');
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6 text-center text-ink">
      {state === 'loading' ? (
        <div>
          <p className="text-lg font-semibold">Abrindo o WhatsApp…</p>
          {dest && <a className="mt-3 inline-block text-sm text-gold underline" href={dest}>Se não abrir, toque aqui</a>}
        </div>
      ) : (
        <div>
          <p className="text-lg font-semibold">Link indisponível</p>
          <p className="mt-1 text-sm text-mute">{state === 'erro' ? 'Tente de novo em instantes.' : 'Este link foi desativado ou não existe.'}</p>
        </div>
      )}
    </main>
  );
}
