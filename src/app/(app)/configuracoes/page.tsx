'use client';
import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSession } from '@/lib/auth';
import { useWriter } from '@/lib/db';
import { useChannels } from '@/lib/hooks';
import { clearSeed, loadSeed } from '@/lib/seed';
import { channelKind, fmtBRL, parseMoney } from '@/lib/calc';
import { Badge, Button, Card, Field, PageHeader } from '@/components/ui';

export default function ConfiguracoesPage() {
  const { profile, tenant, user } = useSession();
  const channels = useChannels();
  const w = useWriter();
  const [name, setName] = useState('');
  const [mStart, setMStart] = useState('');
  const [mList, setMList] = useState('');
  const [handle, setHandle] = useState('');
  const [whats, setWhats] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    setName(tenant.name);
    setMStart(tenant.milestonesStart ?? '');
    setMList((tenant.milestones ?? []).map((v) => fmtBRL(v).replace('R$', '').trim()).join('; '));
    setHandle(tenant.infinitePayHandle ?? '');
    setWhats(tenant.whatsapp ?? '');
  }, [tenant]);

  if (profile?.role !== 'owner' || !tenant) return <p className="text-sm text-mute">Só o(a) dono(a) altera as configurações.</p>;

  async function saveTenant() {
    const milestones = mList.split(';').map((s) => parseMoney(s.trim())).filter((v) => v > 0).sort((a, b) => a - b);
    await updateDoc(doc(db, 'tenants', tenant!.id), { name: name.trim() || tenant!.name, milestonesStart: mStart, milestones, infinitePayHandle: handle.replace(/^\$/, '').trim(), whatsapp: whats.replace(/\D/g, '') });
    setMsg('Configurações salvas.');
  }

  async function addChannel() {
    const n = newChannel.trim();
    if (!n) return;
    const slug = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (channels.byId[slug]) return setMsg('Já existe um canal com esse nome.');
    await w.set('channels', slug, { name: n, order: channels.data.length, active: true });
    setNewChannel('');
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Configurações" subtitle="Dados da consultoria, checkout, canais de venda e conquistas." />
      <div className="space-y-4">
        <Card title="Consultoria">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da consultoria" className="sm:col-span-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Conquistas: contar faturamento a partir de"><input className="input" type="date" value={mStart} onChange={(e) => setMStart(e.target.value)} /></Field>
            <Field label="Marcos de faturamento (R$, separados por ;)" hint="Ex.: 50.000; 100.000; 500.000; 1.000.000"><input className="input" value={mList} onChange={(e) => setMList(e.target.value)} /></Field>
            <Field label="InfiniteTag da InfinitePay" hint="Seu usuário no app InfinitePay, sem o $. Usado no checkout."><input className="input" placeholder="ex.: metodogarimpo" value={handle} onChange={(e) => setHandle(e.target.value)} /></Field>
            <Field label="WhatsApp da consultoria" hint="Aparece no botão da página de obrigado do checkout."><input className="input" placeholder="(81) 99999-9999" value={whats} onChange={(e) => setWhats(e.target.value)} /></Field>
          </div>
          <div className="mt-4 flex items-center gap-3"><Button onClick={saveTenant}>Salvar</Button>{msg && <span className="text-sm text-good">{msg}</span>}</div>
        </Card>

        <Card title="Importar dados">
          <p className="text-sm text-mute">Suba uma planilha (.xlsx ou .csv) com clientes e vendas ou com influencers. Confere antes de gravar e não duplica o que já existe.</p>
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/importar/`} className="mt-3 inline-flex rounded-lg border border-line px-3.5 py-2 text-sm hover:border-gold/60">Abrir importação</a>
        </Card>

        <Card title="Canais de venda">
          <p className="mb-3 text-sm text-mute">Desativar um canal tira ele das metas e da escolha em novas vendas; o histórico continua. Clique no tipo para alternar entre hunter (traz cliente nova) e farmer (retém quem já é cliente).</p>
          <ul className="mb-3 divide-y divide-line">
            {channels.data.map((c, i) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-sm">{c.name} {!c.active && <Badge>inativo</Badge>}</span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" disabled={i === 0} onClick={async () => {
                    const prev = channels.data[i - 1];
                    // troca de posição com o de cima
                    await w.set('channels', c.id, { order: i - 1 }); await w.set('channels', prev.id, { order: i });
                  }}>↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    const n = prompt('Novo nome do canal', c.name); if (n?.trim()) w.set('channels', c.id, { name: n.trim() });
                  }}>Renomear</Button>
                  <Button size="sm" variant="ghost" onClick={() => w.set('channels', c.id, { kind: channelKind(c, c.id) === 'hunter' ? 'farmer' : 'hunter' })}>
                    {channelKind(c, c.id) === 'hunter' ? 'Hunter (aquisição)' : 'Farmer (retenção)'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => w.set('channels', c.id, { active: !c.active })}>{c.active ? 'Desativar' : 'Ativar'}</Button>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className="input" placeholder="Novo canal (ex.: Comunidade Mamães Garimpeiras)" value={newChannel} onChange={(e) => setNewChannel(e.target.value)} />
            <Button variant="outline" onClick={addChannel}>Adicionar</Button>
          </div>
        </Card>

        <Card title="Dados de exemplo">
          <p className="mb-3 text-sm text-mute">
            Cria 3 produtos, 9 planos, 60 clientes fictícios e cerca de 12 meses de vendas para você testar telas e números.
            Tudo fica marcado como exemplo e sai com um clique, sem tocar nos seus dados reais.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={async () => {
              setBusy(true); setMsg('');
              try { const n = await loadSeed(tenant.id, user!.uid); setMsg(`${n} registros de exemplo criados.`); } catch (e) { console.error(e); setMsg('Falhou ao criar os exemplos.'); }
              setBusy(false);
            }}>Carregar dados de exemplo</Button>
            <Button variant="danger" disabled={busy} onClick={async () => {
              if (!confirm('Apagar todos os dados de exemplo? Seus dados reais não são tocados.')) return;
              setBusy(true);
              try { const n = await clearSeed(tenant.id); setMsg(`${n} registros de exemplo apagados.`); } catch (e) { console.error(e); setMsg('Falhou ao apagar.'); }
              setBusy(false);
            }}>Apagar dados de exemplo</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
