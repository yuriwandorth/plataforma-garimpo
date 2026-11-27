'use client';
import { useMemo, useState } from 'react';
import { useCollection, useSalesSince, useWriter } from '@/lib/db';
import { useClients } from '@/lib/hooks';
import { addMonths, fmtBRL, fmtDate, fmtPct, iso, parts, todayISO } from '@/lib/calc';
import { ambassadorEarning, ambassadorRanking, DEAL_LABEL, opportunityQuadrant, referralRadar, type Ambassador, type AmbassadorDeal, type AmbassadorRow } from '@/lib/growth';
import { Badge, Button, Card, cx, Empty, Field, Modal, PageHeader, Spinner, Stat, Tabs } from '@/components/ui';
import { MonthPicker } from '@/components/MonthPicker';

const LEVEL_TONE = { Ouro: 'gold', Prata: 'mute', Bronze: 'warn' } as const;

export default function EmbaixadorasPage() {
  const t = parts(todayISO());
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const [period, setPeriod] = useState<'mes' | 'tudo'>('mes');
  const [metric, setMetric] = useState<'volume' | 'receita'>('volume');
  const [tab, setTab] = useState<'ranking' | 'radar'>('ranking');
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

  return (
    <div>
      <PageHeader title="Embaixadoras" subtitle="Alunas que indicam: ranking, recompensa combinada e radar de indicações. Uma indicação é uma venda nova com “indicado por” preenchido."
        actions={period === 'mes' || tab === 'radar' ? <MonthPicker y={ym.y} m={ym.m} onChange={(y, m) => setYm({ y, m })} /> : undefined} />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'ranking', label: 'Embaixadoras' }, { id: 'radar', label: 'Radar de indicações' }]} />
      {sales.loading || clients.loading ? <Spinner /> : tab === 'ranking' ? (
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
                        <td className="td"><Button size="sm" variant="ghost" onClick={() => setNeg(r)}>Editar negociação</Button></td>
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
