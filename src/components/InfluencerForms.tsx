'use client';
import { useEffect, useState } from 'react';
import { useCollection, useWriter } from '@/lib/db';
import { addMonths, todayISO, parseMoney, fmtBRL } from '@/lib/calc';
import { DEFAULT_TIERS, NETWORKS, type CommissionModel, type DealType, type Influencer, type Tier } from '@/lib/growth';
import { Button, Field, Modal, Toggle } from './ui';
import { syncInfluencerCoupon } from '@/lib/couponSync';
import { DEFAULT_COUPON_PCT } from '@/lib/checkout';

export function InfluencerModal({ open, onClose, influencer, defaultStage = 'prospectar' }: {
  open: boolean; onClose: () => void; influencer?: Influencer; defaultStage?: Influencer['stage'];
}) {
  const w = useWriter();
  const models = useCollection<CommissionModel>('commissionModels');
  const [f, setF] = useState<Partial<Influencer>>({});
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    setErr('');
    const t = todayISO();
    setF(influencer ? { ...influencer } : { network: 'Instagram', stage: defaultStage, deal: 'permuta', active: true, trialStart: t, trialEnd: addMonths(t, 3), storiesPerMonth: 4, reelsPerMonth: 1 });
  }, [open, influencer, defaultStage]);
  const set = <K extends keyof Influencer>(k: K, v: Influencer[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.name?.trim() || !f.handle?.trim()) return setErr('Preencha nome e @.');
    if (f.stage === 'fechado' && !f.email?.trim()) return setErr('Para fechar, informe o e-mail da influencer.');
    const data: Partial<Influencer> = {
      name: f.name.trim(), network: f.network ?? 'Instagram', handle: f.handle.trim().replace(/^@/, ''), email: f.email?.trim() || undefined,
      coupon: f.coupon?.trim().toUpperCase().replace(/\s+/g, '') || undefined, couponPct: f.coupon?.trim() ? Math.round(Number(f.couponPct) || DEFAULT_COUPON_PCT) : undefined, stage: f.stage ?? 'prospectar', modelId: f.modelId || undefined, deal: f.deal ?? 'permuta',
      trialStart: f.trialStart || undefined, trialEnd: f.trialEnd || undefined, storiesPerMonth: Number(f.storiesPerMonth) || 0,
      reelsPerMonth: Number(f.reelsPerMonth) || 0, active: f.active !== false, notes: f.notes?.trim() || undefined,
    };
    let id = influencer?.id;
    if (influencer) await w.update<Influencer>('influencers', influencer.id, data, `Influencer editada: ${data.name}`);
    else id = await w.create('influencers', data, `Influencer adicionada: ${data.name}`);
    try {
      await syncInfluencerCoupon(w, { id: id!, name: data.name!, coupon: data.coupon, couponPct: data.couponPct, stage: data.stage!, active: data.active! }, influencer?.coupon);
    } catch (e) { console.error('cupom', e); }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} wide title={influencer ? `Editar ${influencer.name}` : 'Adicionar influencer'}
      subtitle="Comece com nome, rede e @. O e-mail é pedido quando fechar a parceria."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><input className="input" value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Rede">
            <select className="input" value={f.network ?? 'Instagram'} onChange={(e) => set('network', e.target.value)}>{NETWORKS.map((n) => <option key={n}>{n}</option>)}</select>
          </Field>
          <Field label="@ / usuário"><input className="input" value={f.handle ?? ''} onChange={(e) => set('handle', e.target.value)} placeholder="usuario" /></Field>
        </div>
        <Field label="E-mail" hint="Obrigatório ao fechar."><input className="input" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Cupom de divulgação" hint="Vira cupom de desconto no checkout quando a parceria está fechada."><input className="input" value={f.coupon ?? ''} onChange={(e) => set('coupon', e.target.value)} placeholder="ex.: BIA10" /></Field>
        <Field label="Desconto do cupom (%)"><input className="input" type="number" min={1} max={90} value={f.couponPct ?? DEFAULT_COUPON_PCT} onChange={(e) => set('couponPct', Number(e.target.value))} /></Field>
        <Field label="Etapa do funil">
          <select className="input" value={f.stage} onChange={(e) => set('stage', e.target.value as Influencer['stage'])}>
            <option value="prospectar">A prospectar</option><option value="prospectando">Prospectando</option><option value="negociacao">Em negociação</option><option value="fechado">Fechado</option><option value="perdido">Perdido</option>
          </select>
        </Field>
        <Field label="Tipo de parceria">
          <select className="input" value={f.deal} onChange={(e) => set('deal', e.target.value as DealType)}>
            <option value="permuta">Permuta (consultoria em troca de conteúdo)</option><option value="comissao">Comissão por venda</option><option value="ambos">Permuta + comissão</option>
          </select>
        </Field>
        {f.deal !== 'permuta' && (
          <Field label="Modelo de comissão" className="sm:col-span-2" hint="O vínculo é vivo: editar o modelo atualiza todas as influencers ligadas a ele.">
            <select className="input" value={f.modelId ?? ''} onChange={(e) => set('modelId', e.target.value)}>
              <option value="">Sem modelo (define depois)</option>
              {models.data.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.tiers.length} faixas</option>)}
            </select>
          </Field>
        )}
        {f.deal !== 'comissao' && (
          <>
            <div className="sm:col-span-2 mt-1 text-xs font-semibold uppercase tracking-wide text-mute">Programa de permuta</div>
            <Field label="Início do teste"><input className="input" type="date" value={f.trialStart ?? ''} onChange={(e) => { set('trialStart', e.target.value); if (e.target.value) set('trialEnd', addMonths(e.target.value, 3)); }} /></Field>
            <Field label="Fim do teste" hint="3 meses por padrão."><input className="input" type="date" value={f.trialEnd ?? ''} onChange={(e) => set('trialEnd', e.target.value)} /></Field>
            <Field label="Stories por mês (combinado)"><input className="input" type="number" min={0} value={f.storiesPerMonth ?? 0} onChange={(e) => set('storiesPerMonth', Number(e.target.value))} /></Field>
            <Field label="Reels collab por mês (combinado)"><input className="input" type="number" min={0} value={f.reelsPerMonth ?? 0} onChange={(e) => set('reelsPerMonth', Number(e.target.value))} /></Field>
          </>
        )}
        <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        {influencer && <div className="sm:col-span-2"><Toggle checked={f.active !== false} onChange={(v) => set('active', v)} label="Parceria ativa" hint="Desativar tira da escolha nas vendas, sem apagar o histórico." /></div>}
        {err && <p className="text-sm text-bad sm:col-span-2">{err}</p>}
      </div>
    </Modal>
  );
}

export function CommissionModelsModal({ open, onClose, influencers }: { open: boolean; onClose: () => void; influencers: Influencer[] }) {
  const models = useCollection<CommissionModel>('commissionModels');
  const w = useWriter();
  const [edit, setEdit] = useState<{ id?: string; name: string; tiers: (Tier & { minText?: string })[] } | null>(null);
  useEffect(() => { if (!open) setEdit(null); }, [open]);

  async function save() {
    if (!edit) return;
    const tiers = edit.tiers.map((t) => ({ name: t.name.trim() || 'Faixa', min: parseMoney(t.minText ?? String(t.min)), pct: Number(t.pct) || 0 })).sort((a, b) => a.min - b.min);
    if (edit.id) await w.update<CommissionModel>('commissionModels', edit.id, { name: edit.name, tiers }, `Modelo de comissão editado: ${edit.name}`);
    else await w.create('commissionModels', { name: edit.name || 'Novo modelo', tiers }, `Modelo de comissão criado: ${edit.name}`);
    setEdit(null);
  }

  return (
    <Modal open={open} onClose={onClose} wide title="Modelos de comissão"
      subtitle="Estruturas de comissão por faixa de faturamento do mês. Editar um modelo atualiza todas as influencers ligadas a ele."
      footer={edit ? <><Button variant="ghost" onClick={() => setEdit(null)}>Voltar</Button><Button onClick={save}>Salvar modelo</Button></>
        : <><Button variant="ghost" onClick={onClose}>Fechar</Button><Button onClick={() => setEdit({ name: '', tiers: DEFAULT_TIERS.map((t) => ({ ...t })) })}>Novo modelo</Button></>}>
      {!edit ? (
        models.data.length === 0 ? <p className="text-sm text-mute">Nenhum modelo ainda. O padrão sugerido é Bronze 10% · Prata 12% a partir de R$ 4.000 · Ouro 15% a partir de R$ 6.500 · Diamante 20% a partir de R$ 12.000.</p> : (
          <ul className="divide-y divide-line">
            {models.data.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-mute">{m.tiers.map((t) => `${t.name} ${t.pct}%${t.min ? ` a partir de ${fmtBRL(t.min)}` : ''}`).join(' · ')}</div>
                  <div className="text-xs text-mute">{influencers.filter((i) => i.modelId === m.id).length} influencer(s) usam</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEdit({ id: m.id, name: m.name, tiers: m.tiers.map((t) => ({ ...t })) })}>Editar</Button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-3">
          <Field label="Nome do modelo"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="ex.: Padrão 4 faixas" /></Field>
          <div className="grid grid-cols-[1fr_1fr_6rem_2rem] gap-2 text-xs text-mute"><span>Faixa</span><span>Faturamento mínimo no mês (R$)</span><span>% comissão</span><span /></div>
          {edit.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_6rem_2rem] gap-2">
              <input className="input" value={t.name} placeholder="ex.: Bronze" onChange={(e) => setEdit({ ...edit, tiers: edit.tiers.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} />
              <input className="input" inputMode="decimal" defaultValue={t.min ? String(t.min) : '0'} onChange={(e) => setEdit({ ...edit, tiers: edit.tiers.map((x, j) => j === i ? { ...x, minText: e.target.value } : x) })} />
              <input className="input" type="number" step="0.5" value={t.pct} onChange={(e) => setEdit({ ...edit, tiers: edit.tiers.map((x, j) => j === i ? { ...x, pct: Number(e.target.value) } : x) })} />
              <button className="text-mute hover:text-bad" aria-label="Remover faixa" onClick={() => setEdit({ ...edit, tiers: edit.tiers.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, tiers: [...edit.tiers, { name: '', min: 0, pct: 10 }] })}>Adicionar faixa</Button>
          {edit.id && <p className="text-xs text-warn">Este modelo é usado por {influencers.filter((i) => i.modelId === edit.id).length} influencer(s). Salvar atualiza a comissão de todas.</p>}
        </div>
      )}
    </Modal>
  );
}
