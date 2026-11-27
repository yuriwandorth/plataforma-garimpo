'use client';
import { useState } from 'react';
import { useCollection, useWriter } from '@/lib/db';
import { daysBetween, fmtDate, todayISO } from '@/lib/calc';
import type { Activity, ActivityOrigin, Okr } from '@/lib/manage';
import { Badge, Button, cx, Empty, Field, Modal, PageHeader, Spinner, Tabs } from '@/components/ui';

const ORIGIN: Record<ActivityOrigin, string> = { manual: 'Manual', okr: 'OKR', reuniao: 'Reunião' };

export default function AtividadesPage() {
  const acts = useCollection<Activity>('activities');
  const okrs = useCollection<Okr>('okrs');
  const w = useWriter();
  const [tab, setTab] = useState<'pendentes' | 'concluidas' | 'todas'>('pendentes');
  const [form, setForm] = useState<Activity | 'new' | null>(null);
  const today = todayISO();
  const all = [...acts.data].sort((a, b) => (a.done === b.done ? (a.due ?? '9999') < (b.due ?? '9999') ? -1 : 1 : a.done ? 1 : -1));
  const list = all.filter((a) => (tab === 'pendentes' ? !a.done : tab === 'concluidas' ? a.done : true));
  const pend = all.filter((a) => !a.done).length;

  return (
    <div>
      <PageHeader title="Atividades" subtitle="Tarefas do negócio: as suas, as que saem das reuniões e as que movem o OKR."
        actions={<Button onClick={() => setForm('new')}>Nova atividade</Button>} />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'pendentes', label: `Pendentes (${pend})` }, { id: 'concluidas', label: `Concluídas (${all.length - pend})` }, { id: 'todas', label: `Todas (${all.length})` },
      ]} />
      {acts.loading ? <Spinner /> : list.length === 0 ? <Empty title="Nada por aqui" action={<Button onClick={() => setForm('new')}>Nova atividade</Button>} /> : (
        <ul className="space-y-2">
          {list.map((a) => {
            const late = !a.done && a.due && daysBetween(today, a.due) < 0;
            return (
              <li key={a.id} className="card flex items-start gap-3 p-3">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--gold))]" checked={a.done} aria-label="Marcar como concluída"
                  onChange={(e) => w.update<Activity>('activities', a.id, { done: e.target.checked, doneAt: e.target.checked ? today : undefined }, `${e.target.checked ? 'Concluída' : 'Reaberta'}: ${a.title}`)} />
                <div className="min-w-0 flex-1">
                  <button className={cx('text-left text-sm font-medium hover:underline', a.done && 'text-mute line-through')} onClick={() => setForm(a)}>{a.title}</button>
                  {a.notes && <p className="text-xs text-mute">{a.notes}</p>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge>{ORIGIN[a.origin]}</Badge>
                    {a.due && <Badge tone={late ? 'bad' : 'mute'}>{late ? `atrasada · ${fmtDate(a.due)}` : `até ${fmtDate(a.due)}`}</Badge>}
                    {a.done && a.doneAt && <Badge tone="good">feita em {fmtDate(a.doneAt)}</Badge>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {form && <ActivityModal act={form === 'new' ? undefined : form} okrs={okrs.data} onClose={() => setForm(null)} />}
    </div>
  );
}

function ActivityModal({ act, okrs, onClose }: { act?: Activity; okrs: Okr[]; onClose: () => void }) {
  const w = useWriter();
  const [f, setF] = useState({ title: act?.title ?? '', notes: act?.notes ?? '', due: act?.due ?? '', origin: act?.origin ?? 'manual' as ActivityOrigin, okrId: act?.okrId ?? '' });
  async function save() {
    if (!f.title.trim()) return;
    const data = { title: f.title.trim(), notes: f.notes.trim() || undefined, due: f.due || undefined, origin: f.origin, okrId: f.okrId || undefined };
    if (act) await w.update<Activity>('activities', act.id, data, `Atividade editada: ${data.title}`);
    else await w.create('activities', { ...data, done: false }, `Atividade criada: ${data.title}`);
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={act ? 'Editar atividade' : 'Nova atividade'}
      footer={<>{act && <Button variant="danger" className="mr-auto" onClick={async () => { if (confirm('Apagar esta atividade?')) { await w.hardDelete('activities', act.id, `Atividade apagada: ${act.title}`); onClose(); } }}>Apagar</Button>}
        <Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="space-y-3">
        <Field label="O que fazer"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex.: Marcar call com as alunas que têm potencial de renovar" /></Field>
        <Field label="Detalhes (opcional)"><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prazo (opcional)"><input className="input" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
          <Field label="Origem">
            <select className="input" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value as ActivityOrigin })}>
              {(Object.keys(ORIGIN) as ActivityOrigin[]).map((o) => <option key={o} value={o}>{ORIGIN[o]}</option>)}
            </select>
          </Field>
        </div>
        {f.origin === 'okr' && (
          <Field label="OKR">
            <select className="input" value={f.okrId} onChange={(e) => setF({ ...f, okrId: e.target.value })}>
              <option value="">—</option>{okrs.map((o) => <option key={o.id} value={o.id}>{o.objective.slice(0, 80)}</option>)}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
