'use client';
// Recall (winning back): ex-alunas para chamar de novo, na data certa e com a mensagem certa para o motivo da saída.
import { useMemo, useState } from 'react';
import { useWriter } from '@/lib/db';
import { download, useClients } from '@/lib/hooks';
import { addDays, fmtBRL, fmtDate, toCSV, todayISO } from '@/lib/calc';
import { CHURN_REASONS, recallList, recallMessage, type RClient, type RecallRow } from '@/lib/retention';
import type { Client } from '@/lib/types';
import { Badge, Button, Empty, Modal, PageHeader, Spinner, Stat, Tabs } from '@/components/ui';
import { SaleForm } from '@/components/SaleForm';
import { OutcomeModal } from '@/components/OutcomeModal';
import { ClientModal } from '@/components/ClientModal';

type Tab = 'hoje' | 'agendadas' | 'semdata' | 'naochamar';

const wa = (c: RClient, text: string) => {
  const d = (c.phone ?? '').replace(/\D/g, '');
  return d ? `https://wa.me/${d.length <= 11 ? '55' + d : d}?text=${encodeURIComponent(text)}` : null;
};

export default function RecallPage() {
  const today = todayISO();
  const clients = useClients();
  const w = useWriter();
  const [tab, setTab] = useState<Tab>('hoje');
  const [q, setQ] = useState('');
  const [contact, setContact] = useState<RClient | null>(null);
  const [back, setBack] = useState<RClient | null>(null);
  const [decide, setDecide] = useState<RClient | null>(null);
  const [open, setOpen] = useState<RClient | null>(null);

  const all = clients.data as RClient[];
  const list = useMemo(() => recallList(all, today), [all, today]);
  const optedOut = useMemo(() => all.filter((c) => !c.deleted && c.status !== 'ativo' && c.recall?.optOut), [all]);
  const hoje = list.filter((r) => r.due);
  const agendadas = list.filter((r) => r.nextAt && !r.due);
  const semData = list.filter((r) => !r.nextAt);
  const in30 = agendadas.filter((r) => r.nextAt! <= addDays(today, 30)).length;
  const s = q.trim().toLowerCase();
  const rows: RecallRow[] = (tab === 'hoje' ? hoje : tab === 'agendadas' ? agendadas : tab === 'semdata' ? semData
    : optedOut.map((c) => ({ client: c, attempts: c.recall?.attempts ?? 0, due: false, leftAt: c.endDate })))
    .filter((r) => !s || r.client.name.toLowerCase().includes(s) || (r.client.email ?? '').includes(s));
  const live = (c: RClient) => (clients.byId[c.id] as RClient) ?? c;

  function exportCSV() {
    const src = tab === 'naochamar' ? [] : rows;
    const csv = toCSV([
      ['Nome', 'Telefone', 'E-mail', 'Saiu em', 'Motivo', 'Próximo contato', 'Mensagem'],
      ...src.map((r) => [r.client.name, (r.client.phone ?? '').replace(/\D/g, ''), r.client.email ?? '', r.leftAt ?? '', r.reason ? CHURN_REASONS[r.reason].label : '', r.nextAt ?? '', recallMessage(r.client.name.split(' ')[0], r.reason)]),
    ]);
    download(`recall-${tab}-${today}.csv`, csv);
  }

  return (
    <div>
      <PageHeader title="Recall de ex-alunas" subtitle="Quem saiu, por quê, e quando chamar de novo. Quem volta entra como venda do canal Winning Back."
        actions={<Button variant="outline" onClick={exportCSV} disabled={tab === 'naochamar' || !rows.length}>Exportar lista (Waspeed)</Button>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Para chamar hoje" value={hoje.length} tone={hoje.length ? 'bad' : undefined} sub="data de recall chegou" />
        <Stat label="Próximos 30 dias" value={in30} />
        <Stat label="Sem data" value={semData.length} sub="defina quando chamar" />
        <Stat label="Ex-alunas" value={list.length + optedOut.length} sub={`${optedOut.length} pediram para não chamar`} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'hoje', label: `Chamar agora (${hoje.length})` },
        { id: 'agendadas', label: `Agendadas (${agendadas.length})` },
        { id: 'semdata', label: `Sem data (${semData.length})` },
        { id: 'naochamar', label: `Não chamar (${optedOut.length})` },
      ]} />
      <input className="input mb-4 max-w-sm" placeholder="Pesquisar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />

      {clients.loading ? <Spinner /> : rows.length === 0 ? (
        <Empty title={tab === 'hoje' ? 'Ninguém para chamar hoje' : tab === 'semdata' ? 'Todas as ex-alunas têm data de recall' : 'Nada por aqui'}
          text={tab === 'semdata' ? undefined : 'Ao registrar que uma aluna não renovou, ela entra aqui na data sugerida pelo motivo.'} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">Ex-aluna</th><th className="th">Saiu em</th><th className="th">Motivo</th><th className="th">Contatos</th><th className="th">Próximo</th><th className="th" /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const c = r.client;
                const link = wa(c, recallMessage(c.name.split(' ')[0], r.reason));
                return (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="td"><button className="text-left font-medium hover:underline" onClick={() => setOpen(c)}>{c.name}</button><div className="text-xs text-mute">{c.planName} · {fmtBRL(c.lastValue ?? 0)}</div></td>
                    <td className="td">{fmtDate(r.leftAt)}</td>
                    <td className="td text-sm">{r.reason ? CHURN_REASONS[r.reason].label : <span className="text-mute">sem motivo</span>}{c.outcome?.status === 'pausa' && <div><Badge tone="warn">Pausa</Badge></div>}</td>
                    <td className="td text-sm">{r.attempts}{c.recall?.lastAt && <div className="text-xs text-mute">último {fmtDate(c.recall.lastAt)}</div>}</td>
                    <td className="td">{r.nextAt ? <>{fmtDate(r.nextAt)}{r.due && <div><Badge tone="bad">Chamar</Badge></div>}</> : <span className="text-xs text-mute">—</span>}</td>
                    <td className="td"><div className="flex flex-wrap justify-end gap-2">
                      {tab !== 'naochamar' && link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-xs hover:border-gold/60">WhatsApp</a>}
                      {tab !== 'naochamar' && <Button size="sm" variant="outline" onClick={() => setContact(c)}>Registrar contato</Button>}
                      <Button size="sm" onClick={() => setBack(c)}>Voltou</Button>
                      {tab === 'naochamar'
                        ? <Button size="sm" variant="ghost" onClick={() => w.update<Client>('clients', c.id, { recall: { attempts: c.recall?.attempts ?? 0, ...(c.recall?.lastAt ? { lastAt: c.recall.lastAt } : {}) } }, `Recall reativado: ${c.name}`)}>Voltar a chamar</Button>
                        : <Button size="sm" variant="ghost" onClick={() => setDecide(c)}>{c.outcome?.reason ? 'Motivo' : 'Registrar motivo'}</Button>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-mute">A mensagem do WhatsApp muda conforme o motivo da saída. "Exportar lista" gera um CSV com nome, telefone e mensagem para subir no Waspeed.</p>

      {contact && <ContactModal client={live(contact)} onClose={() => setContact(null)} />}
      {back && <SaleForm open onClose={() => setBack(null)} client={live(back)} initialKind="nova" initialChannelId="winning-back" />}
      {decide && live(decide).endDate && <OutcomeModal client={live(decide)} onClose={() => setDecide(null)} />}
      <ClientModal open={!!open} onClose={() => setOpen(null)} client={open ? live(open) : undefined} />
    </div>
  );
}

function ContactModal({ client, onClose }: { client: RClient; onClose: () => void }) {
  const w = useWriter();
  const today = todayISO();
  const [result, setResult] = useState<'sem_resposta' | 'conversou' | 'nao_quer'>('sem_resposta');
  const [next, setNext] = useState(addDays(today, 30));
  const [note, setNote] = useState('');
  async function save() {
    const prev = client.recall ?? { attempts: 0 };
    const notes = [prev.notes, note.trim() && `${fmtDate(today)}: ${note.trim()}`].filter(Boolean).join('\n') || undefined;
    const recall = result === 'nao_quer'
      ? { attempts: prev.attempts + 1, lastAt: today, optOut: true, ...(notes ? { notes } : {}) }
      : { attempts: prev.attempts + 1, lastAt: today, nextAt: next, ...(notes ? { notes } : {}) };
    await w.update<Client>('clients', client.id, { recall }, `Recall: contato com ${client.name} (${result === 'nao_quer' ? 'pediu para não chamar' : result === 'conversou' ? 'conversou' : 'sem resposta'})`);
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={`Contato com ${client.name}`} subtitle={`Tentativa nº ${(client.recall?.attempts ?? 0) + 1}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar contato</Button></>}>
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {([['sem_resposta', 'Sem resposta'], ['conversou', 'Conversou, ainda não voltou'], ['nao_quer', 'Pediu para não chamar']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => { setResult(id); setNext(addDays(today, id === 'sem_resposta' ? 15 : 30)); }}
              className={`rounded-lg border p-2.5 text-left text-sm ${result === id ? 'border-gold bg-gold/10' : 'border-line hover:border-gold/50'}`}>{label}</button>
          ))}
        </div>
        {result !== 'nao_quer' && <label className="block"><span className="label">Chamar de novo em</span><input type="date" className="input" value={next} onChange={(e) => setNext(e.target.value)} /></label>}
        <label className="block"><span className="label">Observação</span><textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que ela respondeu…" /></label>
        {client.recall?.notes && <div className="whitespace-pre-line rounded-lg bg-line/30 p-2 text-xs text-mute">{client.recall.notes}</div>}
      </div>
    </Modal>
  );
}
