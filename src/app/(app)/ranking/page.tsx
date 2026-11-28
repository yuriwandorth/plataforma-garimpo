'use client';
import { useState } from 'react';
import { useCollection, useWriter } from '@/lib/db';
import { fmtDate, todayISO } from '@/lib/calc';
import { areaAverage, AREAS, overallAverage, rankLevel, SCORE_LABEL, type Assessment } from '@/lib/growth';
import { HowTo } from '@/components/HowTo';
import { Badge, Button, Card, cx, Empty, Field, Modal, PageHeader, Progress, Spinner } from '@/components/ui';

const LEVEL_TONE = { Bronze: 'warn', Prata: 'mute', Ouro: 'gold', Diamante: 'good' } as const;

export default function RankingPage() {
  const list = useCollection<Assessment>('assessments');
  const [form, setForm] = useState<Assessment | 'new' | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const sorted = [...list.data].sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = sorted[0];
  const prev = sorted[1];

  return (
    <div>
      <PageHeader title="Ranking do negócio" subtitle="Maturidade da consultoria em 5 áreas, de 1 (inexistente) a 4 (otimizado). Refaça a cada 15 dias e acompanhe a evolução."
        actions={<Button onClick={() => setForm('new')}>Nova avaliação</Button>} />
      <HowTo id="ranking" title="Como usar o Ranking do negócio">
        <p><b>Para que serve:</b> é um raio-x da maturidade da consultoria em 5 áreas (Marketing, Vendas, Entrega, Gestão e Pessoas e processos). Ele mostra onde o negócio está fraco antes que isso vire queda de vendas ou de renovação, e diz onde colocar energia agora.</p>
        <p><b>Como fazer (5 minutos):</b></p>
        <ul>
          <li>Clique em "Nova avaliação" e dê uma nota de 1 a 4 para cada pilar: <b>1</b> não existe, <b>2</b> existe mas improvisado, <b>3</b> funciona com rotina, <b>4</b> funciona, é medido e melhora sozinho.</li>
          <li>Seja honesto: nota alta sem processo escrito ou sem número acompanhado ainda é 2.</li>
          <li>A média das áreas define o nível: Bronze (abaixo de 2), Prata (2), Ouro (3) e Diamante (3,5 ou mais).</li>
        </ul>
        <p><b>Quando fazer:</b> a cada 15 dias, de preferência no mesmo dia da semana. Faça também logo depois de uma mudança grande (time novo, lançamento, troca de sistema).</p>
        <p><b>O que fazer com o resultado:</b> pegue os 2 ou 3 pilares com nota mais baixa da área mais fraca e transforme em resultado-chave no OKR ou em tarefa em Atividades. Na avaliação seguinte, veja se a nota subiu.</p>
      </HowTo>
      {list.loading ? <Spinner /> : !last ? (
        <Empty title="Nenhuma avaliação ainda" text="Leva uns 5 minutos: dê uma nota de 1 a 4 para cada pilar das 5 áreas." action={<Button onClick={() => setForm('new')}>Fazer a primeira avaliação</Button>} />
      ) : (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-mute">Ranking atual · {fmtDate(last.date)}</div>
                <div className="mt-1 flex items-center gap-3"><span className="text-3xl font-semibold">{overallAverage(last).toFixed(2).replace('.', ',')}</span><Badge tone={LEVEL_TONE[rankLevel(overallAverage(last))]}>{rankLevel(overallAverage(last))}</Badge></div>
                {prev && <div className="text-xs text-mute">avaliação anterior: {overallAverage(prev).toFixed(2).replace('.', ',')} em {fmtDate(prev.date)}</div>}
              </div>
              <p className="max-w-sm text-xs text-mute">Níveis pela média das áreas: Bronze abaixo de 2 · Prata de 2 a 2,99 · Ouro de 3 a 3,49 · Diamante 3,5 ou mais.</p>
            </div>
          </Card>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {AREAS.map((a) => {
              const avg = areaAverage(last.scores[a.id]);
              const before = prev ? areaAverage(prev.scores[a.id]) : null;
              return (
                <button key={a.id} onClick={() => setArea(area === a.id ? null : a.id)} className={cx('card p-4 text-left', area === a.id && 'border-gold')}>
                  <div className="text-sm font-semibold">{a.name}</div>
                  <div className="text-xs text-mute">{a.pillars.length} pilares</div>
                  <div className="mt-2 text-2xl font-semibold">{avg.toFixed(1).replace('.', ',')}</div>
                  {before !== null && <div className={cx('text-xs', avg > before ? 'text-good' : avg < before ? 'text-bad' : 'text-mute')}>{avg > before ? '▲' : avg < before ? '▼' : '='} {before.toFixed(1).replace('.', ',')} antes</div>}
                  <div className="mt-2"><Progress value={avg / 4} /></div>
                </button>
              );
            })}
          </div>
          {area && (
            <Card className="mb-6" title={`Pilares de ${AREAS.find((a) => a.id === area)!.name}`}>
              <ul className="space-y-2">
                {AREAS.find((a) => a.id === area)!.pillars.map((p, i) => {
                  const v = last.scores[area]?.[i] ?? 0;
                  return <li key={p} className="flex items-center justify-between gap-3 text-sm"><span>{p}</span><Badge tone={v >= 3 ? 'good' : v === 2 ? 'gold' : 'bad'}>{v} · {SCORE_LABEL[v] || '—'}</Badge></li>;
                })}
              </ul>
            </Card>
          )}
          <Card title="Histórico">
            <ul className="divide-y divide-line">
              {sorted.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{fmtDate(a.date)}{a.notes && <span className="block text-xs text-mute">{a.notes}</span>}</span>
                  <span className="flex items-center gap-2"><b>{overallAverage(a).toFixed(2).replace('.', ',')}</b><Badge tone={LEVEL_TONE[rankLevel(overallAverage(a))]}>{rankLevel(overallAverage(a))}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => setForm(a)}>Ver/editar</Button></span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
      {form && <AssessmentModal a={form === 'new' ? undefined : form} base={form === 'new' ? last : undefined} onClose={() => setForm(null)} />}
    </div>
  );
}

function AssessmentModal({ a, base, onClose }: { a?: Assessment; base?: Assessment; onClose: () => void }) {
  const w = useWriter();
  const [date, setDate] = useState(a?.date ?? todayISO());
  const [notes, setNotes] = useState(a?.notes ?? '');
  const [scores, setScores] = useState<Record<string, number[]>>(() => {
    const src = a?.scores ?? base?.scores ?? {};
    return Object.fromEntries(AREAS.map((ar) => [ar.id, ar.pillars.map((_, i) => src[ar.id]?.[i] ?? 0)]));
  });
  const missing = AREAS.reduce((n, ar) => n + scores[ar.id].filter((v) => !v).length, 0);
  async function save() {
    const data = { date, notes: notes.trim() || undefined, scores };
    if (a) await w.update<Assessment>('assessments', a.id, data, 'Avaliação do ranking editada');
    else await w.create('assessments', data, 'Avaliação do ranking criada');
    onClose();
  }
  return (
    <Modal open onClose={onClose} wide title={a ? 'Avaliação do ranking' : 'Nova avaliação'} subtitle="1 inexistente · 2 básico · 3 estruturado · 4 otimizado. As notas da última avaliação vêm preenchidas para você ajustar."
      footer={<><span className="mr-auto self-center text-xs text-mute">{missing ? `${missing} pilar(es) sem nota` : 'Tudo preenchido'}</span>
        {a && <Button variant="danger" onClick={async () => { if (confirm('Apagar esta avaliação?')) { await w.hardDelete('assessments', a.id, 'Avaliação apagada'); onClose(); } }}>Apagar</Button>}
        <Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="mb-4 grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Observação (opcional)"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="space-y-5">
        {AREAS.map((ar) => (
          <div key={ar.id}>
            <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{ar.name}</h3><span className="text-sm text-mute">média {areaAverage(scores[ar.id]).toFixed(1).replace('.', ',')}</span></div>
            <ul className="space-y-1.5">
              {ar.pillars.map((p, i) => (
                <li key={p} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{p}</span>
                  <span className="flex gap-1">
                    {[1, 2, 3, 4].map((v) => (
                      <button key={v} title={SCORE_LABEL[v]} onClick={() => setScores({ ...scores, [ar.id]: scores[ar.id].map((x, j) => (j === i ? v : x)) })}
                        className={cx('h-8 w-8 rounded-lg border text-sm', scores[ar.id][i] === v ? 'border-gold bg-gold/20 font-semibold' : 'border-line text-mute hover:text-ink')}>{v}</button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
