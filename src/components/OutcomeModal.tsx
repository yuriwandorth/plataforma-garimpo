'use client';
// Registrar o destino de quem venceu o plano: em negociação, pausa ou não renovou (com motivo e recall).
import { useEffect, useState } from 'react';
import { useWriter } from '@/lib/db';
import { addDays, fmtDate, todayISO } from '@/lib/calc';
import { CHURN_REASONS, currentOutcome, suggestedRecall, type ChurnReason, type OutcomeStatus, type RClient } from '@/lib/retention';
import type { Client } from '@/lib/types';
import { Button, cx, ErrorNote, Field, Modal } from './ui';

const OPTIONS: { id: OutcomeStatus; title: string; text: string }[] = [
  { id: 'negociando', title: 'Em negociação', text: 'Ainda conversando. Fica na lista do mês com a data do próximo contato.' },
  { id: 'pausa', title: 'Pausa', text: 'Vai parar por um tempo e tem previsão de volta. Sai das ativas e entra no recall perto da volta.' },
  { id: 'nao_renovou', title: 'Não renovou', text: 'Saiu. Sai das ativas, guarda o motivo e entra no recall na data certa.' },
];

export function OutcomeModal({ client, onClose }: { client: RClient; onClose: () => void }) {
  const w = useWriter();
  const today = todayISO();
  const cur = currentOutcome(client);
  const [status, setStatus] = useState<OutcomeStatus>(cur?.status ?? 'negociando');
  const [reason, setReason] = useState<ChurnReason | ''>(cur?.reason ?? '');
  const [note, setNote] = useState(cur?.note ?? '');
  const [followUpAt, setFollowUpAt] = useState(cur?.followUpAt ?? addDays(today, 3));
  const [returnAt, setReturnAt] = useState(cur?.returnAt ?? addDays(today, 60));
  const [recallAt, setRecallAt] = useState(client.recall?.nextAt ?? '');
  const [noRecall, setNoRecall] = useState(!!client.recall?.optOut);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // sugere a data do recall pelo motivo / volta da pausa (até a pessoa mexer)
  const [touched, setTouched] = useState(!!client.recall?.nextAt);
  useEffect(() => {
    if (touched || status === 'negociando') return;
    setRecallAt(suggestedRecall({ status, reason: reason || undefined, returnAt }, today));
  }, [status, reason, returnAt, touched, today]);

  async function save() {
    setErr('');
    if (status !== 'negociando' && !reason) return setErr('Escolha o motivo. É ele que mostra onde a consultoria está perdendo alunas.');
    if (status === 'negociando' && !followUpAt) return setErr('Informe a data do próximo contato.');
    if (status === 'pausa' && !returnAt) return setErr('Informe a previsão de volta.');
    setBusy(true);
    try {
      const outcome = {
        cycleEnd: client.endDate!, status, decidedAt: today,
        ...(reason ? { reason } : {}), ...(note.trim() ? { note: note.trim() } : {}),
        ...(status === 'negociando' ? { followUpAt } : {}), ...(status === 'pausa' ? { returnAt } : {}),
      };
      const data: Partial<Client> = { outcome, renewalContactAt: today };
      if (status !== 'negociando') {
        data.status = 'inativo';
        data.recall = { attempts: client.recall?.attempts ?? 0, ...(client.recall?.lastAt ? { lastAt: client.recall.lastAt } : {}),
          ...(noRecall ? { optOut: true } : recallAt ? { nextAt: recallAt } : {}) };
      } else if (client.status !== 'ativo') data.status = 'ativo';
      const label = OPTIONS.find((o) => o.id === status)!.title;
      await w.update<Client>('clients', client.id, data, `Destino do vencimento de ${fmtDate(client.endDate)}: ${label}${reason ? ` · ${CHURN_REASONS[reason].label}` : ''}`);
      onClose();
    } catch (e) {
      console.error(e);
      setErr('Não foi possível salvar.');
    } finally { setBusy(false); }
  }

  async function undo() {
    setBusy(true);
    await w.update<Client>('clients', client.id, { outcome: undefined, recall: undefined, status: 'ativo' }, `Destino desfeito: ${client.name}`);
    setBusy(false); onClose();
  }

  return (
    <Modal open onClose={onClose} wide title={`Destino de ${client.name}`}
      subtitle={`Plano ${client.planName ?? ''} ${client.endDate && client.endDate < today ? 'venceu' : 'vence'} em ${fmtDate(client.endDate)}.`}
      footer={<>{cur && <Button variant="ghost" className="mr-auto" onClick={undo} disabled={busy}>Desfazer destino</Button>}<Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar destino'}</Button></>}>
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <button key={o.id} type="button" onClick={() => setStatus(o.id)}
            className={cx('rounded-lg border p-3 text-left', status === o.id ? 'border-gold bg-gold/10' : 'border-line hover:border-gold/50')}>
            <div className="text-sm font-semibold">{o.title}</div>
            <div className="mt-1 text-xs text-mute">{o.text}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-mute">Se ela renovar, use "Renovou": a venda entra e a aluna volta para as ativas sozinha.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={status === 'negociando' ? 'Motivo da dúvida (opcional)' : 'Motivo'}>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value as ChurnReason | '')}>
            <option value="">Escolha…</option>
            {(Object.keys(CHURN_REASONS) as ChurnReason[]).map((k) => <option key={k} value={k}>{CHURN_REASONS[k].label}</option>)}
          </select>
        </Field>
        {status === 'negociando' && <Field label="Próximo contato"><input type="date" className="input" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} /></Field>}
        {status === 'pausa' && <Field label="Previsão de volta"><input type="date" className="input" value={returnAt} onChange={(e) => setReturnAt(e.target.value)} /></Field>}
        {status !== 'negociando' && (
          <Field label="Chamar de novo em (recall)" hint={noRecall ? 'Ela pediu para não ser contatada.' : 'Sugerido pelo motivo. Ajuste se quiser.'}>
            <input type="date" className="input" disabled={noRecall} value={recallAt} onChange={(e) => { setRecallAt(e.target.value); setTouched(true); }} />
          </Field>
        )}
        {status !== 'negociando' && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--gold))]" checked={noRecall} onChange={(e) => setNoRecall(e.target.checked)} />
            Não chamar mais (pediu para não ser contatada)
          </label>
        )}
        <Field label="Observação" className="sm:col-span-2"><textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que ela disse, condição oferecida, combinado…" /></Field>
      </div>
      <ErrorNote error={err} />
    </Modal>
  );
}
