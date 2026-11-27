'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { where } from 'firebase/firestore';
import { useCollection, useWriter } from '@/lib/db';
import { useChannels } from '@/lib/hooks';
import { countable, fmtBRL, fmtPct, parseMoney } from '@/lib/calc';
import { DEFAULT_TACTICS, TACTICS, type Campaign, type CampaignChannel } from '@/lib/growth';
import type { Sale } from '@/lib/types';
import { Badge, Button, Card, cx, Field, Progress, Spinner } from '@/components/ui';

export default function Page() { return <Suspense fallback={<Spinner />}><Editor /></Suspense>; }

function Editor() {
  const id = useSearchParams().get('id') ?? '';
  const camps = useCollection<Campaign>('campaigns');
  const channels = useChannels();
  const w = useWriter();
  const remote = camps.data.find((c) => c.id === id);
  const [c, setC] = useState<Campaign | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState('');
  useEffect(() => { if (remote && !c) setC(structuredClone(remote)); }, [remote, c]);
  const sales = useCollection<Sale>('sales', c ? [where('date', '>=', c.start), where('date', '<=', c.end)] : [where('date', '==', '__')], c ? `${c.start}${c.end}` : 'x');

  if (camps.loading) return <Spinner />;
  if (!remote) return <p className="text-sm text-mute">Campanha não encontrada. <Link className="underline" href="/campanhas/">Voltar</Link></p>;
  if (!c) return <Spinner />;

  const edit = (fn: (d: Campaign) => void) => { setC((p) => { const d = structuredClone(p!); fn(d); return d; }); setDirty(true); setSaved(''); };
  const editCh = (i: number, fn: (x: CampaignChannel) => void) => edit((d) => fn(d.channels[i]));
  async function save() {
    const { id: _i, createdAt: _c, ...rest } = c!; void _i; void _c;
    await w.update<Campaign>('campaigns', id, rest, `Campanha salva: ${c!.name}`);
    setDirty(false); setSaved('Salvo');
  }
  const realized = (chId: string) => {
    const s = sales.data.filter((x) => countable(x) && x.channelId === chId);
    return { revenue: s.reduce((a, x) => a + x.gross, 0), count: s.length };
  };
  const goal = c.channels.reduce((a, x) => a + x.goalRevenue, 0);
  const done = c.channels.reduce((a, x) => a + realized(x.channelId).revenue, 0);
  const triggered = c.channels.filter((x) => x.triggered).length;
  const missingChannels = channels.active.filter((ch) => !c.channels.some((x) => x.channelId === ch.id));

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <Link href="/campanhas/" className="text-xs text-mute hover:text-ink">← Campanhas</Link>
      <div className="mb-4 mt-1 flex flex-wrap items-start justify-between gap-3">
        <input className="min-w-0 flex-1 bg-transparent text-2xl font-semibold outline-none" value={c.name} onChange={(e) => edit((d) => { d.name = e.target.value; })} aria-label="Nome da campanha" />
        <div className="flex items-center gap-2"><span className="text-xs text-mute">{dirty ? 'Alterações não salvas' : saved}</span><Button disabled={!dirty} onClick={save}>Salvar</Button></div>
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Data / ocasião"><input className="input" value={c.occasion} onChange={(e) => edit((d) => { d.occasion = e.target.value; })} /></Field>
          <Field label="Início"><input className="input" type="date" value={c.start} onChange={(e) => edit((d) => { d.start = e.target.value; })} /></Field>
          <Field label="Fim"><input className="input" type="date" value={c.end} onChange={(e) => edit((d) => { d.end = e.target.value; })} /></Field>
          <Field label="Situação"><select className="input" value={c.status} onChange={(e) => edit((d) => { d.status = e.target.value as Campaign['status']; })}>
            <option value="rascunho">Rascunho</option><option value="ativa">Ativa</option><option value="encerrada">Encerrada</option></select></Field>
        </div>
        <Field label="Oferta" className="mt-3"><textarea className="input" rows={3} value={c.offer} onChange={(e) => edit((d) => { d.offer = e.target.value; })} placeholder="Ex.: anual com desconto forte; em dupla o preço por pessoa cai." /></Field>
        <div className="mt-3">
          <span className="label">Preços da campanha</span>
          {c.prices.map((p, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <input className="input" value={p.label} placeholder="Ex.: Individual" onChange={(e) => edit((d) => { d.prices[i].label = e.target.value; })} />
              <input className="input w-40" inputMode="decimal" defaultValue={p.value ? String(p.value) : ''} placeholder="2.097" onBlur={(e) => edit((d) => { d.prices[i].value = parseMoney(e.target.value); })} />
              <button className="text-mute hover:text-bad" aria-label="Remover preço" onClick={() => edit((d) => { d.prices.splice(i, 1); })}>×</button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => edit((d) => { d.prices.push({ label: '', value: 0 }); })}>Adicionar preço</Button>
        </div>
      </Card>

      <Card className="mb-4" title="Meta da campanha" action={<span className="text-xs text-mute">{triggered}/{c.channels.length} canais acionados</span>}>
        <div className="text-2xl font-semibold">{fmtBRL(done)} <span className="text-base font-normal text-mute">/ {fmtBRL(goal)} · {fmtPct(goal ? done / goal : 0)}</span></div>
        <div className="mt-2"><Progress value={goal ? done / goal : 0} tone={goal && done >= goal ? 'good' : 'gold'} /></div>
        <p className="mt-1 text-xs text-mute">Realizado = vendas aprovadas de cada canal entre o início e o fim da campanha.</p>
      </Card>

      <h2 className="mb-2 text-lg font-semibold">Plano de ação por canal</h2>
      <div className="space-y-3">
        {c.channels.map((ch, i) => {
          const r = realized(ch.channelId);
          return (
            <Card key={ch.channelId} className={cx(ch.triggered && 'border-good/50')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-gold">{i + 1}º</span>
                  <span className="text-sm font-semibold uppercase tracking-wide">{channels.byId[ch.channelId]?.name ?? ch.channelId}</span>
                  {ch.triggered && <Badge tone="good">acionado</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" disabled={i === 0} aria-label="Subir" onClick={() => edit((d) => { [d.channels[i - 1], d.channels[i]] = [d.channels[i], d.channels[i - 1]]; })}>↑</Button>
                  <Button size="sm" variant="ghost" disabled={i === c.channels.length - 1} aria-label="Descer" onClick={() => edit((d) => { [d.channels[i + 1], d.channels[i]] = [d.channels[i], d.channels[i + 1]]; })}>↓</Button>
                  <Button size="sm" variant={ch.triggered ? 'ghost' : 'outline'} onClick={() => editCh(i, (x) => { x.triggered = !x.triggered; })}>{ch.triggered ? 'Desmarcar' : 'Marcar como acionado'}</Button>
                  <Button size="sm" variant="ghost" aria-label="Tirar canal" onClick={() => edit((d) => { d.channels.splice(i, 1); })}>×</Button>
                </div>
              </div>
              <Field label="Por que nesta ordem" className="mt-2"><input className="input" value={ch.why} onChange={(e) => editCh(i, (x) => { x.why = e.target.value; })} placeholder="Ex.: canal mais quente, converte mais rápido" /></Field>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Meta de receita (R$)"><input className="input" inputMode="decimal" defaultValue={ch.goalRevenue || ''} key={`g${i}${ch.goalRevenue}`} onBlur={(e) => editCh(i, (x) => { x.goalRevenue = parseMoney(e.target.value); })} /></Field>
                <Field label="Meta de vendas"><input className="input" type="number" min={0} value={ch.goalSales || ''} onChange={(e) => editCh(i, (x) => { x.goalSales = Number(e.target.value) || 0; })} /></Field>
                <div className="text-sm"><span className="label">Realizado</span><b>{fmtBRL(r.revenue)}</b> <span className="text-mute">· {r.count} venda(s){ch.goalSales ? ` de ${ch.goalSales}` : ''}</span>
                  <div className="mt-1"><Progress value={ch.goalRevenue ? r.revenue / ch.goalRevenue : 0} tone={ch.goalRevenue && r.revenue >= ch.goalRevenue ? 'good' : 'gold'} /></div></div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">Como atacar ({ch.tactics.length} táticas)</summary>
                <div className="mt-2 space-y-2">
                  {ch.tactics.map((tt, k) => (
                    <div key={k} className="rounded-lg bg-line/30 p-2">
                      <div className="flex gap-2">
                        <input className="input" value={tt.title} onChange={(e) => editCh(i, (x) => { x.tactics[k].title = e.target.value; })} />
                        <span className="flex shrink-0 items-center gap-1 text-xs text-mute">Funcionou?
                          {([[true, '👍'], [false, '👎']] as const).map(([v, l]) => (
                            <button key={l} className={cx('rounded border px-1.5 py-0.5', tt.worked === v ? 'border-gold bg-gold/20' : 'border-line')} onClick={() => editCh(i, (x) => { x.tactics[k].worked = x.tactics[k].worked === v ? null : v; })}>{l}</button>
                          ))}
                          <button className="ml-1 hover:text-bad" aria-label="Remover tática" onClick={() => editCh(i, (x) => { x.tactics.splice(k, 1); })}>×</button>
                        </span>
                      </div>
                      <textarea className="input mt-1 text-sm" rows={2} value={tt.text} onChange={(e) => editCh(i, (x) => { x.tactics[k].text = e.target.value; })} />
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => editCh(i, (x) => { x.tactics.push({ title: 'Nova tática', text: '', worked: null }); })}>Adicionar tática</Button>
                </div>
              </details>
            </Card>
          );
        })}
      </div>
      {missingChannels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="text-mute">Incluir canal:</span>
          {missingChannels.map((ch) => <Button key={ch.id} size="sm" variant="outline" onClick={() => edit((d) => { d.channels.push({ channelId: ch.id, why: '', goalRevenue: 0, goalSales: 0, tactics: (TACTICS[ch.id] ?? DEFAULT_TACTICS).map((x) => ({ ...x, worked: null })), triggered: false }); })}>{ch.name}</Button>)}
        </div>
      )}

      <Card className="mt-6" title="Resultado da campanha">
        <p className="mb-2 text-sm text-mute">Depois que a campanha rodar, registre como foi e marque nas táticas o que funcionou: é assim que as próximas ficam melhores.</p>
        <div className="flex flex-wrap gap-2">
          {([['deu-certo', 'Deu certo'], ['parcial', 'Parcial'], ['nao', 'Não funcionou']] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={c.result === k ? 'primary' : 'outline'} onClick={() => edit((d) => { d.result = d.result === k ? null : k; })}>{l}</Button>
          ))}
        </div>
        <textarea className="input mt-3" rows={3} value={c.resultNotes ?? ''} onChange={(e) => edit((d) => { d.resultNotes = e.target.value; })} placeholder="O que aprendemos com esta campanha?" />
      </Card>
    </div>
  );
}
