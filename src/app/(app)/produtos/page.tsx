'use client';
import { useEffect, useState } from 'react';
import { usePlans, useProducts } from '@/lib/hooks';
import { useWriter } from '@/lib/db';
import { fmtBRL2, parseMoney } from '@/lib/calc';
import type { Modality, PaymentMethod, Period, Plan, Product } from '@/lib/types';
import { PERIOD_LABEL } from '@/lib/types';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, Toggle } from '@/components/ui';

const MODALITY: Record<Modality, string> = { online: 'Online', presencial: 'Presencial', consulta: 'Consulta' };
const PERIODS: Period[] = ['mensal', 'trimestral', 'semestral', 'anual'];

export default function ProdutosPage() {
  const products = useProducts();
  const plans = usePlans();
  const w = useWriter();
  const [showArchived, setShowArchived] = useState(false);
  const [prodOpen, setProdOpen] = useState<Product | 'new' | null>(null);
  const [planOpen, setPlanOpen] = useState<{ plan?: Plan; productId: string } | null>(null);

  const list = products.data.filter((p) => !!p.archived === showArchived);

  return (
    <div>
      <PageHeader title="Produtos e planos" subtitle="O que você vende. Cada produto tem os seus planos e preços."
        actions={<>
          <Button variant="ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Ver ativos' : 'Ver arquivados'}</Button>
          <Button onClick={() => setProdOpen('new')}>Novo produto</Button>
        </>} />
      <p className="mb-4 text-xs text-mute">Arquivar só tira o produto desta lista: os planos, as vendas e os clientes dele continuam valendo.</p>

      {products.loading ? <Spinner /> : list.length === 0 ? (
        <Empty title={showArchived ? 'Nenhum produto arquivado' : 'Nenhum produto ainda'} text="Ex.: “Treino”, “Treino e dieta”, “Treino, dieta e médico”."
          action={!showArchived && <Button onClick={() => setProdOpen('new')}>Novo produto</Button>} />
      ) : (
        <div className="space-y-4">
          {list.map((p) => {
            const pl = plans.data.filter((x) => x.productId === p.id);
            const prices = pl.filter((x) => x.active).map((x) => x.price);
            const inc = Object.entries(p.includes).filter(([, v]) => v).map(([k]) => ({ treino: 'Treino', dieta: 'Dieta', cardio: 'Cardio', medico: 'Médico' }[k]));
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{p.name}</h3>
                      <Badge tone={p.active ? 'good' : 'mute'}>{p.active ? 'Ativo' : 'Inativo'}</Badge>
                      <Badge>{MODALITY[p.modality]}</Badge>
                      {!p.forSale && <Badge tone="warn">fora de venda</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-mute">
                      {inc.join(' + ') || 'Nada incluso marcado'} · {pl.filter((x) => x.active).length} plano(s) ativo(s)
                      {prices.length > 0 && ` · ${fmtBRL2(Math.min(...prices))} a ${fmtBRL2(Math.max(...prices))}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setProdOpen(p)}>Editar</Button>
                    <Button size="sm" onClick={() => setPlanOpen({ productId: p.id })}>Novo plano</Button>
                    <Button size="sm" variant="ghost" onClick={() => w.update<Product>('products', p.id, { archived: !p.archived }, `${p.archived ? 'Desarquivado' : 'Arquivado'}: ${p.name}`)}>
                      {p.archived ? 'Desarquivar' : 'Arquivar'}
                    </Button>
                  </div>
                </div>
                {pl.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full">
                      <thead><tr className="border-b border-line"><th className="th">Plano</th><th className="th">Período</th><th className="th">Preço</th><th className="th">Pagamento</th><th className="th">Situação</th><th className="th" /></tr></thead>
                      <tbody>
                        {pl.map((x) => (
                          <tr key={x.id} className="border-b border-line/60">
                            <td className="td font-medium">{x.name}{x.couple && <span className="ml-1"><Badge tone="gold">casal</Badge></span>}</td>
                            <td className="td">{PERIOD_LABEL[x.period]}</td>
                            <td className="td">{fmtBRL2(x.price)}</td>
                            <td className="td text-mute">{x.paymentMethods.join(', ')} · até {x.maxInstallments}x</td>
                            <td className="td"><Badge tone={x.active ? 'good' : 'mute'}>{x.active ? 'Ativo' : 'Inativo'}</Badge></td>
                            <td className="td">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setPlanOpen({ plan: x, productId: p.id })}>Editar</Button>
                                <Button size="sm" variant="ghost" onClick={() => {
                                  const { id, createdAt, ...rest } = x; void id; void createdAt;
                                  w.create('plans', { ...rest, name: `${x.name} (cópia)`, active: false }, `Plano duplicado: ${x.name}`);
                                }}>Duplicar</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <ProductModal open={!!prodOpen} product={prodOpen === 'new' ? undefined : prodOpen ?? undefined} onClose={() => setProdOpen(null)} />
      <PlanModal open={!!planOpen} plan={planOpen?.plan} productId={planOpen?.productId ?? ''} products={products.data} onClose={() => setPlanOpen(null)} />
    </div>
  );
}

function ProductModal({ open, product, onClose }: { open: boolean; product?: Product; onClose: () => void }) {
  const w = useWriter();
  const [f, setF] = useState<Omit<Product, 'id' | 'createdAt'>>(blankProduct());
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) { setErr(''); setF(product ? { ...product } : blankProduct()); }
  }, [open, product]);
  async function save() {
    if (!f.name.trim()) return setErr('Dê um nome ao produto.');
    const data = { ...f, name: f.name.trim() };
    if (product) await w.update<Product>('products', product.id, data, `Produto editado: ${data.name}`);
    else await w.create('products', data, `Produto criado: ${data.name}`);
    onClose();
  }
  const inc = (k: keyof Product['includes'], v: boolean) => setF({ ...f, includes: { ...f.includes, [k]: v } });
  return (
    <Modal open={open} onClose={onClose} title={product ? 'Editar produto' : 'Novo produto'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>{product ? 'Salvar' : 'Criar produto'}</Button></>}>
      <div className="space-y-4">
        <Field label="Nome do produto"><input className="input" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Treino e dieta" /></Field>
        <Field label="Descrição"><textarea className="input" rows={3} maxLength={2000} value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Modalidade">
          <select className="input" value={f.modality} onChange={(e) => setF({ ...f, modality: e.target.value as Modality })}>
            {Object.entries(MODALITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div>
          <span className="label">O que está incluso</span>
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle checked={f.includes.treino} onChange={(v) => inc('treino', v)} label="Treino" />
            <Toggle checked={f.includes.dieta} onChange={(v) => inc('dieta', v)} label="Plano alimentar" />
            <Toggle checked={f.includes.cardio} onChange={(v) => inc('cardio', v)} label="Cardio" />
            <Toggle checked={f.includes.medico} onChange={(v) => inc('medico', v)} label="Consulta médica" />
          </div>
        </div>
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Produto ativo" />
        <Toggle checked={f.forSale} onChange={(v) => setF({ ...f, forSale: v })} label="Disponível para venda" hint="Aparece na escolha de produtos." />
        <Toggle checked={f.grantsApp} onChange={(v) => setF({ ...f, grantsApp: v })} label="Liberar o app na compra" hint="Usado quando a área da aluna entrar (Fase 2)." />
        {err && <p className="text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  );
}

function blankProduct(): Omit<Product, 'id' | 'createdAt'> {
  return { name: '', description: '', active: true, forSale: true, grantsApp: true, modality: 'online', includes: { treino: true, dieta: false, cardio: false, medico: false } };
}

function PlanModal({ open, plan, productId, products, onClose }: { open: boolean; plan?: Plan; productId: string; products: Product[]; onClose: () => void }) {
  const w = useWriter();
  const [f, setF] = useState({ name: '', description: '', period: 'trimestral' as Period, price: '', methods: ['pix', 'cartao'] as PaymentMethod[], maxInstallments: 12, couple: false, active: true, productId });
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    setErr('');
    setF(plan
      ? { name: plan.name, description: plan.description ?? '', period: plan.period, price: String(plan.price).replace('.', ','), methods: plan.paymentMethods, maxInstallments: plan.maxInstallments, couple: plan.couple, active: plan.active, productId: plan.productId }
      : { name: '', description: '', period: 'trimestral', price: '', methods: ['pix', 'cartao'], maxInstallments: 12, couple: false, active: true, productId });
  }, [open, plan, productId]);
  async function save() {
    const price = parseMoney(f.price);
    if (!f.name.trim()) return setErr('Dê um nome ao plano.');
    if (!price) return setErr('Informe o preço.');
    if (!f.methods.length) return setErr('Escolha ao menos uma forma de pagamento.');
    const data = { productId: f.productId, name: f.name.trim(), description: f.description || undefined, period: f.period, price, paymentMethods: f.methods, maxInstallments: f.maxInstallments, couple: f.couple, active: f.active };
    if (plan) await w.update<Plan>('plans', plan.id, data, `Plano editado: ${data.name}`);
    else await w.create('plans', data, `Plano criado: ${data.name}`);
    onClose();
  }
  const toggleMethod = (m: PaymentMethod, v: boolean) => setF({ ...f, methods: v ? [...f.methods, m] : f.methods.filter((x) => x !== m) });
  return (
    <Modal open={open} onClose={onClose} title={plan ? 'Editar plano' : 'Novo plano'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar plano</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do plano" className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Garimpo Semestral" /></Field>
        <Field label="Produto" className="sm:col-span-2">
          <select className="input" value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Período">
          <select className="input" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value as Period })}>
            {PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
          </select>
        </Field>
        <Field label="Preço (R$)"><input className="input" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="1.600,00" /></Field>
        <div className="sm:col-span-2">
          <span className="label">Formas de pagamento</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {(['pix', 'cartao', 'boleto'] as PaymentMethod[]).map((m) => (
              <Toggle key={m} checked={f.methods.includes(m)} onChange={(v) => toggleMethod(m, v)} label={{ pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto' }[m]} />
            ))}
          </div>
        </div>
        <Field label="Parcelamento máximo"><input className="input" type="number" min={1} max={12} value={f.maxInstallments} onChange={(e) => setF({ ...f, maxInstallments: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} /></Field>
        <div />
        <div className="sm:col-span-2 space-y-2">
          <Toggle checked={f.couple} onChange={(v) => setF({ ...f, couple: v })} label="Plano de casal" hint="Uma venda para duas pessoas: lance uma venda para cada uma com metade do valor." />
          <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Plano ativo" hint="Plano inativo some da escolha na hora de lançar venda." />
        </div>
        <Field label="Descrição interna" className="sm:col-span-2" hint="Não aparece para a cliente."><textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {err && <p className="text-sm text-bad sm:col-span-2">{err}</p>}
      </div>
    </Modal>
  );
}
