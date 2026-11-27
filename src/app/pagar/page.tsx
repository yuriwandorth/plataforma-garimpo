'use client';
// Página pública do checkout: a aluna abre sem login, preenche, aceita os termos e vai para a InfinitePay.
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseConfigured } from '@/lib/firebase';
import { createPaymentLink, onlyDigits, phoneE164, validCPF, validEmail, type CheckoutLink, type Order } from '@/lib/checkout';
import { fmtBRL2 } from '@/lib/calc';
import { PERIOD_LABEL, PERIOD_MONTHS } from '@/lib/types';
import { Button, Field } from '@/components/ui';
import { Shell } from '@/components/CheckoutShell';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function PagarPage() {
  const [ids, setIds] = useState<{ t: string; c: string; ref: string } | null>(null);
  const [link, setLink] = useState<CheckoutLink | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'off' | 'erro'>('loading');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('t') ?? '';
    const c = p.get('c') ?? '';
    setIds({ t, c, ref: (p.get('ref') ?? '').slice(0, 60) });
    if (!t || !c || !firebaseConfigured) { setState('off'); return; }
    getDoc(doc(db, 'tenants', t, 'checkouts', c))
      .then((s) => {
        const d = s.exists() ? ({ id: s.id, ...s.data() } as CheckoutLink) : null;
        if (!d || !d.active) setState('off');
        else { setLink(d); setState('ok'); document.title = `${d.title} · ${d.brand}`; }
      })
      .catch(() => setState('off'));
  }, []);

  async function pay() {
    setErr('');
    if (!link || !ids) return;
    if (name.trim().split(/\s+/).length < 2) return setErr('Escreva seu nome completo.');
    if (!validEmail(email)) return setErr('Confira seu e-mail.');
    if (!phoneE164(phone)) return setErr('Confira seu WhatsApp com DDD.');
    if (cpf && !validCPF(cpf)) return setErr('Confira seu CPF (ou deixe em branco).');
    if (!agree) return setErr('Para seguir, marque que leu e concorda com os termos.');
    setBusy(true);
    try {
      const ref = doc(collection(db, 'tenants', ids.t, 'orders'));
      const now = Date.now();
      const order: Omit<Order, 'id'> = {
        checkoutId: link.id, title: link.title, planId: link.planId, planName: link.planName, period: link.period, price: link.price,
        name: name.trim(), email: email.trim().toLowerCase(), phone: onlyDigits(phone), acceptedTerms: true, termsText: link.terms,
        acceptedAt: now, userAgent: navigator.userAgent.slice(0, 200), status: 'aguardando', createdAt: now,
        ...(link.productId ? { productId: link.productId } : {}),
        ...(cpf ? { cpf: onlyDigits(cpf) } : {}),
        ...(ids.ref ? { ref: ids.ref } : {}),
      };
      await setDoc(ref, order);
      const back = `${window.location.origin}${BASE}/pagar/retorno/?t=${encodeURIComponent(ids.t)}&c=${encodeURIComponent(link.id)}&o=${ref.id}`;
      const url = await createPaymentLink(link, { id: ref.id, name: order.name, email: order.email, phone: order.phone }, back);
      await updateDoc(ref, { linkUrl: url, updatedAt: Date.now() }).catch(() => {});
      window.location.href = url;
    } catch (e) {
      console.error(e);
      setErr('Não conseguimos abrir o pagamento agora. Tente de novo em instantes ou fale com a gente no WhatsApp.');
      setBusy(false);
    }
  }

  if (state === 'loading') return <Shell><p className="text-center text-sm text-mute">Carregando…</p></Shell>;
  if (state !== 'ok' || !link) return (
    <Shell>
      <h1 className="text-xl font-semibold">Link indisponível</h1>
      <p className="mt-2 text-sm text-mute">Este link de pagamento não está ativo. Fale com quem te enviou para receber um link atualizado.</p>
    </Shell>
  );

  const months = PERIOD_MONTHS[link.period];
  return (
    <Shell brand={link.brand}>
      <h1 className="text-2xl font-semibold tracking-tight">{link.title}</h1>
      {link.description && <p className="mt-2 whitespace-pre-line text-sm text-mute">{link.description}</p>}
      <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-4">
        <div className="text-xs uppercase tracking-wide text-mute">{PERIOD_LABEL[link.period]} · {months} {months === 1 ? 'mês' : 'meses'}</div>
        <div className="mt-1 text-3xl font-semibold">{fmtBRL2(link.price)}</div>
        <div className="mt-1 text-xs text-mute">Pix ou cartão em até 12x. As condições aparecem na próxima tela.</div>
      </div>

      <div className="mt-6 grid gap-3">
        <Field label="Nome completo"><input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="E-mail"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="WhatsApp com DDD"><input className="input" type="tel" autoComplete="tel" placeholder="(81) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="CPF (opcional)" hint="Para a nota fiscal."><input className="input" inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} /></Field>
      </div>

      <div className="mt-5">
        <div className="label">Termos do acompanhamento</div>
        <div className="max-h-48 overflow-y-auto whitespace-pre-line rounded-lg border border-line bg-bg p-3 text-xs leading-relaxed text-mute">{link.terms}</div>
        <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--gold))]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>Li e concordo com os termos e autorizo o uso dos meus dados para o acompanhamento.</span>
        </label>
      </div>

      {err && <div className="mt-4 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">{err}</div>}
      <Button className="mt-5 w-full" onClick={pay} disabled={busy}>{busy ? 'Abrindo o pagamento…' : 'Ir para o pagamento'}</Button>
      <p className="mt-3 text-center text-xs text-mute">Pagamento processado com segurança pela InfinitePay.</p>
    </Shell>
  );
}
