'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCollection, useWriter } from '@/lib/db';
import { fmtDate, todayISO } from '@/lib/calc';
import { INPUT_LABEL, type KnowledgeInput, type KnowledgeSector } from '@/lib/manage';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner } from '@/components/ui';
import { HowTo } from '@/components/HowTo';
import { KNOWLEDGE_TEMPLATES } from '@/lib/knowledgeTemplates';

export default function Page() { return <Suspense fallback={<Spinner />}><Knowledge /></Suspense>; }

function Knowledge() {
  const id = useSearchParams().get('setor');
  const sectors = useCollection<KnowledgeSector>('knowledge');
  const w = useWriter();
  const [newSector, setNewSector] = useState(false);
  const [applying, setApplying] = useState(false);
  const list = [...sectors.data].sort((a, b) => a.order - b.order);
  const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const missing = KNOWLEDGE_TEMPLATES.filter((t) => !list.some((s) => norm(s.name) === norm(t.name) && s.content));
  async function applyTemplates() {
    setApplying(true);
    for (const [i, t] of KNOWLEDGE_TEMPLATES.entries()) {
      const ex = list.find((s) => norm(s.name) === norm(t.name));
      if (ex && ex.content) continue;
      if (ex) await w.update<KnowledgeSector>('knowledge', ex.id, { content: t.content, description: ex.description || t.description }, `Base padrão aplicada: ${t.name}`);
      else await w.create('knowledge', { name: t.name, description: t.description, order: list.length + i, content: t.content, inputs: [] }, `Setor criado com base padrão: ${t.name}`);
    }
    setApplying(false);
  }
  if (sectors.loading) return <Spinner />;
  const current = id ? list.find((s) => s.id === id) : null;
  if (id && current) return <SectorView s={current} />;

  return (
    <div>
      <PageHeader title="Base de conhecimento" subtitle="O manual da empresa, por setor. Junte transcrições de call, anotações e processos e organize num documento para repassar ao time."
        actions={<><Button variant="outline" onClick={() => setNewSector(true)}>Novo setor</Button>{missing.length > 0 && <Button onClick={applyTemplates} disabled={applying}>{applying ? 'Criando…' : list.length ? `Completar com a base padrão (${missing.length})` : 'Usar base padrão'}</Button>}</>} />
      <HowTo id="conhecimento" title="Como usar a Base de conhecimento">
        <p><b>Para que serve:</b> é o manual da empresa, separado por setor. Tudo o que hoje está só na sua cabeça (como vender, como receber uma aluna nova, o que fazer quando alguém some) fica escrito aqui. Assim o time faz igual, sem depender de você responder toda hora.</p>
        <p><b>Como começar:</b> clique em "Usar base padrão". Ela cria os setores já com um roteiro pronto para consultoria online de treino e dieta. Depois, abra cada setor e ajuste os trechos entre [colchetes] para a sua realidade.</p>
        <ul>
          <li><b>Insumos:</b> dentro de cada setor, cole transcrições de call, anotações e processos conforme eles surgem.</li>
          <li><b>Documento:</b> de tempos em tempos, junte os insumos no texto do setor e marque-os como organizados.</li>
        </ul>
        <p><b>Quando:</b> sempre que você explicar a mesma coisa duas vezes para o time, isso vira um item aqui. Reserve 30 minutos por mês para revisar um setor.</p>
      </HowTo>
      {list.length === 0 ? (
        <Empty title="Nenhum setor ainda" text="Use a base padrão: 6 setores (Vendas, Marketing, Pós-venda e sucesso, Operações e processos, Gestão e financeiro, Jurídico e LGPD) já com um roteiro pronto para personalizar."
          action={<Button onClick={applyTemplates} disabled={applying}>{applying ? 'Criando…' : 'Usar base padrão'}</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((s) => (
            <Link key={s.id} href={`/conhecimento/?setor=${s.id}`} className="card block p-4 hover:border-gold">
              <div className="font-semibold">{s.name}</div>
              <p className="text-sm text-mute">{s.description}</p>
              <div className="mt-2 flex gap-2 text-xs">
                <Badge tone={s.content ? 'good' : 'mute'}>{s.content ? 'documento escrito' : 'sem conteúdo ainda'}</Badge>
                <Badge>{s.inputs.filter((x) => !x.consolidated).length} insumo(s) pendente(s)</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
      <SectorModal open={newSector} onClose={() => setNewSector(false)} order={list.length} />
    </div>
  );
}

function SectorModal({ open, onClose, order }: { open: boolean; onClose: () => void; order: number }) {
  const w = useWriter();
  const [f, setF] = useState({ name: '', description: '' });
  useEffect(() => { if (open) setF({ name: '', description: '' }); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Novo setor"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!f.name.trim()} onClick={async () => { await w.create('knowledge', { ...f, order, content: '', inputs: [] }, `Setor criado: ${f.name}`); onClose(); }}>Criar</Button></>}>
      <div className="space-y-3">
        <Field label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Comunidade" /></Field>
        <Field label="Descrição"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function SectorView({ s }: { s: KnowledgeSector }) {
  const w = useWriter();
  const [content, setContent] = useState(s.content);
  const [dirty, setDirty] = useState(false);
  const [add, setAdd] = useState(false);
  const [input, setInput] = useState<{ type: KnowledgeInput['type']; title: string; text: string }>({ type: 'call', title: '', text: '' });
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { if (!dirty) setContent(s.content); }, [s.content, dirty]);

  async function saveDoc() { await w.update<KnowledgeSector>('knowledge', s.id, { content }, `Documento do setor ${s.name} editado`); setDirty(false); }
  async function setInputs(inputs: KnowledgeInput[], summary: string) { await w.update<KnowledgeSector>('knowledge', s.id, { inputs }, summary); }

  return (
    <div className="max-w-4xl">
      <Link href="/conhecimento/" className="text-xs text-mute hover:text-ink">← Base de conhecimento</Link>
      <PageHeader title={s.name} subtitle={s.description} actions={<Button onClick={() => setAdd(true)}>Adicionar dado</Button>} />
      <Card title="Conhecimento consolidado" action={<span className="flex items-center gap-2 text-xs text-mute">{dirty ? 'não salvo' : 'salvo'}<Button size="sm" disabled={!dirty} onClick={saveDoc}>Salvar</Button></span>}>
        <textarea className="input min-h-[22rem] font-mono text-sm" value={content} onChange={(e) => { setContent(e.target.value); setDirty(true); }}
          placeholder={'Organize por seções, por exemplo:\n\n## Abordagem\n…\n\n## Objeções e respostas\n…\n\n## Fechamento\n…'} />
        <p className="mt-2 text-xs text-mute">Leia os insumos abaixo e integre ao documento. A consolidação automática com IA chega numa próxima etapa.</p>
      </Card>
      <Card className="mt-4" title={`Insumos do setor (${s.inputs.length})`}>
        {s.inputs.length === 0 ? <p className="text-sm text-mute">Nenhum insumo ainda. Cada transcrição ou anotação que você adicionar fica registrada aqui.</p> : (
          <ul className="divide-y divide-line">
            {[...s.inputs].map((x, i) => ({ x, i })).reverse().map(({ x, i }) => (
              <li key={i} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button className="text-left text-sm font-medium hover:underline" onClick={() => setOpen(open === i ? null : i)}>{x.title || INPUT_LABEL[x.type]}</button>
                  <span className="flex items-center gap-2">
                    <Badge>{INPUT_LABEL[x.type]}</Badge><span className="text-xs text-mute">{fmtDate(x.at)}</span>
                    <Button size="sm" variant={x.consolidated ? 'ghost' : 'outline'} onClick={() => setInputs(s.inputs.map((y, j) => (j === i ? { ...y, consolidated: !y.consolidated } : y)), 'Insumo marcado')}>{x.consolidated ? 'consolidado ✓' : 'marcar consolidado'}</Button>
                    <button className="text-xs text-mute hover:text-bad" onClick={() => { if (confirm('Apagar este insumo?')) setInputs(s.inputs.filter((_, j) => j !== i), 'Insumo apagado'); }}>apagar</button>
                  </span>
                </div>
                {open === i && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-line/30 p-3 text-sm">{x.text}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal open={add} onClose={() => setAdd(false)} wide title={`Adicionar dado · ${s.name}`} subtitle="Cole uma transcrição de call, uma anotação ou um processo."
        footer={<><Button variant="ghost" onClick={() => setAdd(false)}>Cancelar</Button><Button disabled={!input.text.trim()} onClick={async () => {
          await setInputs([...s.inputs, { type: input.type, title: input.title.trim() || undefined, text: input.text.trim(), at: todayISO(), consolidated: false } as KnowledgeInput], `Insumo adicionado em ${s.name}`);
          setInput({ type: 'call', title: '', text: '' }); setAdd(false);
        }}>Adicionar</Button></>}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo"><select className="input" value={input.type} onChange={(e) => setInput({ ...input, type: e.target.value as KnowledgeInput['type'] })}>
              {(Object.keys(INPUT_LABEL) as KnowledgeInput['type'][]).map((k) => <option key={k} value={k}>{INPUT_LABEL[k]}</option>)}</select></Field>
            <Field label="Título (opcional)"><input className="input" value={input.title} onChange={(e) => setInput({ ...input, title: e.target.value })} /></Field>
          </div>
          <Field label="Conteúdo"><textarea className="input min-h-[14rem]" value={input.text} onChange={(e) => setInput({ ...input, text: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
