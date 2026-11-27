'use client';
import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSession } from '@/lib/auth';
import { useWriter } from '@/lib/db';
import { useMembers } from '@/lib/hooks';
import { fmtDate } from '@/lib/calc';
import type { Invite, Member } from '@/lib/types';
import { Badge, Button, Card, Field, Modal, PageHeader, Spinner, Toggle } from '@/components/ui';

export default function TimePage() {
  const { profile, tenant, user } = useSession();
  const members = useMembers();
  const w = useWriter();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Member | null>(null);
  const [f, setF] = useState({ name: '', email: '', cargo: '', isSeller: false });
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!profile) return;
    return onSnapshot(query(collection(db, 'invites'), where('tenantId', '==', profile.tenantId)),
      (s) => setInvites(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Invite)), () => setInvites([]));
  }, [profile]);

  if (profile?.role !== 'owner') return <p className="text-sm text-mute">Só o(a) dono(a) da consultoria gerencia o time.</p>;

  async function invite() {
    setErr('');
    const email = f.email.trim().toLowerCase();
    if (!f.name.trim() || !email.includes('@')) return setErr('Preencha nome e e-mail.');
    if (members.data.some((m) => m.email.toLowerCase() === email)) return setErr('Essa pessoa já está no time.');
    await setDoc(doc(db, 'invites', email), {
      tenantId: profile!.tenantId, tenantName: tenant?.name ?? '', name: f.name.trim(), role: 'staff',
      cargo: f.cargo.trim(), isSeller: f.isSeller, createdAt: Date.now(),
    });
    setOpen(false); setF({ name: '', email: '', cargo: '', isSeller: false });
  }

  return (
    <div>
      <PageHeader title="Time" subtitle="Quem trabalha com você. Cada pessoa entra com o próprio login e vê só esta consultoria."
        actions={<Button onClick={() => setOpen(true)}>Convidar pessoa</Button>} />
      {members.loading ? <Spinner /> : (
        <Card className="mb-6">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">Nome</th><th className="th">Cargo</th><th className="th">Acesso</th><th className="th">Desde</th><th className="th">Situação</th><th className="th" /></tr></thead>
            <tbody>
              {members.data.map((m) => (
                <tr key={m.id} className="border-b border-line/60">
                  <td className="td font-medium">{m.name}<div className="text-xs text-mute">{m.email}</div></td>
                  <td className="td">{m.cargo || '—'} {m.isSeller && <Badge tone="gold">vendedor</Badge>}</td>
                  <td className="td">{m.role === 'owner' ? 'Dono(a)' : 'Time'}</td>
                  <td className="td text-mute">{fmtDate(m.joinedAt)}</td>
                  <td className="td"><Badge tone={m.active ? 'good' : 'mute'}>{m.active ? 'Ativo' : 'Desligado'}</Badge></td>
                  <td className="td text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(m)}>Editar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {invites.length > 0 && (
        <Card title="Convites pendentes">
          <p className="mb-3 text-sm text-mute">A pessoa cria a conta em <b>/login</b> com este mesmo e-mail e aceita o convite.</p>
          <ul className="divide-y divide-line">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                <span>{i.name} · {i.id} {i.cargo && <span className="text-mute">· {i.cargo}</span>}</span>
                <Button size="sm" variant="ghost" onClick={() => deleteDoc(doc(db, 'invites', i.id))}>Cancelar</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Convidar para o time" subtitle="Não gera cobrança. A pessoa entra com o próprio e-mail."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={invite}>Criar convite</Button></>}>
        <div className="space-y-3">
          <Field label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Cargo"><input className="input" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} placeholder="Ex.: Customer Success, Vendedora" /></Field>
          <Toggle checked={f.isSeller} onChange={(v) => setF({ ...f, isSeller: v })} label="Atua como vendedor(a)" hint="Aparece na atribuição de vendas e nos relatórios por vendedor." />
          {err && <p className="text-sm text-bad">{err}</p>}
        </div>
      </Modal>
      {edit && <EditMember m={edit} self={edit.id === user?.uid} onClose={() => setEdit(null)} save={(d, s) => w.update<Member>('members', edit.id, d, s)} />}
    </div>
  );
}

function EditMember({ m, self, onClose, save }: { m: Member; self: boolean; onClose: () => void; save: (d: Partial<Member>, s: string) => Promise<void> }) {
  const [f, setF] = useState({ name: m.name, cargo: m.cargo ?? '', isSeller: !!m.isSeller, active: m.active });
  return (
    <Modal open onClose={onClose} title={`Editar ${m.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={async () => { await save(f, `Membro editado: ${f.name}`); onClose(); }}>Salvar</Button></>}>
      <div className="space-y-3">
        <Field label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Cargo"><input className="input" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} /></Field>
        <Toggle checked={f.isSeller} onChange={(v) => setF({ ...f, isSeller: v })} label="Atua como vendedor(a)" />
        {!self && <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Ativo" hint="Desligar bloqueia o acesso na hora, sem apagar o histórico." />}
      </div>
    </Modal>
  );
}
