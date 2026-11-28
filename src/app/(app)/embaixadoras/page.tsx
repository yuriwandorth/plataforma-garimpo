'use client';
import { useMemo, useState } from 'react';
import { useCollection, useSalesSince, useWriter } from '@/lib/db';
import { useClients } from '@/lib/hooks';
import { addMonths, fmtBRL, fmtDate, fmtPct, iso, parts, todayISO } from '@/lib/calc';
import { AMB_STATUS, AMBASSADOR_BENEFITS, ambassadorEarning, ambassadorRanking, DEAL_LABEL, opportunityQuadrant, referralRadar, type Ambassador, type AmbassadorDeal, type AmbassadorRow, type AmbassadorStatus } from '@/lib/growth';
import { BenefitsPicker } from '@/components/BenefitsPicker';
import type { Client } from '@/lib/types';
import { Badge, Button, Card, cx, Empty, Field, Modal, PageHeader, Spinner, Stat, Tabs } from '@/components/ui';
import { MonthPicker } from '@/components/MonthPicker';

const LEVEL_TONE = { Ouro: 'gold', Prata: 'mute', Bronze: 'warn' } as const;

export default function EmbaixadorasPage() {
  const t = parts(todayISO());
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const [period, setPeriod] = useState<'mes' | 'tudo'>('mes');
  const [metric, setMetric] = useState<'volume' | 'receita'>('volume');
  const [tab, setTab] = useState<'cadastro' | 'ranking' | 'radar'>('cadastro');
  const [reg, setReg] = useState<{ clientId?: string } | null>(null);
  const [q, setQ] = useState('');
  const [neg, setNeg] = useState<AmbassadorRow | null>(null);
  const sales = useSalesSince(addMonths(iso(t.y, t.m, 1), -36));
  const clients = useClients();
  const amb = useCollection<Ambassador>('ambassadors');
  const ambBy = useMemo(() => Object.fromEntries(amb.data.map((a) => [a.id, a])), [amb.data]);
  const rows = useMemo(() => ambassadorRanking(sales.data, clients.data, period === 'tudo' ? 'tudo' : ym, metric), [sales.data, clients.data, period, ym, metric]);
  const radar = useMemo(() => referralRadar(sales.data, clients.data, ym.y, ym.m, todayISO()), [sales.data, clients.data, ym]);
  const quad = useMemo(() => opportunityQuadrant(rows), [rows]);
  const list = rows.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const allTime = useMemo(() => Object.fromEntries(ambassadorRanking(sales.data, clients.data, 'tudo', 'volume').map((r) => [r.clientId, r])), [sales.data, clients.data]);
  const registered = amb.data.filter((a) => a.status).sort((a, b) => (allTime[b.id]?.volume ?? 0) - (allTime[a.id]?.volume ?? 0));

  return (
    <div>
      <PageHeader title="Embaixadoras" subtitle="Alunas que indicam: ranking, recompensa combinada e radar de indicações. Uma indicação é uma venda nova com “indicado por” preenchido."
        actions={<>{tab !== 'cadastro' && (period === 'mes' || tab === 'radar') && <MonthPicker y={ym.y} m={ym.m} onChange={(y, m) => setYm({ y, m })} />}<Button onClick={() => setReg({})}>Cadastrar embaixadora</Button></>} />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'cadastro', label: `Cadastradas (${registered.length})` }, { id: 'ranking', label: 'Ranking de indicações' }, { id: 'radar', label: 'Radar de indicações' }]} />
      {sales.loading || clients.loading || amb.loading ? <Spinner /> : tab === 'cadastro' ? (
        registered.length === 0 ? <Empty title="Nenhuma embaixadora cadastrada" text="Convide alunas engajadas para indicar em troca de benefícios. Cadastre aqui mesmo antes da primeira indicação." action={<Button onClick={() => setReg({})}>Cadastrar embaixadora</Button>} /> : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Embaixadora</th><th className="th">Situação</th><th className="th">Benefícios</th><th className="th">Recompensa</th><th className="th">Indicações</th><th className="th" /></tr></thead>
              <tbody>
                {registered.map((a) => {
                  const c = clients.byId[a.id] as Client | undefined;
                  const r = allTime[a.id];
                  const st = AMB_STATUS[a.status!];
                  const first = (c?.name ?? '').split(' ')[0];
                  const phone = (c?.phone ?? '').replace(/\D/g, '');
                  const invite = phone ? `https://wa.me/${phone.length <= 11 ? '55' + phone : phone}?text=${encodeURIComponent(`Oi, ${first}! Você é uma das alunas que mais vive o Garimpo e queria te fazer um convite: ser embaixadora. Funciona assim: você indica amigas e ganha ${(a.benefits ?? []).slice(0, 3).join(', ') || 'benefícios exclusivos'}. Topa que eu te explique?`)}` : null;
                  return (
                    <tr key={a.id} className="border-b border-line/60 align-top">
                      <td className="td"><div className="font-medium">{c?.name ?? 'Aluna removida'}</div><div className="text-xs text-mute">{c?.status ?? ''}{c?.planName ? ` · ${c.planName}` : ''}{a.code ? ` · código ${a.code}` : ''}</div></td>
                      <td className="td"><Badge tone={st.tone}>{st.label}</Badge><div className="text-xs text-mute">{a.joinedAt ? `desde ${fmtDate(a.joinedAt)}` : a.invitedAt ? `convidada ${fmtDate(a.invitedAt)}` : ''}</div></td>
                      <td className="td text-xs">{(a.benefits ?? []).length ? (a.benefits ?? []).join(' · ') : <span className="text-mute">—</span>}</td>
                      <td className="td text-xs text-mute">{a.deal !== 'nenhuma' ? ambassadorEarning(a, r ?? { clientId: a.id, name: '', volume: 0, revenue: 0, ticket: 0, prevVolume: 0, rank: 0, level: null }) : '—'}</td>
                      <td className="td">{r?.volume ?? 0}<div className="text-xs text-mute">{fmtBRL(r?.revenue ?? 0)}</div></td>
                      <td className="td"><div className="flex flex-wrap justify-end gap-2">
                        {invite && a.status === 'convidada' && <a href={invite} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-xs hover:border-gold/60">Convite no WhatsApp</a>}
                        <Button size="sm" variant="outline" onClick={() => setReg({ clientId: a.id })}>Editar</Button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'ranking' ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-mute">Período</span>
            {(['mes', 'tudo'] as const).map((p) => <Button key={p} size="sm" variant={period === p ? 'primary' : 'outline'} onClick={() => setPeriod(p)}>{p === 'mes' ? 'Mês' : 'Tudo'}</Button>)}
            <span className="ml-3 text-xs text-mute">Métrica</span>
            {(['volume', 'receita'] as const).map((p) => <Button key={p} size="sm" variant={metric === p ? 'primary' : 'outline'} onClick={() => setMetric(p)}>{p === 'volume' ? 'Volume' : 'Receita'}</Button>)}
          </div>
          {rows.length === 0 ? <Empty title="Nenhuma indicação no período" text="Ao lançar uma venda nova, preencha “Indicado por” para a indicação contar aqui." /> : (
            <>
              <div className="mb-6 grid gap-3 sm:grid-cols-3">
                {rows.slice(0, 3).map((r) => (
                  <Card key={r.clientId} className={cx(r.rank === 1 && 'border-gold')}>
                    <div className="flex items-center justify-between"><span className="text-sm text-mute">#{r.rank}</span>{r.level && <Badge tone={LEVEL_TONE[r.level]}>{r.level}</Badge>}</div>
                    <div className="mt-1 truncate text-lg font-semibold">{r.name}</div>
                    <div className="text-sm">{r.volume} indicação(ões) · {fmtBRL(r.revenue)}</div>
                    {period === 'mes' && <div className="text-xs text-mute">{r.volume - r.prevVolume >= 0 ? '+' : ''}{r.volume - r.prevVolume} vs mês anterior</div>}
                  </Card>
                ))}
              </div>
              <input className="input mb-3 max-w-sm" placeholder="Buscar embaixadora…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-line"><th className="th">#</th><th className="th">Embaixadora</th><th className="th">Indicações</th><th className="th">Receita</th><th className="th">Ticket</th><th className="th">Negociação</th><th className="th" /></tr></thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.clientId} className="border-b border-line/60">
                        <td className="td">{r.rank}</td>
                        <td className="td font-medium">{r.name} {r.level && <Badge tone={LEVEL_TONE[r.level]}>{r.level}</Badge>}</td>
                        <td className="td">{r.volume}</td>
                        <td className="td">{fmtBRL(r.revenue)}</td>
                        <td className="td">{fmtBRL(r.ticket)}</td>
                        <td className="td text-xs text-mute">{ambassadorEarning(ambBy[r.clientId], r)}{ambBy[r.clientId]?.approachedAt && <div>abordada em {fmtDate(ambBy[r.clientId].approachedAt)}</div>}</td>
                        <td className="td"><Button size="sm" variant="ghost" onClick={() => setReg({ clientId: r.clientId })}>{ambBy[r.clientId]?.status ? 'Editar' : 'Cadastrar como embaixadora'}</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Clientes" value={radar.clients} sub={`${radar.referrers} já indicaram · ${radar.notYet} ainda não`} />
            <Stat label="Indicações no mês" value={radar.monthReferrals} sub={`${radar.activated} pessoa(s) indicaram pela primeira vez`} />
            <Stat label="Indicadas que renovaram no mês" value={fmtPct(radar.renewedRate)} sub={`${radar.renewedInMonth} de ${radar.referredTotal} indicadas`} />
            <Stat label="Retenção das indicadas" value={fmtPct(radar.retention)} sub={`${radar.retained} de ${radar.referredTotal} seguem ativas`} />
          </div>
          <Card title="Mapa de oportunidades" action={<span className="text-xs text-mute">volume × ticket, comparados à mediana do período</span>}>
            <div className="grid gap-3 sm:grid-cols-2">
              {([['escalar', 'Escalar e reconhecer', 'Muitas indicações com ticket alto. Priorize relacionamento e reconhecimento.'],
                ['ticket', 'Aumentar ticket', 'Já indica bastante; apresente planos de maior valor para as indicadas dela.'],
                ['premium', 'Ativar indicações premium', 'Traz bons planos, mas indica pouco. Estimule com a recompensa.'],
                ['estimular', 'Estimular', 'Pouco volume e ticket baixo. Comece pelo básico: lembrar e facilitar a indicação.']] as const).map(([k, title, text]) => (
                <div key={k} className="rounded-lg border border-line p-3">
                  <div className="font-medium">{title}</div>
                  <p className="text-xs text-mute">{text}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {quad[k].map((r) => <li key={r.clientId}>{r.name} <span className="text-xs text-mute">· {r.volume} ind. · {fmtBRL(r.ticket)} ticket</span></li>)}
                    {quad[k].length === 0 && <li className="text-xs text-mute">Ninguém aqui.</li>}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
      {neg && <NegotiationModal row={neg} current={ambBy[neg.clientId]} onClose={() => setNeg(null)} />}
      {reg && <AmbassadorModal clientId={reg.clientId} current={reg.clientId ? ambBy[reg.clientId] : undefined} clients={clients.data} row={reg.clientId ? allTime[reg.clientId] : undefined} onClose={() => setReg(null)} />}
    </div>
  );
}

function NegotiationModal({ row, current, onClose }: { row: AmbassadorRow; current?: Ambassador; onClose: () => void }) {
  const w = useWriter();
  const [deal, setDeal] = useState<AmbassadorDeal>(current?.deal ?? 'nenhuma');
  const [value, setValue] = useState(String(current?.value ?? ''));
  const [approached, setApproached] = useState(current?.approachedAt ?? '');
  const [notes, setNotes] = useState(current?.notes ?? '');
  const unit = deal === 'meses' ? 'meses por indicação' : deal === 'comissao' ? '% da venda indicada' : deal === 'desconto' ? '% de desconto na renovação' : '';
  return (
    <Modal open onClose={onClose} title={`Negociação de ${row.name}`} subtitle="Como esta embaixadora é recompensada por cada cliente que indicar. Vale enquanto ela tiver plano ativo."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={async () => {
        await w.set('ambassadors', row.clientId, { deal, value: Number(value.replace(',', '.')) || 0, approachedAt: approached || undefined, notes: notes || undefined });
        onClose();
      }}>Salvar negociação</Button></>}>
      <div className="space-y-3">
        <Field label="Tipo de negociação">
          <select className="input" value={deal} onChange={(e) => setDeal(e.target.value as AmbassadorDeal)}>
            {(Object.keys(DEAL_LABEL) as AmbassadorDeal[]).map((k) => <option key={k} value={k}>{DEAL_LABEL[k]}</option>)}
          </select>
        </Field>
        {deal !== 'nenhuma' && <Field label={`Valor (${unit})`}><input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>}
        <Field label="Abordada em" hint="Marque quando conversar com ela sobre a recompensa."><input className="input" type="date" value={approached} onChange={(e) => setApproached(e.target.value)} /></Field>
        <Field label="Observações"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <p className="text-xs text-mute">Ganho acumulado hoje: {ambassadorEarning({ id: row.clientId, deal, value: Number(value.replace(',', '.')) || 0 }, row)}.</p>
      </div>
    </Modal>
  );
}

function AmbassadorModal({ clientId, current, clients, row, onClose }: { clientId?: string; current?: Ambassador; clients: Client[]; row?: AmbassadorRow; onClose: () => void }) {
  const w = useWriter();
  const today = todayISO();
  const [cid, setCid] = useState(clientId ?? '');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AmbassadorStatus>(current?.status ?? 'convidada');
  const [invitedAt, setInvitedAt] = useState(current?.invitedAt ?? today);
  const [joinedAt, setJoinedAt] = useState(current?.joinedAt ?? '');
  const [deal, setDeal] = useState<AmbassadorDeal>(current?.deal ?? 'nenhuma');
  const [value, setValue] = useState(String(current?.value ?? ''));
  const [benefits, setBenefits] = useState<string[]>(current?.benefits ?? []);
  const [code, setCode] = useState(current?.code ?? '');
  const [notes, setNotes] = useState(current?.notes ?? '');
  const [err, setErr] = useState('');
  const c = clients.find((x) => x.id === cid);
  const found = q.trim().length >= 2 ? clients.filter((x) => !x.deleted && x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const unit = deal === 'meses' ? 'meses por indicação' : deal === 'comissao' ? '% da venda indicada' : deal === 'desconto' ? '% de desconto na renovação' : '';
  async function save() {
    if (!cid) return setErr('Escolha a aluna.');
    const data: Omit<Ambassador, 'id'> = {
      deal, value: Number(value.replace(',', '.')) || 0, status, benefits,
      ...(invitedAt ? { invitedAt } : {}), ...(joinedAt || status === 'ativa' ? { joinedAt: joinedAt || today } : {}),
      ...(code.trim() ? { code: code.trim().toUpperCase() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), ...(current?.approachedAt ? { approachedAt: current.approachedAt } : {}),
    };
    await w.set('ambassadors', cid, data);
    onClose();
  }
  return (
    <Modal open onClose={onClose} wide title={c ? `Embaixadora: ${c.name}` : 'Cadastrar embaixadora'} subtitle="Aluna que indica em troca de benefícios. Vale enquanto ela tiver plano ativo."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {!clientId && (
          <div className="sm:col-span-2">
            <span className="label">Aluna</span>
            {c ? <div className="flex items-center gap-2 text-sm"><b>{c.name}</b><button className="text-xs text-mute hover:text-ink" onClick={() => setCid('')}>trocar</button></div> : <>
              <input className="input" placeholder="Buscar pelo nome" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="mt-2 flex flex-wrap gap-2">{found.map((x) => <button key={x.id} type="button" onClick={() => setCid(x.id)} className="rounded-lg border border-line px-2.5 py-1 text-xs hover:border-gold/60">{x.name} <span className="text-mute">· {x.status}</span></button>)}</div>
            </>}
          </div>
        )}
        <Field label="Situação">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as AmbassadorStatus)}>
            {(Object.keys(AMB_STATUS) as AmbassadorStatus[]).map((k) => <option key={k} value={k}>{AMB_STATUS[k].label}</option>)}
          </select>
        </Field>
        <Field label="Código de indicação (opcional)" hint="Ex.: o primeiro nome dela."><input className="input uppercase" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <Field label="Convidada em"><input type="date" className="input" value={invitedAt} onChange={(e) => setInvitedAt(e.target.value)} /></Field>
        <Field label="Aceitou em"><input type="date" className="input" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} /></Field>
        <div className="sm:col-span-2">
          <span className="label">Benefícios dela</span>
          <BenefitsPicker value={benefits} onChange={setBenefits} options={AMBASSADOR_BENEFITS} />
        </div>
        <Field label="Recompensa por indicação">
          <select className="input" value={deal} onChange={(e) => setDeal(e.target.value as AmbassadorDeal)}>
            {(Object.keys(DEAL_LABEL) as AmbassadorDeal[]).map((k) => <option key={k} value={k}>{DEAL_LABEL[k]}</option>)}
          </select>
        </Field>
        {deal !== 'nenhuma' ? <Field label={`Valor (${unit})`}><input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field> : <div />}
        <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {row && <p className="text-xs text-mute sm:col-span-2">Indicações até hoje: {row.volume} · {fmtBRL(row.revenue)}. Ganho acumulado: {ambassadorEarning({ id: cid, deal, value: Number(value.replace(',', '.')) || 0 }, row)}.</p>}
        {err && <p className="text-sm text-bad sm:col-span-2">{err}</p>}
      </div>
    </Modal>
  );
}
