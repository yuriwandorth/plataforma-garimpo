'use client';
import { useEffect, useState } from 'react';
import { useCollection, useWriter } from '@/lib/db';
import { addMonths, fmtBRL, fmtDate, fmtPct, parseMoney, todayISO } from '@/lib/calc';
import { KR_LABEL, okrProgress, type KeyResult, type KRStatus, type Okr } from '@/lib/manage';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Progress, Spinner } from '@/components/ui';

export default function OkrPage() {
  const okrs = useCollection<Okr>('okrs');
  const w = useWriter();
  const [form, setForm] = useState<Okr | 'new' | null>(null);
  const list = [...okrs.data].sort((a, b) => b.createdAt - a.createdAt);
  const current = list.find((o) => o.status === 'ativo');
  const history = list.filter((o) => o !== current);

  async function setKr(o: Okr, i: number, patch: Partial<KeyResult>) {
    const krs = o.krs.map((k, j) => (j === i ? { ...k, ...patch } : k));
    await w.update<Okr>('okrs', o.id, { krs }, `KR atualizado: ${krs[i].text.slice(0, 40)}`);
  }

  return (
    <div>
      <PageHeader title="OKR" subtitle="O objetivo do ciclo e os resultados-chave que provam que ele foi atingido."
        actions={<Button onClick={() => setForm('new')}>Novo OKR</Button>} />
      {okrs.loading ? <Spinner /> : !current ? (
        <Empty title="Nenhum OKR ativo" text="Defina um objetivo para os próximos 90 dias e 3 a 5 resultados-chave mensuráveis." action={<Button onClick={() => setForm('new')}>Criar OKR</Button>} />
      ) : (
        <Card className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-wide text-gold">OKR atual · {fmtDate(current.start)} → {fmtDate(current.end)}</div>
              <h2 className="mt-1 text-xl font-semibold">{current.objective}</h2>
              {current.revenueGoal ? <p className="text-sm text-mute">Meta de faturamento do ciclo: {fmtBRL(current.revenueGoal)}</p> : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setForm(current)}>Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => w.update<Okr>('okrs', current.id, { status: 'encerrado' }, 'OKR encerrado')}>Encerrar</Button>
            </div>
          </div>
          <div className="my-4"><Progress value={okrProgress(current)} /><div className="mt-1 text-xs text-mute">{fmtPct(okrProgress(current))} concluído</div></div>
          <ul className="space-y-3">
            {current.krs.map((k, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 text-sm"><b className="mr-2 text-mute">KR{i + 1}</b>{k.text}</div>
                  <select className="input w-40 py-1 text-xs" value={k.status} onChange={(e) => setKr(current, i, { status: e.target.value as KRStatus, progress: e.target.value === 'concluido' ? 100 : k.progress })}>
                    {(Object.keys(KR_LABEL) as KRStatus[]).map((s) => <option key={s} value={s}>{KR_LABEL[s]}</option>)}
                  </select>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <input type="range" min={0} max={100} step={5} className="flex-1 accent-[rgb(var(--gold))]" defaultValue={k.status === 'concluido' ? 100 : k.progress}
                    key={`${current.id}${i}${k.progress}${k.status}`}
                    onMouseUp={(e) => setKr(current, i, { progress: Number((e.target as HTMLInputElement).value), status: Number((e.target as HTMLInputElement).value) >= 100 ? 'concluido' : Number((e.target as HTMLInputElement).value) > 0 ? 'em-andamento' : k.status })}
                    onTouchEnd={(e) => setKr(current, i, { progress: Number((e.target as HTMLInputElement).value) })} />
                  <span className="w-10 text-right text-xs">{k.status === 'concluido' ? 100 : k.progress}%</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {history.length > 0 && (
        <Card title="Histórico de OKRs">
          <ul className="divide-y divide-line">
            {history.map((o) => (
              <li key={o.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-mute">{fmtDate(o.start)} → {fmtDate(o.end)}</span>
                  <span className="flex items-center gap-2"><Badge>{fmtPct(okrProgress(o))}</Badge>
                    {!current && <Button size="sm" variant="ghost" onClick={() => w.update<Okr>('okrs', o.id, { status: 'ativo' }, 'OKR reaberto')}>Reabrir</Button>}</span>
                </div>
                <div className="font-medium">{o.objective}</div>
                <ul className="mt-1 text-sm text-mute">{o.krs.map((k, i) => <li key={i}>{k.status === 'concluido' ? '✓' : '•'} {k.text}</li>)}</ul>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {form && <OkrModal okr={form === 'new' ? undefined : form} onClose={() => setForm(null)} activeId={current?.id} />}
    </div>
  );
}

function OkrModal({ okr, onClose, activeId }: { okr?: Okr; onClose: () => void; activeId?: string }) {
  const w = useWriter();
  const t = todayISO();
  const [objective, setObjective] = useState(okr?.objective ?? '');
  const [start, setStart] = useState(okr?.start ?? t);
  const [end, setEnd] = useState(okr?.end ?? addMonths(t, 3));
  const [goal, setGoal] = useState(okr?.revenueGoal ? String(okr.revenueGoal) : '');
  const [krs, setKrs] = useState<KeyResult[]>(okr?.krs ?? [{ text: '', status: 'nao-iniciado', progress: 0 }, { text: '', status: 'nao-iniciado', progress: 0 }, { text: '', status: 'nao-iniciado', progress: 0 }]);
  const [err, setErr] = useState('');
  useEffect(() => setErr(''), [objective]);
  async function save() {
    const clean = krs.filter((k) => k.text.trim()).map((k) => ({ ...k, text: k.text.trim() }));
    if (!objective.trim()) return setErr('Escreva o objetivo.');
    if (!clean.length) return setErr('Inclua ao menos um resultado-chave.');
    const data = { objective: objective.trim(), start, end, krs: clean, revenueGoal: parseMoney(goal) || undefined };
    if (okr) await w.update<Okr>('okrs', okr.id, data, 'OKR editado');
    else {
      if (activeId) {
        if (!confirm('Já existe um OKR ativo. Criar este novo vai encerrar o atual. Continuar?')) return;
        await w.update<Okr>('okrs', activeId, { status: 'encerrado' }, 'OKR encerrado ao abrir um novo');
      }
      await w.create('okrs', { ...data, status: 'ativo' }, `OKR criado: ${data.objective.slice(0, 40)}`);
    }
    onClose();
  }
  return (
    <Modal open onClose={onClose} wide title={okr ? 'Editar OKR' : 'Novo OKR'} subtitle="Objetivo qualitativo + resultados-chave que dá para medir."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="space-y-3">
        <Field label="Objetivo"><textarea className="input" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder='Ex.: "Arrumar a casa": números claros, oferta reestruturada e comercial organizado' /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Início"><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Fim"><input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <Field label="Meta de faturamento (opcional)"><input className="input" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} /></Field>
        </div>
        <span className="label">Resultados-chave</span>
        {krs.map((k, i) => (
          <div key={i} className="flex gap-2">
            <span className="pt-2 text-xs font-semibold text-mute">KR{i + 1}</span>
            <input className="input" value={k.text} onChange={(e) => setKrs(krs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder="Ex.: Todas as alunas e planos cadastrados na Central de clientes" />
            <button className="text-mute hover:text-bad" aria-label="Remover" onClick={() => setKrs(krs.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setKrs([...krs, { text: '', status: 'nao-iniciado', progress: 0 }])}>Adicionar KR</Button>
        {err && <p className="text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  );
}
