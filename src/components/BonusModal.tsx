'use client';
// Bônus de tempo: estende o vencimento sem lançar venda (não entra em faturamento, ticket nem taxa de renovação).
import { useState } from 'react';
import { useSession } from '@/lib/auth';
import { useWriter } from '@/lib/db';
import { fmtDate, todayISO } from '@/lib/calc';
import { activeBonus, BONUS_REASONS, bonusEnd, type RClient } from '@/lib/retention';
import type { Client } from '@/lib/types';
import { Button, cx, ErrorNote, Field, Modal } from './ui';

const MONTH_OPTIONS = [1, 2, 3, 4, 6];

export function BonusModal({ client, onClose }: { client: RClient; onClose: () => void }) {
  const w = useWriter();
  const { profile } = useSession();
  const today = todayISO();
  const base = client.endDate || today;
  const cur = activeBonus(client);
  const [months, setMonths] = useState(3);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const to = bonusEnd(base, months);

  async function save() {
    setErr('');
    if (!reason) return setErr('Escolha o motivo. Ele aparece quando o bônus acabar, na hora de chamar para renovar.');
    setBusy(true);
    try {
      const bonus = { months, from: base, to, reason, ...(note.trim() ? { note: note.trim() } : {}), at: today, ...(profile?.name ? { byName: profile.name } : {}) };
      const data: Partial<Client> = {
        endDate: to, status: 'ativo', bonuses: [...(client.bonuses ?? []), bonus],
        // o destino e o recall do vencimento antigo deixam de valer
        outcome: undefined, ...(client.status !== 'ativo' ? { recall: undefined } : {}),
      };
      await w.update<Client>('clients', client.id, data, `Bônus de ${months} ${months > 1 ? 'meses' : 'mês'} para ${client.name}: vencimento ${fmtDate(base)} → ${fmtDate(to)} · ${reason}`);
      onClose();
    } catch (e) {
      console.error(e);
      setErr('Não foi possível salvar.');
    } finally { setBusy(false); }
  }

  async function undo() {
    if (!cur) return;
    setBusy(true);
    try {
      await w.update<Client>('clients', client.id, { endDate: cur.from, bonuses: (client.bonuses ?? []).slice(0, -1) }, `Bônus desfeito: ${client.name} volta a vencer em ${fmtDate(cur.from)}`);
      onClose();
    } catch (e) {
      console.error(e);
      setErr('Não foi possível desfazer.');
    } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} wide title={`Bônus de tempo para ${client.name}`}
      subtitle="Estende o acompanhamento sem lançar venda: não entra no faturamento, no ticket médio nem na taxa de renovação."
      footer={<>{cur && <Button variant="ghost" className="mr-auto" onClick={undo} disabled={busy}>Desfazer último bônus</Button>}<Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Dar bônus'}</Button></>}>
      {cur && (
        <div className="mb-4 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">
          Ela já está em bônus de {cur.months} {cur.months > 1 ? 'meses' : 'mês'} (dado em {fmtDate(cur.at)}, {cur.reason}). Um novo bônus soma a partir de {fmtDate(base)}.
        </div>
      )}
      <Field label="Quanto tempo">
        <div className="flex flex-wrap gap-2">
          {MONTH_OPTIONS.map((m) => (
            <button key={m} type="button" onClick={() => setMonths(m)}
              className={cx('rounded-lg border px-4 py-2 text-sm', months === m ? 'border-gold bg-gold/10 font-semibold' : 'border-line hover:border-gold/50')}>
              {m} {m > 1 ? 'meses' : 'mês'}
            </button>
          ))}
        </div>
      </Field>
      <p className="mt-2 text-sm">Vencimento passa de <b>{fmtDate(base)}</b> para <b>{fmtDate(to)}</b>.{base < today && <span className="text-mute"> O bônus conta a partir do vencimento, não de hoje.</span>}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Motivo">
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Escolha…</option>
            {BONUS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Observação" hint="Aparece quando o bônus acabar, na hora de chamar para renovar.">
          <textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: começa no emprego novo em janeiro; resultado ótimo no glúteo" />
        </Field>
      </div>
      <ErrorNote error={err} />
    </Modal>
  );
}
