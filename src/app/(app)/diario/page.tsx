'use client';
import { useState } from 'react';
import { useCollection, useWriter } from '@/lib/db';
import { fmtDate, MONTHS, parts, todayISO } from '@/lib/calc';
import type { JournalEntry } from '@/lib/manage';
import { useSession } from '@/lib/auth';
import { Button, Card, Field, PageHeader, Spinner } from '@/components/ui';

export default function DiarioPage() {
  const { profile } = useSession();
  const entries = useCollection<JournalEntry>('journal');
  const w = useWriter();
  const [f, setF] = useState({ title: '', date: todayISO(), text: '' });
  if (profile?.role !== 'owner') return <p className="text-sm text-mute">O diário é só do(a) dono(a).</p>;
  const list = [...entries.data].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  const groups = list.reduce<Record<string, JournalEntry[]>>((g, e) => { const k = e.date.slice(0, 7); (g[k] ??= []).push(e); return g; }, {});

  return (
    <div className="max-w-3xl">
      <PageHeader title="Diário de aprendizados" subtitle="O que você aprende ao longo da jornada. Só você vê." />
      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field label="Título (opcional)"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Data"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        <Field label="Anotação" className="mt-3"><textarea className="input" rows={4} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Escreva um aprendizado, uma ideia ou algo que aconteceu…" /></Field>
        <div className="mt-3 flex justify-end"><Button disabled={!f.text.trim()} onClick={async () => {
          await w.create('journal', { title: f.title.trim() || undefined, date: f.date, text: f.text.trim() }, 'Anotação no diário');
          setF({ title: '', date: todayISO(), text: '' });
        }}>Adicionar</Button></div>
      </Card>
      {entries.loading ? <Spinner /> : list.length === 0 ? <p className="text-sm text-mute">Você ainda não tem anotações.</p> : Object.entries(groups).map(([k, items]) => {
        const p = parts(`${k}-01`);
        return (
          <div key={k} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">{MONTHS[p.m - 1]} {p.y}</h2>
            <div className="space-y-2">
              {items.map((e) => (
                <Card key={e.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div><div className="text-xs text-mute">{fmtDate(e.date)}</div>{e.title && <div className="font-medium">{e.title}</div>}</div>
                    <button className="text-xs text-mute hover:text-bad" onClick={() => { if (confirm('Apagar esta anotação?')) w.hardDelete('journal', e.id, 'Anotação apagada'); }}>apagar</button>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{e.text}</p>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
