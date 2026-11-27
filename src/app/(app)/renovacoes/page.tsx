'use client';
import { useMemo, useState } from 'react';
import { where } from 'firebase/firestore';
import { useCollection } from '@/lib/db';
import { useClients } from '@/lib/hooks';
import { daysBetween, fmtBRL, fmtDate, fmtPct, monthBounds, MONTHS, parts, renewalMonth, todayISO } from '@/lib/calc';
import type { Client, Sale } from '@/lib/types';
import { Badge, Button, Empty, ErrorNote, PageHeader, Spinner, Stat, Tabs } from '@/components/ui';
import { MonthPicker } from '@/components/MonthPicker';
import { ClientModal } from '@/components/ClientModal';
import { SaleForm } from '@/components/SaleForm';

function whatsLink(c: Client, text: string) {
  const phone = (c.phone ?? '').replace(/\D/g, '');
  if (!phone) return null;
  return `https://wa.me/${phone.length <= 11 ? '55' + phone : phone}?text=${encodeURIComponent(text)}`;
}

export default function RenovacoesPage() {
  const today = todayISO();
  const t = parts(today);
  const [ym, setYm] = useState({ y: t.y, m: t.m });
  const { start, end } = monthBounds(ym.y, ym.m);
  const clients = useClients();
  const sales = useCollection<Sale>('sales', [where('date', '>=', start), where('date', '<=', end)], start);
  const [tab, setTab] = useState<'renovar' | 'renovadas'>('renovar');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Client | null>(null);
  const [renew, setRenew] = useState<Client | null>(null);
  const [copied, setCopied] = useState('');

  const r = useMemo(() => renewalMonth(clients.data, sales.data, ym.y, ym.m, today), [clients.data, sales.data, ym, today]);
  const s = q.trim().toLowerCase();
  const toRenew = r.toRenew.filter((c) => !s || c.name.toLowerCase().includes(s) || (c.email ?? '').includes(s) || (c.planName ?? '').toLowerCase().includes(s));
  const renewed = r.renewed.filter((x) => !s || x.clientName.toLowerCase().includes(s) || x.planName.toLowerCase().includes(s));
  const monthName = `${MONTHS[ym.m - 1]} de ${ym.y}`;

  return (
    <div>
      <PageHeader title="Renovações" subtitle="Estimativa e realizado de renovações por mês."
        actions={<MonthPicker y={ym.y} m={ym.m} onChange={(y, m) => setYm({ y, m })} />} />
      <ErrorNote error={sales.error} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="A renovar" value={r.toRenew.length} sub={`clientes que vencem em ${MONTHS[ym.m - 1].toLowerCase()}`} />
        <Stat label="Renovações realizadas" value={r.renewed.length} sub={fmtBRL(r.renewedValue)} />
        <Stat label="Receita estimada" value={fmtBRL(r.estimatedRevenue)} sub="soma do último valor de quem vence no mês" />
        <Stat label="Vencidos" value={r.overdue} sub="ainda sem renovação e já vencidos" tone={r.overdue ? 'bad' : undefined} />
        <Stat label="Taxa de renovação" value={fmtPct(r.rate)} sub="renovadas ÷ (renovadas + a renovar)" />
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { id: 'renovar', label: `A renovar (${r.toRenew.length})` },
        { id: 'renovadas', label: `Renovações realizadas (${r.renewed.length})` },
      ]} />
      <input className="input mb-4 max-w-sm" placeholder="Pesquisar por nome, e-mail ou plano" value={q} onChange={(e) => setQ(e.target.value)} />

      {clients.loading || sales.loading ? <Spinner /> : tab === 'renovar' ? (
        toRenew.length === 0 ? <Empty title={`Ninguém a renovar em ${monthName}`} text="Clientes ativas que vencem no mês e ainda não renovaram aparecem aqui." /> : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Cliente</th><th className="th">Plano</th><th className="th">Vencimento</th><th className="th">Valor</th><th className="th">Contato</th><th className="th" /></tr></thead>
              <tbody>
                {toRenew.map((c) => {
                  const left = daysBetween(today, c.endDate!);
                  const first = c.name.split(' ')[0];
                  const link = whatsLink(c, `Oi, ${first}! Seu plano ${c.planName ?? ''} ${left < 0 ? 'venceu' : 'vence'} em ${fmtDate(c.endDate)}. Bora conversar sobre a renovação?`);
                  return (
                    <tr key={c.id} className="border-b border-line/60">
                      <td className="td"><button className="font-medium hover:underline" onClick={() => setOpen(c)}>{c.name}</button>
                        {c.renewalContactAt && <div className="text-xs text-mute">contatado em {fmtDate(c.renewalContactAt)}</div>}</td>
                      <td className="td">{c.planName}</td>
                      <td className="td">{fmtDate(c.endDate)}<div><Badge tone={left < 0 ? 'bad' : left <= 7 ? 'warn' : 'mute'}>{left < 0 ? `Vencido há ${-left} dia${-left === 1 ? '' : 's'}` : left === 0 ? 'Vence hoje' : `Vence em ${left} dia${left === 1 ? '' : 's'}`}</Badge></div></td>
                      <td className="td">{fmtBRL(c.lastValue ?? 0)}</td>
                      <td className="td text-xs">
                        {link ? <a href={link} target="_blank" rel="noreferrer" className="text-gold hover:underline">Enviar mensagem</a> : <span className="text-mute">Sem telefone</span>}
                        {c.email && <div><button className="text-mute hover:text-ink" onClick={async () => { await navigator.clipboard.writeText(c.email!); setCopied(c.id); setTimeout(() => setCopied(''), 1500); }}>{copied === c.id ? 'E-mail copiado' : c.email}</button></div>}
                      </td>
                      <td className="td"><Button size="sm" onClick={() => setRenew(c)}>Marcar renovado</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        renewed.length === 0 ? <Empty title={`Nenhuma renovação lançada em ${monthName}`} /> : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Data</th><th className="th">Cliente</th><th className="th">Plano</th><th className="th">Novo vencimento</th><th className="th">Valor</th></tr></thead>
              <tbody>
                {renewed.map((x) => (
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
      <ClientModal open={!!open} onClose={() => setOpen(null)} client={open ? clients.byId[open.id] ?? open : undefined} />
      {renew && <SaleForm open onClose={() => setRenew(null)} client={clients.byId[renew.id] ?? renew} initialKind="renovacao" />}
    </div>
  );
}
