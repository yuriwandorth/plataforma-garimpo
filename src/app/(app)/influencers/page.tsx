'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { where } from 'firebase/firestore';
import { useCollection, useWriter } from '@/lib/db';
import { useInfluencers } from '@/lib/hooks';
import { countable, fmtBRL, monthBounds, parts, todayISO } from '@/lib/calc';
import { commissionFor, DEFAULT_TIERS, STAGES, trialDaysLeft, type CommissionModel, type Influencer, type InfluencerMonth, type InfluencerStage } from '@/lib/growth';
import type { Sale } from '@/lib/types';
import type { Lead } from '@/lib/leads';
import { Badge, Button, Card, cx, ErrorNote, PageHeader, Spinner, Stat, Tabs } from '@/components/ui';
import { MonthPicker } from '@/components/MonthPicker';
import { CommissionModelsModal, InfluencerModal } from '@/components/InfluencerForms';
import { syncInfluencerCoupon } from '@/lib/couponSync';

const DEAL = { permuta: 'permuta', comissao: 'comissão', ambos: 'permuta + comissão' } as const;

export default function InfluencersPage() {
  const inf = useInfluencers();
  const w = useWriter();
  const [tab, setTab] = useState<'funil' | 'faturamento'>('funil');
  const [add, setAdd] = useState<InfluencerStage | null>(null);
  const [edit, setEdit] = useState<Influencer | null>(null);
  const [models, setModels] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const today = todayISO();
  useEffect(() => { try { setCollapsed(JSON.parse(localStorage.getItem('funil-influencers') ?? '[]')); } catch {} }, []);
  function toggleCol(id: string) {
    setCollapsed((c) => { const n = c.includes(id) ? c.filter((x) => x !== id) : [...c, id]; try { localStorage.setItem('funil-influencers', JSON.stringify(n)); } catch {} return n; });
  }

  async function move(i: Influencer, stage: InfluencerStage) {
    if (i.stage === stage) return;
    if (stage === 'fechado' && !i.email) { setEdit({ ...i, stage }); return; }
    await w.update<Influencer>('influencers', i.id, { stage }, `${i.name} movida para ${STAGES.find((s) => s.id === stage)!.label}`);
    if (i.coupon) await syncInfluencerCoupon(w, { ...i, stage }).catch(() => {});
  }

  return (
    <div>
      <PageHeader title="Influencers" subtitle="Prospecte no funil e acompanhe faturamento, comissão e entregas da permuta de quem já fechou."
        actions={<><Button variant="outline" onClick={() => setModels(true)}>Modelos de comissão</Button><Button onClick={() => setAdd('prospectar')}>Adicionar influencer</Button></>} />
      <ErrorNote error={inf.error} />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'funil', label: 'Funil' }, { id: 'faturamento', label: 'Faturamento' }]} />
      {inf.loading ? <Spinner /> : tab === 'funil' ? (
        <Board>
          {STAGES.map((st) => {
            const list = inf.data.filter((i) => i.stage === st.id);
            const isCollapsed = collapsed.includes(st.id);
            if (isCollapsed) return (
              <button key={st.id} type="button" onClick={() => toggleCol(st.id)} title={`Abrir ${st.label}`}
                onDragOver={(e) => e.preventDefault()} onDrop={() => { const i = inf.byId[drag ?? '']; if (i) move(i, st.id); setDrag(null); }}
                className="flex w-11 shrink-0 flex-col items-center gap-2 rounded-xl border border-line bg-panel py-3 hover:border-gold/60">
                <Badge>{list.length}</Badge>
                <span className="text-xs font-semibold uppercase tracking-wide [writing-mode:vertical-rl]">{st.label}</span>
              </button>
            );
            return (
              <div key={st.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { const i = inf.byId[drag ?? '']; if (i) move(i, st.id); setDrag(null); }}
                className={cx('flex w-72 shrink-0 flex-col rounded-xl border bg-bg/40 p-2', drag ? 'border-dashed border-gold/60 bg-gold/5' : 'border-line')}>
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide">{st.label}</span>
                  <span className="flex items-center gap-1">
                    <Badge>{list.length}</Badge>
                    <button type="button" onClick={() => toggleCol(st.id)} className="rounded px-1.5 text-mute hover:bg-line/50 hover:text-ink" title="Recolher coluna" aria-label={`Recolher ${st.label}`}>‹</button>
                  </span>
                </div>
                <div className="space-y-2 overflow-y-auto pr-0.5" style={{ maxHeight: '70vh' }}>
                  {list.map((i) => {
                    const left = i.deal !== 'comissao' ? trialDaysLeft(i, today) : null;
                    return (
                      <div key={i.id} draggable onDragStart={() => setDrag(i.id)} onDragEnd={() => setDrag(null)}
                        className={cx('card flex h-[7.5rem] cursor-grab flex-col p-3 active:cursor-grabbing', i.active === false && 'opacity-50')}>
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-semibold text-gold">{i.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium" title={i.name}>{i.name}</div>
                            <div className="truncate text-xs text-mute">@{i.handle}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1 overflow-hidden" style={{ maxHeight: '1.5rem' }}>
                          <Badge tone="gold">{DEAL[i.deal]}</Badge>
                          {i.coupon && <Badge>{i.coupon}</Badge>}
                          {left !== null && st.id === 'fechado' && <Badge tone={left < 0 ? 'bad' : left <= 15 ? 'warn' : 'mute'}>{left < 0 ? 'teste acabou' : `teste: ${left}d`}</Badge>}
                        </div>
                        <div className="mt-auto flex items-center justify-between gap-1 pt-2">
                          {st.id === 'fechado' ? <Link href={`/influencers/painel/?id=${i.id}`} className="text-xs font-medium text-gold hover:underline">Abrir painel →</Link> : <button className="text-xs text-mute hover:text-ink" onClick={() => setEdit(i)}>Editar</button>}
                          <select aria-label="Mover para outra coluna" className="rounded border border-line bg-panel px-1 py-0.5 text-xs" value={i.stage} onChange={(e) => move(i, e.target.value as InfluencerStage)}>
                            {STAGES.map((s2) => <option key={s2.id} value={s2.id}>{s2.label}</option>)}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                  {list.length === 0 && <p className="px-1 py-6 text-center text-xs text-mute">Arraste um card para cá</p>}
                </div>
              </div>
            );
          })}
        </Board>
      ) : <Revenue influencers={inf.closed} />}
      <InfluencerModal open={!!add} onClose={() => setAdd(null)} defaultStage={add ?? 'prospectar'} />
      <InfluencerModal open={!!edit} onClose={() => setEdit(null)} influencer={edit ?? undefined} />
      <CommissionModelsModal open={models} onClose={() => setModels(false)} influencers={inf.data} />
    </div>
  );
}

function Revenue({ influencers }: { influencers: Influencer[] }) {
  const t = parts(todayISO());
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const { start, end } = monthBounds(ym.y, ym.m);
  const sales = useCollection<Sale>('sales', [where('date', '>=', start), where('date', '<=', end)], `inf-${start}`);
  const months = useCollection<InfluencerMonth>('influencerMonths', [where('year', '==', ym.y), where('month', '==', ym.m)], `im-${ym.y}-${ym.m}`);
  const models = useCollection<CommissionModel>('commissionModels');
  const allLeads = useCollection<Lead>('leads');
  const rows = useMemo(() => influencers.map((i) => {
    const s = sales.data.filter((x) => countable(x) && x.influencerId === i.id);
    const revenue = s.reduce((a, x) => a + x.gross, 0);
    const im = months.data.find((x) => x.influencerId === i.id);
    const auto = allLeads.data.filter((l) => !l.deleted && l.influencerId === i.id && l.firstSeenAt && l.firstSeenAt >= start && l.firstSeenAt <= end).length;
    const leads = (im ? im.leads.reduce((a, b) => a + (b || 0), 0) : 0) + auto;
    const tiers = models.data.find((m) => m.id === i.modelId)?.tiers ?? DEFAULT_TIERS;
    const com = i.deal === 'permuta' ? null : commissionFor(revenue, tiers);
    return { i, revenue, count: s.length, leads, com };
  }).sort((a, b) => b.revenue - a.revenue), [influencers, sales.data, months.data, models.data, allLeads.data, start, end]);
  const tot = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, count: a.count + r.count, leads: a.leads + r.leads, com: a.com + (r.com?.value ?? 0) }), { revenue: 0, count: 0, leads: 0, com: 0 });

  return (
    <div>
      <div className="mb-4 flex justify-end"><MonthPicker y={ym.y} m={ym.m} onChange={(y, m) => setYm({ y, m })} /></div>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Faturamento total" value={fmtBRL(tot.revenue)} />
        <Stat label="Vendas" value={tot.count} />
        <Stat label="Leads gerados" value={tot.leads} />
        <Stat label="Comissões estimadas" value={fmtBRL(tot.com)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.i.id} title={<Link className="hover:underline" href={`/influencers/painel/?id=${r.i.id}`}>{r.i.name}</Link>} action={<span className="text-xs text-mute">@{r.i.handle}</span>}>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-xs text-mute">Faturamento</div><b>{fmtBRL(r.revenue)}</b></div>
              <div><div className="text-xs text-mute">Leads</div><b>{r.leads}</b></div>
              <div><div className="text-xs text-mute">Vendas</div><b>{r.count}</b></div>
              <div><div className="text-xs text-mute">Ticket médio</div><b>{fmtBRL(r.count ? r.revenue / r.count : 0)}</b></div>
            </div>
            {r.com && <div className="mt-2 text-xs text-mute">{r.com.tier.name} · {r.com.tier.pct}% · comissão {fmtBRL(r.com.value)}</div>}
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-mute">Nenhuma influencer fechada ainda. Mova um card para "Fechado" no funil.</p>}
      </div>
    </div>
  );
}

/** Quadro com rolagem horizontal: barra fixa no topo (acompanha a tela) + setas laterais */
function Board({ children }: { children: React.ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ max: 0, pos: 0 });
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const upd = () => {
      const max = Math.max(0, el.scrollWidth - el.clientWidth), pos = el.scrollLeft;
      setM((p) => (p.max === max && Math.abs(p.pos - pos) < 1 ? p : { max, pos }));
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    const mo = new MutationObserver(upd);
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener('scroll', upd);
    window.addEventListener('resize', upd);
    return () => { ro.disconnect(); mo.disconnect(); el.removeEventListener('scroll', upd); window.removeEventListener('resize', upd); };
  }, []);
  const go = (left: number, smooth = false) => body.current?.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  const l = m.pos > 4, r = m.pos < m.max - 4;
  return (
    <div className="relative">
      {m.max > 0 && (
        <div className="sticky top-14 z-20 mb-2 flex items-center gap-2 rounded-lg border border-line bg-panel/95 px-2 py-1.5 backdrop-blur lg:top-2">
          <button type="button" onClick={() => go(m.pos - 300, true)} disabled={!l} className="rounded-md border border-line px-2 text-sm disabled:opacity-30" aria-label="Rolar para a esquerda">‹</button>
          <input type="range" min={0} max={m.max} value={m.pos} onChange={(e) => go(Number(e.target.value))} aria-label="Rolar o quadro" className="h-2 flex-1 cursor-pointer accent-[rgb(var(--gold))]" />
          <button type="button" onClick={() => go(m.pos + 300, true)} disabled={!r} className="rounded-md border border-line px-2 text-sm disabled:opacity-30" aria-label="Rolar para a direita">›</button>
        </div>
      )}
      <div ref={body} className="flex items-start gap-3 overflow-x-auto pb-3">{children}</div>
      {r && <button type="button" onClick={() => go(m.pos + 300, true)} className="fixed right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 rounded-full border border-line bg-panel shadow lg:block" aria-label="Rolar para a direita">›</button>}
      {l && <button type="button" onClick={() => go(m.pos - 300, true)} className="fixed left-[15.5rem] top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 rounded-full border border-line bg-panel shadow lg:block" aria-label="Rolar para a esquerda">‹</button>}
    </div>
  );
}
