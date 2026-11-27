'use client';
import { useMemo, useState } from 'react';
import { useClients } from '@/lib/hooks';
import { useWriter } from '@/lib/db';
import { daysBetween, fmtBRL, fmtDate, renewalsDue, todayISO } from '@/lib/calc';
import type { Client } from '@/lib/types';
import { Badge, Button, cx, Empty, PageHeader, Spinner } from '@/components/ui';
import { ClientModal } from '@/components/ClientModal';

const WINDOWS = [15, 30, 60, 90];

function whatsLink(c: Client) {
  const phone = (c.phone ?? '').replace(/\D/g, '');
  if (!phone) return null;
  const first = c.name.split(' ')[0];
  const txt = `Oi, ${first}! Seu plano ${c.planName ?? ''} vence em ${fmtDate(c.endDate)}. Bora conversar sobre a renovação?`;
  return `https://wa.me/${phone.length <= 11 ? '55' + phone : phone}?text=${encodeURIComponent(txt)}`;
}

export default function RenovacoesPage() {
  const clients = useClients();
  const w = useWriter();
  const [days, setDays] = useState(30);
  const [open, setOpen] = useState<Client | null>(null);
  const today = todayISO();
  const list = useMemo(() => renewalsDue(clients.data, today, days), [clients.data, today, days]);
  const total = list.reduce((a, c) => a + (c.lastValue ?? 0), 0);

  return (
    <div>
      <PageHeader title="Renovações" subtitle="Clientes ativos com plano vencendo (inclui vencidos há até 15 dias). A mensagem do WhatsApp é só um ponto de partida: personalize." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {WINDOWS.map((d) => (
          <button key={d} onClick={() => setDays(d)} className={cx('rounded-full border px-3 py-1 text-sm', days === d ? 'border-gold bg-gold/15' : 'border-line text-mute')}>
            Próximos {d} dias
          </button>
        ))}
        <span className="ml-auto text-sm text-mute">{list.length} cliente(s) · {fmtBRL(total)} em jogo (último valor pago)</span>
      </div>
      {clients.loading ? <Spinner /> : list.length === 0 ? <Empty title="Ninguém vencendo nessa janela" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">Cliente</th><th className="th">Plano</th><th className="th">Vencimento</th><th className="th">Último valor</th><th className="th">Contato</th><th className="th" /></tr></thead>
            <tbody>
              {list.map((c) => {
                const left = daysBetween(today, c.endDate!);
                const link = whatsLink(c);
                return (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="td"><button className="font-medium hover:underline" onClick={() => setOpen(c)}>{c.name}</button></td>
                    <td className="td">{c.planName}</td>
                    <td className="td">
                      {fmtDate(c.endDate)}{' '}
                      <Badge tone={left < 0 ? 'bad' : left <= 7 ? 'warn' : 'mute'}>{left < 0 ? `venceu há ${-left}d` : `em ${left}d`}</Badge>
                    </td>
                    <td className="td">{fmtBRL(c.lastValue ?? 0)}</td>
                    <td className="td text-mute">{c.renewalContactAt ? `contatado ${fmtDate(c.renewalContactAt)}` : 'sem contato'}</td>
                    <td className="td">
                      <div className="flex justify-end gap-2">
                        {link && <a href={link} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">WhatsApp</Button></a>}
                        <Button size="sm" variant="ghost" onClick={() => w.update<Client>('clients', c.id, { renewalContactAt: today }, `Contato de renovação: ${c.name}`)}>Marcar contatado</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ClientModal open={!!open} onClose={() => setOpen(null)} client={open ? clients.byId[open.id] ?? open : undefined} />
    </div>
  );
}
