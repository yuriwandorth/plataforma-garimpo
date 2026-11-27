'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { where } from 'firebase/firestore';
import { useCollection, useWriter } from '@/lib/db';
import { useClients, useInfluencers } from '@/lib/hooks';
import { countable, fmtBRL, fmtDate, net, parseMoney, parts, sameMonth, todayISO, weekRanges } from '@/lib/calc';
import { commissionFor, DEFAULT_TIERS, trialDaysLeft, type CommissionModel, type InfluencerMonth } from '@/lib/growth';
import type { Sale } from '@/lib/types';
import { Badge, Button, Card, Progress, Spinner, Stat } from '@/components/ui';
import { MonthPicker } from '@/components/MonthPicker';
import { InfluencerModal } from '@/components/InfluencerForms';

export default function Page() { return <Suspense fallback={<Spinner />}><Panel /></Suspense>; }

function Panel() {
  const id = useSearchParams().get('id') ?? '';
  const inf = useInfluencers();
  const i = inf.byId[id];
  const models = useCollection<CommissionModel>('commissionModels');
  const sales = useCollection<Sale>('sales', [where('influencerId', '==', id || '__')], `is-${id}`);
  const t = parts(todayISO());
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const docId = `${id}__${ym.y}-${String(ym.m).padStart(2, '0')}`;
  const months = useCollection<InfluencerMonth>('influencerMonths', [where('influencerId', '==', id || '__')], `imo-${id}`);
  const im = months.data.find((x) => x.id === docId);
  const w = useWriter();
  const clients = useClients();
  const [edit, setEdit] = useState(false);
  const [link, setLink] = useState('');
  const [saved, setSaved] = useState('');

  const blank: Omit<InfluencerMonth, 'id'> = { influencerId: id, year: ym.y, month: ym.m, goals: [0, 0, 0, 0], leads: [0, 0, 0, 0], stories: 0, reels: 0, links: [] };
  const [m, setM] = useState<Omit<InfluencerMonth, 'id'>>(blank);
  useEffect(() => { setM(im ? { ...blank, ...im } : blank); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [im?.id, docId, months.loading]);

  async function persist(next: Omit<InfluencerMonth, 'id'>) {
    setM(next);
    await w.set('influencerMonths', docId, next);
    setSaved(`Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
  }

  const monthSales = useMemo(() => sales.data.filter((s) => countable(s) && sameMonth(s.date, ym.y, ym.m)), [sales.data, ym]);
  if (inf.loading) return <Spinner />;
  if (!i) return <p className="text-sm text-mute">Influencer não encontrada. <Link className="underline" href="/influencers/">Voltar</Link></p>;

  const revenue = monthSales.reduce((a, s) => a + s.gross, 0);
  const tiers = models.data.find((x) => x.id === i.modelId)?.tiers ?? DEFAULT_TIERS;
  const com = commissionFor(revenue, tiers);
  const weeks = weekRanges(ym.y, ym.m).map((wk, k) => {
    const s = monthSales.filter((x) => x.date >= wk.start && x.date <= wk.end);
    return { ...wk, revenue: s.reduce((a, x) => a + x.gross, 0), net: s.reduce((a, x) => a + net(x), 0), count: s.length, goal: m.goals[k] || 0, leads: m.leads[k] || 0 };
  });
  const leads = weeks.reduce((a, x) => a + x.leads, 0);
  const goal = weeks.reduce((a, x) => a + x.goal, 0);
  const left = trialDaysLeft(i, todayISO());
  const showPermuta = i.deal !== 'comissao';

  return (
    <div>
      <Link href="/influencers/" className="text-xs text-mute hover:text-ink">← Influencers</Link>
      <div className="mb-6 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{i.name}</h1>
          <p className="text-sm text-mute">@{i.handle} · {i.network}{i.email && ` · ${i.email}`}{i.coupon && ` · cupom ${i.coupon}`}</p>
        </div>
        <div className="flex items-center gap-2"><MonthPicker y={ym.y} m={ym.m} onChange={(y, mm) => setYm({ y, m: mm })} /><Button variant="outline" onClick={() => setEdit(true)}>Editar</Button>
          {(() => {
            const asClient = clients.data.find((c) => c.influencerId === i.id && !c.deleted && (c.notes ?? '').includes('Influencer parceira'));
            return asClient ? <Link href="/clientes/" className="text-xs text-good">já é cliente na Central</Link> : (
              <Button variant="ghost" onClick={() => w.create('clients', {
                name: i.name, email: i.email, status: 'ativo', channelId: 'influencer', influencerId: i.id,
                startDate: i.trialStart, endDate: i.trialEnd, lastValue: 0, isTest: false,
                notes: `Influencer parceira (@${i.handle}) · ${i.deal === 'comissao' ? 'comissão' : 'permuta'}`,
              }, `Influencer virou cliente: ${i.name}`)}>Criar ficha na Central</Button>
            );
          })()}</div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Faturamento no mês" value={fmtBRL(revenue)} sub={goal ? `meta ${fmtBRL(goal)}` : 'sem meta definida'} />
        <Stat label="Leads gerados" value={leads} />
        <Stat label="Vendas" value={monthSales.length} />
        <Stat label="Ticket médio" value={fmtBRL(monthSales.length ? revenue / monthSales.length : 0)} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {i.deal !== 'permuta' && (
          <Card title="Comissão" action={<Badge tone="gold">{com.tier.name} · {com.tier.pct}%</Badge>}>
            <div className="text-2xl font-semibold">{fmtBRL(com.value)} <span className="text-sm font-normal text-mute">estimada no mês</span></div>
            {com.next ? (
              <>
                <div className="my-2"><Progress value={com.next.min ? revenue / com.next.min : 0} /></div>
                <p className="text-xs text-mute">Faltam {fmtBRL(com.missing)} para a faixa {com.next.name} ({com.next.pct}% de comissão). O percentual sobe conforme a faixa do mês.</p>
              </>
            ) : <p className="mt-2 text-xs text-good">Faixa máxima atingida.</p>}
          </Card>
        )}
        {showPermuta && (
          <Card title="Permuta do mês" action={left !== null && <Badge tone={left < 0 ? 'bad' : left <= 15 ? 'warn' : 'mute'}>{left < 0 ? `teste acabou em ${fmtDate(i.trialEnd)}` : `teste até ${fmtDate(i.trialEnd)} · ${left}d`}</Badge>}>
            <div className="grid grid-cols-2 gap-3">
              {([['stories', 'Stories', i.storiesPerMonth ?? 0], ['reels', 'Reels collab', i.reelsPerMonth ?? 0]] as const).map(([k, label, target]) => (
                <div key={k} className="rounded-lg border border-line p-3">
                  <div className="text-xs text-mute">{label}</div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => persist({ ...m, [k]: Math.max(0, m[k] - 1) })}>−</Button>
                    <b className="text-lg">{m[k]}</b><span className="text-xs text-mute">/ {target}</span>
                    <Button size="sm" variant="outline" onClick={() => persist({ ...m, [k]: m[k] + 1 })}>+</Button>
                  </div>
                  <div className="mt-2"><Progress value={target ? m[k] / target : 0} tone={target && m[k] >= target ? 'good' : 'gold'} /></div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <span className="label">Links das publicações</span>
              <ul className="mb-2 space-y-1 text-xs">
                {m.links.map((l, k) => (
                  <li key={k} className="flex justify-between gap-2"><a className="truncate text-gold hover:underline" href={l} target="_blank" rel="noreferrer">{l}</a>
                    <button className="text-mute hover:text-bad" onClick={() => persist({ ...m, links: m.links.filter((_, j) => j !== k) })}>remover</button></li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input className="input" placeholder="https://instagram.com/…" value={link} onChange={(e) => setLink(e.target.value)} />
                <Button variant="outline" onClick={() => { if (link.trim()) { persist({ ...m, links: [...m.links, link.trim()] }); setLink(''); } }}>Adicionar</Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <Card title="Semanas" action={<span className="text-xs text-mute">{saved || 'meta e leads salvam ao sair do campo'}</span>}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">Semana</th><th className="th">Meta receita</th><th className="th">Faturamento</th><th className="th">Líquido</th><th className="th">Leads</th><th className="th">Vendas</th><th className="th">Ticket</th></tr></thead>
            <tbody>
              {weeks.map((wk, k) => (
                <tr key={wk.label} className="border-b border-line/60">
                  <td className="td"><b>{wk.label}</b> <span className="text-xs text-mute">{fmtDate(wk.start).slice(0, 5)} → {fmtDate(wk.end).slice(0, 5)}</span></td>
                  <td className="td"><input className="input w-28" defaultValue={wk.goal || ''} key={`g${docId}${k}${wk.goal}`} onBlur={(e) => { const g = [...m.goals] as InfluencerMonth['goals']; g[k] = parseMoney(e.target.value); persist({ ...m, goals: g }); }} /></td>
                  <td className="td">{fmtBRL(wk.revenue)} <span className="text-[10px] text-mute">auto</span></td>
                  <td className="td">{fmtBRL(wk.net)}</td>
                  <td className="td"><input className="input w-20" type="number" min={0} defaultValue={wk.leads || ''} key={`l${docId}${k}${wk.leads}`} onBlur={(e) => { const l = [...m.leads] as InfluencerMonth['leads']; l[k] = Number(e.target.value) || 0; persist({ ...m, leads: l }); }} /></td>
                  <td className="td">{wk.count}</td>
                  <td className="td">{fmtBRL(wk.count ? wk.revenue / wk.count : 0)}</td>
                </tr>
              ))}
              <tr><td className="td font-semibold">Total do mês</td><td className="td font-semibold">{fmtBRL(goal)}</td><td className="td font-semibold">{fmtBRL(revenue)}</td><td className="td" /><td className="td font-semibold">{leads}</td><td className="td font-semibold">{monthSales.length}</td><td className="td" /></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-mute">O faturamento vem sozinho das vendas em que você marcou esta influencer.</p>
      </Card>

      {monthSales.length > 0 && (
        <Card className="mt-4" title="Vendas atribuídas no mês">
          <ul className="divide-y divide-line">
            {monthSales.map((s) => <li key={s.id} className="flex justify-between py-1.5 text-sm"><span>{s.clientName} <span className="text-xs text-mute">· {s.planName} · {fmtDate(s.date)}</span></span><b>{fmtBRL(s.gross)}</b></li>)}
          </ul>
        </Card>
      )}
      <InfluencerModal open={edit} onClose={() => setEdit(false)} influencer={i} />
    </div>
  );
}
