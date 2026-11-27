'use client';
import { useEffect, useMemo, useState } from 'react';
import { planEndDate, todayISO, parseMoney, fmtBRL2 } from '@/lib/calc';
import { useWriter } from '@/lib/db';
import { useChannels, useClients, useMembers, usePlans, useProducts } from '@/lib/hooks';
import type { Client, PaymentMethod, Sale, SaleStatus } from '@/lib/types';
import { PERIOD_LABEL } from '@/lib/types';
import { useSession } from '@/lib/auth';
import { Button, Field, Modal, Toggle } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Cliente já escolhido (vindo da ficha) */
  client?: Client;
  /** Venda existente para editar */
  sale?: Sale;
  /** Vendas do cliente, para detectar renovação */
  clientSales?: Sale[];
}

export function SaleForm({ open, onClose, client, sale, clientSales }: Props) {
  const { user } = useSession();
  const w = useWriter();
  const clients = useClients();
  const products = useProducts();
  const plans = usePlans();
  const channels = useChannels();
  const members = useMembers();

  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [planId, setPlanId] = useState('');
  const [gross, setGross] = useState('');
  const [fees, setFees] = useState('0');
  const [date, setDate] = useState(todayISO());
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState('');
  const [channelId, setChannelId] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [referredById, setReferredById] = useState('');
  const [isRenewal, setIsRenewal] = useState(false);
  const [status, setStatus] = useState<SaleStatus>('aprovada');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [installments, setInstallments] = useState(1);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Preenche ao abrir
  useEffect(() => {
    if (!open) return;
    setErr('');
    if (sale) {
      setClientId(sale.clientId); setPlanId(sale.planId); setGross(String(sale.gross).replace('.', ','));
      setFees(String(sale.fees ?? 0).replace('.', ',')); setDate(sale.date); setStartDate(sale.startDate); setEndDate(sale.endDate);
      setChannelId(sale.channelId ?? ''); setSellerId(sale.sellerId ?? ''); setReferredById(sale.referredById ?? '');
      setIsRenewal(sale.isRenewal); setStatus(sale.status); setPaymentMethod(sale.paymentMethod);
      setInstallments(sale.installments || 1); setNotes(sale.notes ?? '');
    } else {
      const t = todayISO();
      setClientId(client?.id ?? ''); setPlanId(''); setGross(''); setFees('0'); setDate(t); setStartDate(t); setEndDate('');
      setChannelId(client?.channelId ?? ''); setSellerId(client?.sellerId ?? ''); setReferredById(client?.referredById ?? '');
      const hasPrev = (clientSales ?? []).some((s) => s.status === 'aprovada');
      setIsRenewal(hasPrev); setStatus('aprovada'); setPaymentMethod('pix'); setInstallments(1); setNotes('');
      if (hasPrev) setChannelId('renovacao');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sale?.id, client?.id]);

  const plan = plans.byId[planId];
  // Ao escolher o plano: valor e vencimento sugeridos
  function pickPlan(id: string) {
    setPlanId(id);
    const p = plans.byId[id];
    if (p) {
      setGross(String(p.price).replace('.', ','));
      setEndDate(planEndDate(startDate, p.period));
    }
  }
  function pickStart(d: string) {
    setStartDate(d);
    if (plan && d) setEndDate(planEndDate(d, plan.period));
  }

  const selectedClient = client ?? clients.byId[clientId];
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    return clients.data.filter((c) => !c.deleted && (!q || c.name.toLowerCase().includes(q) || (c.email ?? '').includes(q))).slice(0, 50);
  }, [clients.data, clientSearch]);

  async function save() {
    setErr('');
    if (!selectedClient) return setErr('Escolha o cliente.');
    if (!plan) return setErr('Escolha o plano.');
    const value = parseMoney(gross);
    if (!value) return setErr('Informe o valor.');
    if (!endDate || endDate < startDate) return setErr('Confira as datas de início e vencimento.');
    setBusy(true);
    try {
      const data: Omit<Sale, 'id' | 'createdAt'> & { createdAt?: number } = {
        clientId: selectedClient.id, clientName: selectedClient.name, planId: plan.id, planName: plan.name,
        productId: plan.productId, period: plan.period, gross: value, fees: parseMoney(fees), date, startDate, endDate,
        channelId: channelId || undefined, sellerId: sellerId || undefined, referredById: referredById || undefined,
        isRenewal, status, paymentMethod, installments, isTest: !!selectedClient.isTest, notes: notes || undefined,
        createdBy: sale?.createdBy ?? user!.uid,
      };
      if (sale) await w.update<Sale>('sales', sale.id, data, `Venda editada: ${selectedClient.name} · ${plan.name}`);
      else await w.create('sales', data, `Venda lançada: ${selectedClient.name} · ${plan.name} · ${fmtBRL2(value)}`);

      // Mantém o plano vigente na ficha do cliente quando a venda é aprovada e é a mais recente
      if (status === 'aprovada' && (!selectedClient.endDate || endDate >= selectedClient.endDate)) {
        await w.update<Client>('clients', selectedClient.id, {
          planId: plan.id, planName: plan.name, startDate, endDate, lastValue: value,
          status: 'ativo', channelId: selectedClient.channelId || channelId || undefined,
          sellerId: selectedClient.sellerId || sellerId || undefined,
          referredById: selectedClient.referredById || referredById || undefined,
        }, `Plano atualizado pela venda: ${plan.name}`);
      }
      onClose();
    } catch (e) {
      console.error(e);
      setErr('Não foi possível salvar. Tente de novo.');
    } finally { setBusy(false); }
  }

  const activeProducts = products.data.filter((p) => !p.archived);

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={sale ? 'Editar venda' : 'Lançar venda'}
      subtitle="A venda aprovada atualiza o plano do cliente, as metas por canal e o desempenho."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar venda'}</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {client || sale ? (
          <Field label="Cliente" className="sm:col-span-2"><input className="input" disabled value={selectedClient?.name ?? ''} /></Field>
        ) : (
          <div className="sm:col-span-2">
            <Field label="Cliente">
              <input className="input" placeholder="Buscar por nome ou e-mail…" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} />
            </Field>
            <select className="input mt-2" size={5} value={clientId} onChange={(e) => {
              const c = clients.byId[e.target.value];
              setClientId(e.target.value);
              // cliente que já tem plano = renovação
              const renew = !!c?.planId;
              setIsRenewal(renew);
              setChannelId(renew ? 'renovacao' : c?.channelId ?? '');
              setSellerId(c?.sellerId ?? '');
              setReferredById(c?.referredById ?? '');
            }}>
              {filteredClients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>)}
            </select>
            <p className="mt-1 text-xs text-mute">Cliente novo? Cadastre na Central de clientes e lance a venda pela ficha dele.</p>
          </div>
        )}
        <Field label="Plano" className="sm:col-span-2">
          <select className="input" value={planId} onChange={(e) => pickPlan(e.target.value)}>
            <option value="">Escolha o plano</option>
            {activeProducts.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {plans.data.filter((pl) => pl.productId === p.id && (pl.active || pl.id === planId)).map((pl) => (
                  <option key={pl.id} value={pl.id}>{pl.name} · {PERIOD_LABEL[pl.period]} · {fmtBRL2(pl.price)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Valor cobrado (R$)"><input className="input" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} /></Field>
        <Field label="Taxas que ficaram com você (R$)" hint="Se a taxa é repassada à aluna, deixe 0."><input className="input" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} /></Field>
        <Field label="Data da venda"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Situação">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as SaleStatus)}>
            <option value="aprovada">Aprovada (pago)</option>
            <option value="pendente">Pendente</option>
            <option value="estornada">Estornada</option>
          </select>
        </Field>
        <Field label="Início do plano"><input className="input" type="date" value={startDate} onChange={(e) => pickStart(e.target.value)} /></Field>
        <Field label="Vencimento" hint="Calculado pelo período do plano; pode ajustar."><input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        <Field label="Canal de venda">
          <select className="input" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">Sem canal</option>
            {channels.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Vendedor">
          <select className="input" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
            <option value="">Sem vendedor</option>
            {members.sellers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Indicado por">
          <select className="input" value={referredById} onChange={(e) => setReferredById(e.target.value)}>
            <option value="">Ninguém</option>
            {clients.data.filter((c) => !c.deleted && c.id !== selectedClient?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pagamento">
            <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              <option value="pix">Pix</option>
              <option value="cartao">Cartão</option>
              <option value="boleto">Boleto</option>
            </select>
          </Field>
          <Field label="Parcelas">
            <input className="input" type="number" min={1} max={12} value={installments} onChange={(e) => setInstallments(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Toggle checked={isRenewal} onChange={setIsRenewal} label="É renovação" hint="Marcado sozinho quando o cliente já tem venda aprovada antes. Renovação não conta como cliente novo." />
        </div>
        <Field label="Observação" className="sm:col-span-2"><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      {selectedClient?.isTest && <p className="mt-3 text-sm text-warn">Cliente de teste: esta venda não entra em nenhum indicador.</p>}
      {err && <p className="mt-3 text-sm text-bad">{err}</p>}
    </Modal>
  );
}
