'use client';
import { useMemo, useState } from 'react';
import { where } from 'firebase/firestore';
import { useCollection } from '@/lib/db';
import { useClients } from '@/lib/hooks';
import { fmtBRL, fmtDate, fmtPct, monthBounds, MONTHS, parts, todayISO } from '@/lib/calc';
import { CHURN_REASONS, GRACE_DAYS, OUTCOME_LABEL, renewalBoard, type BoardRow, type RClient } from '@/lib/retention';
import type { Sale } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Progress, Spinner, Stat, Tabs } from '@/components/ui';
import { MonthPicker } from '@/components/MonthPicker';
import { ClientModal } from '@/components/ClientModal';
import { SaleForm } from '@/components/SaleForm';
import { OutcomeModal } from '@/components/OutcomeModal';

type Tab = 'renovar' | 'negociando' | 'perdidas' | 'renovadas';

function whatsLink(c: RClient, text: string) {
  const phone = (c.phone ?? '').replace(/\D/g, '');
  if (!phone) return null;
  return `https://wa.me/${phone.length <= 11 ? '55' + phone : phone}?text=${encodeURIComponent(text)}`;
}

function DueBadge({ days }: { days: number }) {
  if (days < 0) return <Badge tone={-days > GRACE_DAYS ? 'bad' : 'warn'}>Vencido há {-days} dia{days === -1 ? '' : 's'}</Badge>;
  if (days === 0) return <Badge tone="warn">Vence hoje</Badge>;
  return <Badge tone={days <= 7 ? 'warn' : 'mute'}>Vence em {days} dia{days === 1 ? '' : 's'}</Badge>;
}

export default function RenovacoesPage() {
  const today = todayISO();
  const t = parts(today);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const { start, end } = monthBounds(ym.y, ym.m);
  const clients = useClients();
  const sales = useCollection<Sale>('sales', [where('date', '>=', start), where('date', '<=', end)], start);
  const [tab, setTab] = useState<Tab>('renovar');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<RClient | null>(null);
  const [renew, setRenew] = useState<RClient | null>(null);
  const [back, setBack] = useState<RClient | null>(null);
  const [decide, setDecide] = useState<RClient | null>(null);

  const all = clients.data as RClient[];
  const b = useMemo(() => renewalBoard(all, sales.data, ym.y, ym.m, today), [all, sales.data, ym, today]);
  const s = q.trim().toLowerCase();
  const match = (r: BoardRow) => !s || r.client.name.toLowerCase().includes(s) || (r.client.email ?? '').includes(s) || (r.client.planName ?? '').toLowerCase().includes(s);
  const monthName = `${MONTHS[ym.m - 1]} de ${ym.y}`;
  const pend = b.aVencer.length + b.semDecisao.length;
  const live = (c: RClient) => (clients.byId[c.id] as RClient) ?? c;

  const actions = (c: RClient, withDecide = true) => {
    const first = c.name.split(' ')[0];
    const vencido = c.endDate! < today;
    const link = whatsLink(c, `Oi, ${first}! Seu plano ${c.planName ?? ''} ${vencido ? 'venceu' : 'vence'} em ${fmtDate(c.endDate)}. Bora conversar sobre a renovação?`);
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-xs hover:border-gold/60">WhatsApp</a>}
        <Button size="sm" onClick={() => setRenew(c)}>Renovou</Button>
        {withDecide && <Button size="sm" variant="outline" onClick={() => setDecide(c)}>Registrar destino</Button>}
      </div>
    );
  };

  const nameCell = (c: RClient) => (
    <td className="td"><button className="text-left font-medium hover:underline" onClick={() => setOpen(c)}>{c.name}</button>
      <div className="text-xs text-mute">{c.planName} · {fmtBRL(c.lastValue ?? 0)}</div></td>
  );

  return (
    <div>
      <PageHeader title="Renovações" subtitle="Quem vence no mês e o destino de cada uma: renova, negocia, pausa ou sai."
        actions={<MonthPicker y={ym.y} m={ym.m} onChange={(y, m) => setYm({ y, m })} />} />
      <ErrorNote error={sales.error} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="A renovar" value={pend + b.negociando.length} sub={`${fmtBRL(b.receitaEmAberto)} em jogo`} />
        <Stat label="Renovadas" value={b.renovadas.length} sub={fmtBRL(b.renovadasValor)} tone="good" />
        <Stat label="Não renovaram" value={b.perdidas.length} sub={`${fmtBRL(b.receitaPerdida)} que saíram`} tone={b.perdidas.length ? 'bad' : undefined} />
        <Stat label="Taxa de renovação" value={fmtPct(b.taxaRenovacao)} sub="renovadas ÷ todas do mês" />
        <Stat label="Taxa de perda" value={fmtPct(b.taxaPerda)} sub="não renovaram ÷ todas do mês" />
      </div>

      {b.atrasadas.length > 0 && (
        <div className="mb-4 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm">
          <b>{b.atrasadas.length} aluna{b.atrasadas.length > 1 ? 's' : ''} venceu há mais de {GRACE_DAYS} dias sem destino:</b> {b.atrasadas.map((r) => r.client.name.split(' ')[0]).join(', ')}.
          Registre se renovou, está negociando, pausou ou saiu, para os números do mês ficarem certos.
        </div>
      )}

      <Tabs value={tab} onChange={setTab} items={[
        { id: 'renovar', label: `A renovar (${pend})` },
        { id: 'negociando', label: `Em negociação (${b.negociando.length})` },
        { id: 'perdidas', label: `Não renovaram (${b.perdidas.length})` },
        { id: 'renovadas', label: `Renovadas (${b.renovadas.length})` },
      ]} />
      <input className="input mb-4 max-w-sm" placeholder="Pesquisar por nome, e-mail ou plano" value={q} onChange={(e) => setQ(e.target.value)} />

      {clients.loading || sales.loading ? <Spinner /> : tab === 'renovar' ? (
        pend === 0 ? <Empty title={`Ninguém pendente em ${monthName}`} text="Quem vence no mês e ainda não tem destino aparece aqui." /> : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Aluna</th><th className="th">Vencimento</th><th className="th">Último contato</th><th className="th" /></tr></thead>
              <tbody>
                {[...b.semDecisao, ...b.aVencer].filter(match).map((r) => (
                  <tr key={r.client.id} className="border-b border-line/60">
                    {nameCell(r.client)}
                    <td className="td">{fmtDate(r.client.endDate)}<div><DueBadge days={r.daysLeft} /></div></td>
                    <td className="td text-xs text-mute">{r.client.renewalContactAt ? fmtDate(r.client.renewalContactAt) : '—'}</td>
                    <td className="td">{actions(r.client)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'negociando' ? (
        b.negociando.length === 0 ? <Empty title="Ninguém em negociação" text="Em 'Registrar destino', marque 'Em negociação' e a data do próximo contato." /> : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Aluna</th><th className="th">Vencimento</th><th className="th">Próximo contato</th><th className="th">Observação</th><th className="th" /></tr></thead>
              <tbody>
                {b.negociando.filter(match).map((r) => (
                  <tr key={r.client.id} className="border-b border-line/60">
                    {nameCell(r.client)}
                    <td className="td">{fmtDate(r.client.endDate)}<div><DueBadge days={r.daysLeft} /></div></td>
                    <td className="td">{fmtDate(r.outcome?.followUpAt)}{r.outcome?.followUpAt && r.outcome.followUpAt <= today && <div><Badge tone="warn">Chamar hoje</Badge></div>}</td>
                    <td className="td max-w-[16rem] text-xs text-mute">{r.outcome?.reason && <div>{CHURN_REASONS[r.outcome.reason].label}</div>}{r.outcome?.note}</td>
                    <td className="td">{actions(r.client)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'perdidas' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {b.perdidas.length === 0 ? <Empty title={`Ninguém saiu em ${monthName}`} /> : (
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-line"><th className="th">Aluna</th><th className="th">Venceu</th><th className="th">Destino</th><th className="th">Recall</th><th className="th" /></tr></thead>
                  <tbody>
                    {b.perdidas.filter(match).map((r) => {
                      const c = r.client;
                      return (
                        <tr key={c.id} className="border-b border-line/60">
                          {nameCell(c)}
                          <td className="td">{fmtDate(c.endDate)}</td>
                          <td className="td">
                            <Badge tone={r.outcome?.status === 'pausa' ? 'warn' : 'bad'}>{r.outcome ? OUTCOME_LABEL[r.outcome.status] : 'Inativa'}</Badge>
                            <div className="text-xs text-mute">{r.outcome?.reason ? CHURN_REASONS[r.outcome.reason].label : 'sem motivo registrado'}{r.outcome?.returnAt && ` · volta prevista ${fmtDate(r.outcome.returnAt)}`}</div>
                          </td>
                          <td className="td text-xs">{c.recall?.optOut ? <span className="text-mute">não chamar</span> : c.recall?.nextAt ? fmtDate(c.recall.nextAt) : <span className="text-mute">sem data</span>}</td>
                          <td className="td"><div className="flex flex-wrap justify-end gap-2">
                            <Button size="sm" onClick={() => setBack(c)}>Voltou</Button>
                            <Button size="sm" variant="outline" onClick={() => setDecide(c)}>{r.outcome ? 'Editar destino' : 'Registrar motivo'}</Button>
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <Card title="Por que saíram">
            {b.motivos.length === 0 ? <p className="text-sm text-mute">Sem saídas no mês.</p> : (
              <div className="space-y-3">
                {b.motivos.map((m) => (
                  <div key={m.key}>
                    <div className="mb-1 flex justify-between text-sm"><span>{m.label}</span><span className="text-mute">{m.n}</span></div>
                    <Progress value={m.n / b.perdidas.length} tone={m.key === 'sem_motivo' ? 'warn' : 'bad'} />
                  </div>
                ))}
                <p className="pt-1 text-xs text-mute">Ex-alunas entram na fila de <a className="text-gold hover:underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/recall/`}>Recall</a> na data sugerida pelo motivo.</p>
              </div>
            )}
          </Card>
        </div>
      ) : (
        b.renovadas.length === 0 ? <Empty title={`Nenhuma renovação lançada em ${monthName}`} /> : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Data</th><th className="th">Aluna</th><th className="th">Plano</th><th className="th">Novo vencimento</th><th className="th">Valor</th></tr></thead>
              <tbody>
                {b.renovadas.filter((x) => !s || x.clientName.toLowerCase().includes(s) || x.planName.toLowerCase().includes(s)).map((x) => (
                  <tr key={x.id} className="border-b border-line/60">
                    <td className="td">{fmtDate(x.date)}</td>
                    <td className="td font-medium">{x.clientName}</td>
                    <td className="td">{x.planName}{x.prevPlanName && x.prevPlanName !== x.planName && <div className="text-xs text-mute">antes: {x.prevPlanName}</div>}</td>
                    <td className="td">{fmtDate(x.endDate)}</td>
                    <td className="td">{fmtBRL(x.gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <ClientModal open={!!open} onClose={() => setOpen(null)} client={open ? live(open) : undefined} />
      {renew && <SaleForm open onClose={() => setRenew(null)} client={live(renew)} initialKind="renovacao" />}
      {back && <SaleForm open onClose={() => setBack(null)} client={live(back)} initialKind="nova" initialChannelId="winning-back" />}
      {decide && <OutcomeModal client={live(decide)} onClose={() => setDecide(null)} />}
    </div>
  );
}
