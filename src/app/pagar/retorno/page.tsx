'use client';
// Volta da InfinitePay: registra os dados do pagamento no pedido e mostra o próximo passo.
// A confirmação que vale é a da equipe (Checkout e pedidos), que confere de novo na InfinitePay.
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseConfigured } from '@/lib/firebase';
import { checkPayment, readReturn, type CheckoutLink } from '@/lib/checkout';
import { Shell } from '@/components/CheckoutShell';

export default function RetornoPage() {
  const [state, setState] = useState<'loading' | 'pago' | 'pendente' | 'semdados'>('loading');
  const [link, setLink] = useState<CheckoutLink | null>(null);
  const [receipt, setReceipt] = useState('');

  useEffect(() => {
    (async () => {
      const p = new URLSearchParams(window.location.search);
      const t = p.get('t') ?? '';
      const c = p.get('c') ?? '';
      const o = p.get('o') ?? '';
      const ret = readReturn(window.location.search);
      if (!t || !c || !o || !firebaseConfigured) return setState('semdados');
      let l: CheckoutLink | null = null;
      try {
        const s = await getDoc(doc(db, 'tenants', t, 'checkouts', c));
        if (s.exists()) { l = { id: s.id, ...s.data() } as CheckoutLink; setLink(l); }
      } catch { /* link desativado depois da compra: segue sem ele */ }
      if (!ret) return setState('semdados');
      if (ret.receipt_url) setReceipt(ret.receipt_url);
      // registra a volta (só funciona uma vez; recarregar a página não muda nada)
      await updateDoc(doc(db, 'tenants', t, 'orders', o), { ret: { ...ret, at: Date.now() }, status: 'retornou', updatedAt: Date.now() }).catch(() => {});
      if (!l) return setState('pendente');
      try {
        const r = await checkPayment(l.handle, o, ret);
        setState(r.paid ? 'pago' : 'pendente');
      } catch { setState('pendente'); }
    })();
  }, []);

  const wa = link?.whatsapp ? `https://wa.me/${link.whatsapp.length <= 11 ? '55' + link.whatsapp : link.whatsapp}?text=${encodeURIComponent(`Oi! Acabei de fazer o pagamento do ${link.title}. Qual o próximo passo?`)}` : null;

  if (state === 'loading') return <Shell><p className="text-center text-sm text-mute">Confirmando seu pagamento…</p></Shell>;
  return (
    <Shell brand={link?.brand}>
      {state === 'pago' ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Pagamento confirmado! 🎉</h1>
          <p className="mt-2 text-sm text-mute">Seja bem-vinda. Agora a gente te chama para a anamnese e para começar do jeito certo. Se quiser adiantar, manda um oi no WhatsApp.</p>
        </>
      ) : state === 'pendente' ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Recebemos seu pedido</h1>
          <p className="mt-2 text-sm text-mute">Se o pagamento ainda estiver sendo processado, ele aparece para a gente em instantes. Qualquer dúvida, fale com a gente no WhatsApp.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Não encontramos os dados do pagamento</h1>
          <p className="mt-2 text-sm text-mute">Se você pagou, fique tranquila: a confirmação chega para a gente pela InfinitePay. Mande o comprovante no WhatsApp para agilizar.</p>
        </>
      )}
      <div className="mt-5 grid gap-2">
        {wa && <a href={wa} className="flex h-10 items-center justify-center rounded-lg bg-gold px-4 text-sm font-medium text-white hover:brightness-110 dark:text-black">Falar no WhatsApp</a>}
        {receipt && <a href={receipt} target="_blank" rel="noreferrer" className="text-center text-sm text-gold hover:underline">Ver comprovante</a>}
      </div>
    </Shell>
  );
}
