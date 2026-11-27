'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCollection, useSalesSince, useWriter } from '@/lib/db';
import { useChannels } from '@/lib/hooks';
import { addDays, addMonths, countable, fmtBRL, fmtDate, fmtPct, iso, parseMoney, parts, todayISO } from '@/lib/calc';
import { DEFAULT_TACTICS, OCCASIONS, TACTICS, type Campaign } from '@/lib/growth';
import { Badge, Button, Card, cx, Empty, Field, Modal, PageHeader, Progress, Spinner } from '@/components/ui';

const ORDER = ['renovacao', 'winning-back', 'indicacao', 'organico', 'social-selling', 'influencer'];
const STATUS_TONE = { rascunho: 'mute', ativa: 'good', encerrada: 'gold' } as const;

export default function CampanhasPage() {
  const camps = useCollection<Campaign>('campaigns');
  const t = parts(todayISO());
  const sales = useSalesSince(addMonths(iso(t.y, t.m, 1), -12));
  const [open, setOpen] = useState(false);
  const list = [...camps.data].sort((a, b) => (a.start < b.start ? 1 : -1));
  return (
    <div>
      <PageHeader title="Campanhas" subtitle="Campanhas sazonais com oferta, meta por canal e plano de ação. O realizado vem das vendas do período."
        actions={<Button onClick={() => setOpen(true)}>Nova campanha</Button>} />
      {camps.loading ? <Spinner /> : list.length === 0 ? (
        <Empty title="Nenhuma campanha ainda" text="Escolha uma data que já converte bem (Black Friday, Ano Novo, Dia das Mães…) e monte o plano por canal." action={<Button onClick={() => setOpen(true)}>Nova campanha</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((c) => {
            const goal = c.channels.reduce((a, x) => a + x.goalRevenue, 0);
            const done = sales.data.filter((s) => countable(s) && s.date >= c.start && s.date <= c.end && c.channels.some((x) => x.channelId === s.channelId)).reduce((a, s) => a + s.gross, 0);
            return (
              <Link key={c.id} href={`/campanhas/editar/?id=${c.id}`} className="card block p-4 hover:border-gold">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{c.name}</div><div className="text-xs text-mute">{c.occasion} · {fmtDate(c.start)} → {fmtDate(c.end)}</div></div>
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                </div>
                {c.offer && <p className="mt-2 line-clamp-2 text-sm text-mute">{c.offer}</p>}
                <div className="mt-3 text-sm">{fmtBRL(done)} <span className="text-mute">/ {fmtBRL(goal)} · {fmtPct(goal ? done / goal : 0)}</span></div>
                <div className="mt-1"><Progress value={goal ? done / goal : 0} tone={goal && done >= goal ? 'good' : 'gold'} /></div>
              </Link>
            );
          })}
        </div>
      )}
      <NewCampaign open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewCampaign({ open, onClose }: { open: boolean; onClose: () => void }) {
  const channels = useChannels();
  const w = useWriter();
  const router = useRouter();
  const today = todayISO();
  const [occ, setOcc] = useState(OCCASIONS[0].name);
  const [name, setName] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 7));
  const [goal, setGoal] = useState('');
  const active = useMemo(() => [...channels.active].sort((a, b) => (ORDER.indexOf(a.id) + 99) % 99 - (ORDER.indexOf(b.id) + 99) % 99), [channels.active]);

  async function create() {
    const total = parseMoney(goal);
    const each = active.length ? Math.round(total / active.length) : 0;
    const data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'> = {
      name: name.trim() || `${occ} d'O Garimpo`, occasion: occ, start, end, status: 'rascunho', offer: '', prices: [],
      // o último canal fica com o resto, para a soma bater com a meta total
      channels: active.map((c, k) => ({ channelId: c.id, why: '', goalRevenue: k === active.length - 1 ? total - each * (active.length - 1) : each, goalSales: 0, tactics: (TACTICS[c.id] ?? DEFAULT_TACTICS).map((x) => ({ ...x, worked: null })), triggered: false })),
      result: null,
    };
    const id = await w.create('campaigns', data, `Campanha criada: ${data.name}`);
    onClose();
    router.push(`/campanhas/editar/?id=${id}`);
  }

  return (
    <Modal open={open} onClose={onClose} wide title="Nova campanha" subtitle="Escolha a data. Os canais ativos entram com táticas sugeridas, que você edita depois."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={create}>Criar campanha</Button></>}>
      <div className="grid gap-2 sm:grid-cols-2">
        {OCCASIONS.map((o) => (
          <button key={o.name} onClick={() => setOcc(o.name)} className={cx('rounded-lg border p-3 text-left', occ === o.name ? 'border-gold bg-gold/10' : 'border-line hover:border-gold/50')}>
            <div className="text-sm font-medium">{o.name}</div><div className="text-xs text-mute">{o.hint}</div>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Field label="Nome" className="sm:col-span-4"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${occ} d'O Garimpo`} /></Field>
        <Field label="Início"><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Fim"><input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Meta total (R$)" className="sm:col-span-2" hint="Dividida igualmente entre os canais; ajuste depois."><input className="input" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="19.000" /></Field>
      </div>
    </Modal>
  );
}
