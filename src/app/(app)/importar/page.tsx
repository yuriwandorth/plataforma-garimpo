'use client';
// Importação: planilha (.xlsx/.csv) com colunas casadas automaticamente, ou pacote técnico (JSON).
// Confere o que é novo antes de gravar e nunca duplica.
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSession } from '@/lib/auth';
import { useCollection, useWriter, colRef, docRef, deepClean, type Col } from '@/lib/db';
import { syncInfluencerCoupon } from '@/lib/couponSync';
import { useChannels, useClients, useInfluencers, usePlans, useProducts } from '@/lib/hooks';
import { fmtBRL2, fmtDate, todayISO } from '@/lib/calc';
import { planImport, type ImportPayload, type ImportPlan } from '@/lib/importer';
import { autoMap, FIELDS, headerRowIndex, parseCSV, sheetToPayload, type Cell, type SheetKind } from '@/lib/sheetImport';
import type { Sale } from '@/lib/types';
import { Badge, Button, Card, ErrorNote, Field, PageHeader, Stat } from '@/components/ui';

type Op = [Col, string, Record<string, unknown>, boolean];
interface Sheet { name: string; rows: Cell[][] }

export default function ImportarPage() {
  const { profile, user } = useSession();
  const clients = useClients();
  const plans = usePlans();
  const products = useProducts();
  const influencers = useInfluencers();
  const channels = useChannels();
  const sales = useCollection<Sale & { importKey?: string }>('sales');
  const w = useWriter();

  const [kind, setKind] = useState<SheetKind>('clientes');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [map, setMap] = useState<Record<string, number>>({});
  const [rowErrors, setRowErrors] = useState<string[]>([]);
  const [raw, setRaw] = useState('');
  const [productId, setProductId] = useState('');
  const [payload, setPayload] = useState<ImportPayload | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState('');
  const [done, setDone] = useState('');

  const prodId = productId || products.data.find((p) => !p.archived)?.id || '';
  const ready = !clients.loading && !plans.loading && !influencers.loading && !sales.loading && !products.loading && !channels.loading;
  const sheet = sheets[sheetIdx];
  const headers = sheet?.rows[headerIdx] ?? [];
  const sample = sheet?.rows.slice(headerIdx + 1).find((r) => r.some((c) => String(c ?? '').trim())) ?? [];

  // ao trocar arquivo, aba ou tipo: acha o cabeçalho e casa as colunas
  useEffect(() => {
    if (!sheet) return;
    const h = headerRowIndex(sheet.rows);
    setHeaderIdx(h);
    setMap(autoMap(sheet.rows[h] ?? [], kind));
    setPlan(null); setPayload(null); setDone('');
  }, [sheet, kind]);

  async function onFile(f: File | undefined) {
    setErr(''); setPlan(null); setPayload(null); setDone(''); setSheets([]); setRowErrors([]);
    if (!f) return;
    setFileName(f.name);
    try {
      if (/\.csv$|\.txt$/i.test(f.name)) {
        setSheets([{ name: f.name, rows: parseCSV(await f.text()) }]);
      } else if (/\.xlsx$/i.test(f.name)) {
        const { default: readXlsxFile } = await import('read-excel-file/browser');
        const all = await readXlsxFile(f);
        setSheets(all.map((s) => ({ name: s.sheet, rows: s.data as Cell[][] })).filter((s) => s.rows.length));
      } else {
        setErr('Use um arquivo .xlsx (Excel/Google Sheets) ou .csv. Planilhas .xls antigas: abra e salve como .xlsx.');
      }
      setSheetIdx(0);
    } catch (e) {
      console.error(e);
      setErr('Não consegui ler esse arquivo. Confira se é .xlsx ou .csv e se não está protegido por senha.');
    }
  }

  function prepare(p: ImportPayload) {
    if (!prodId) return setErr('Cadastre um produto em Produtos e planos antes de importar.');
    const tid = profile!.tenantId;
    setPayload(p);
    setPlan(planImport(p, { clients: clients.data, plans: plans.data, influencers: influencers.data, sales: sales.data }, {
      productId: prodId, today: todayISO(), by: user!.uid, newId: () => doc(collection(db, 'tenants', tid, 'clients')).id,
    }));
  }

  function checkSheet() {
    setErr(''); setDone('');
    const missing = FIELDS[kind].filter((f) => f.required && map[f.id] === undefined);
    if (missing.length) return setErr(`Escolha a coluna de: ${missing.map((f) => f.label).join(', ')}.`);
    const r = sheetToPayload(sheet.rows, headerIdx, map, kind, channels.data, `planilha:${fileName}`);
    setRowErrors(r.rowErrors);
    if (!r.rows) return setErr('Nenhuma linha com dados foi encontrada abaixo do cabeçalho.');
    prepare(r.payload);
  }

  function checkRaw() {
    setErr(''); setDone('');
    try { const p = JSON.parse(raw); if (!p || typeof p !== 'object') throw 0; prepare(p); }
    catch { setErr('O conteúdo colado não é um pacote de importação válido.'); }
  }

  async function run() {
    if (!plan || !payload) return;
    setErr(''); setProgress('Gravando…');
    const tid = profile!.tenantId;
    const now = Date.now();
    const ops: Op[] = [
      ...plan.influencers.map(({ id, ...d }): Op => ['influencers', id, { ...d, createdAt: now, updatedAt: now }, false]),
      ...plan.plans.map(({ id, ...d }): Op => ['plans', id, { ...d, createdAt: now }, false]),
      ...plan.clients.map(({ id, ...d }): Op => ['clients', id, { ...d, createdAt: now, updatedAt: now }, false]),
      ...plan.sales.map(({ id, ...d }): Op => ['sales', id, { ...d, createdAt: now }, false]),
      ...plan.clientUpdates.map(({ id, data }): Op => ['clients', id, { ...data, updatedAt: now }, true]),
    ];
    try {
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(db);
        for (const [c, id, d, merge] of ops.slice(i, i + 400)) {
          if (merge) b.set(docRef(tid, c, id), deepClean(d), { merge: true });
          else b.set(docRef(tid, c, id), deepClean(d));
        }
        await b.commit();
        setProgress(`Gravados ${Math.min(i + 400, ops.length)} de ${ops.length}…`);
      }
      for (const i of plan.influencers.filter((x) => x.coupon)) {
        await syncInfluencerCoupon(w, { id: i.id, name: i.name, coupon: i.coupon, couponPct: i.couponPct, stage: i.stage, active: i.active }).catch(() => {});
      }
      const summary = `${plan.clients.length} clientes, ${plan.sales.length} vendas, ${plan.influencers.length} influencers, ${plan.plans.length} planos antigos`;
      const b = writeBatch(db);
      b.set(doc(colRef(tid, 'audit')), { entity: 'import', entityId: payload.source, action: 'create', by: user!.uid, byName: profile!.name, at: Date.now(), summary: `Importação (${payload.source}): ${summary}` });
      await b.commit().catch(() => {});
      setProgress(''); setDone(summary); setPlan(null);
    } catch (e) {
      console.error(e);
      setErr('A gravação parou no meio. Pode rodar de novo: o que já entrou não é duplicado.');
      setProgress('');
    }
  }

  const colOptions = useMemo(() => headers.map((h, i) => ({ i, label: String(h ?? '').trim() || `Coluna ${i + 1}` })), [headers]);
  const show = (v: Cell) => (v instanceof Date ? fmtDate(v.toISOString().slice(0, 10)) : String(v ?? ''));

  if (profile?.role !== 'owner') return <p className="text-sm text-mute">Só o(a) dono(a) importa dados.</p>;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Importar dados" subtitle="Traga clientes, histórico de vendas ou influencers de uma planilha, sem duplicar o que já existe." />
      <div className="space-y-4">
        <Card title="1. Escolha a planilha">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="O que a planilha tem?">
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as SheetKind)}>
                <option value="clientes">Clientes e vendas</option>
                <option value="influencers">Influencers</option>
              </select>
            </Field>
            <Field label="Arquivo (.xlsx ou .csv)" hint="Do Google Sheets: Arquivo → Fazer download → .xlsx">
              <input type="file" accept=".xlsx,.csv,.txt" className="input py-1.5" onChange={(e) => onFile(e.target.files?.[0])} />
            </Field>
            {sheets.length > 1 && (
              <Field label="Aba da planilha">
                <select className="input" value={sheetIdx} onChange={(e) => setSheetIdx(Number(e.target.value))}>
                  {sheets.map((s, i) => <option key={s.name + i} value={i}>{s.name} ({s.rows.length} linhas)</option>)}
                </select>
              </Field>
            )}
            {kind === 'clientes' && (
              <Field label="Produto dos planos que não existirem" hint="Planos novos entram inativos, só para o histórico.">
                <select className="input" value={prodId} onChange={(e) => setProductId(e.target.value)}>
                  {products.data.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            )}
          </div>
          {kind === 'clientes' && <p className="mt-3 text-xs text-mute">Cada linha é uma cliente. Se a linha tiver plano, valor e data, vira também uma venda. A mesma cliente pode aparecer em várias linhas (uma por venda); ela é reconhecida pelo e-mail ou, sem e-mail, pelo nome.</p>}
        </Card>

        {sheet && (
          <Card title="2. Confira as colunas" action={<span className="text-xs text-mute">{sheet.rows.length - headerIdx - 1} linhas de dados</span>}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-mute">
              Cabeçalho na linha
              <select className="input w-20 py-1 text-xs" value={headerIdx} onChange={(e) => { const h = Number(e.target.value); setHeaderIdx(h); setMap(autoMap(sheet.rows[h] ?? [], kind)); setPlan(null); }}>
                {sheet.rows.slice(0, 15).map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
              </select>
              · as colunas foram casadas pelo nome; ajuste o que estiver errado.
            </div>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {FIELDS[kind].map((f) => (
                <label key={f.id} className="block">
                  <span className="label">{f.label}{f.required && <span className="text-bad"> *</span>}</span>
                  <select className="input" value={map[f.id] ?? ''} onChange={(e) => { const v = e.target.value; setMap((m) => { const n = { ...m }; if (v === '') delete n[f.id]; else n[f.id] = Number(v); return n; }); setPlan(null); }}>
                    <option value="">— não usar —</option>
                    {colOptions.map((c) => <option key={c.i} value={c.i}>{c.label}</option>)}
                  </select>
                  <span className="mt-1 block truncate text-xs text-mute">{map[f.id] !== undefined ? `ex.: ${show(sample[map[f.id]]) || '(vazio)'}` : f.hint ?? ''}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-2"><Button onClick={checkSheet} disabled={!ready}>Conferir</Button></div>
          </Card>
        )}

        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Avançado: colar pacote de importação</summary>
          <p className="mt-2 text-xs text-mute">Para pacotes preparados pelo suporte (formato técnico).</p>
          <textarea aria-label="Pacote de importação" className="input mt-2 min-h-[120px] font-mono text-xs" value={raw} onChange={(e) => { setRaw(e.target.value); setPlan(null); setDone(''); }} />
          <div className="mt-2"><Button variant="outline" onClick={checkRaw} disabled={!raw.trim() || !ready}>Conferir pacote</Button></div>
        </details>

        <ErrorNote error={err} />
        {done && <div className="rounded-lg border border-good/40 bg-good/10 p-3 text-sm text-good">Importação concluída: {done}. Confira em Central de clientes, Vendas e Influencers.</div>}

        {plan && (
          <Card title="3. Prévia" action={<Button onClick={run} disabled={!!progress || (!plan.clients.length && !plan.sales.length && !plan.influencers.length && !plan.clientUpdates.length)}>{progress || 'Importar'}</Button>}>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Clientes novas" value={plan.clients.length} sub={`${plan.skipped.clients} já existiam`} />
              <Stat label="Vendas novas" value={plan.sales.length} sub={`${plan.skipped.sales} já existiam`} />
              <Stat label="Influencers novas" value={plan.influencers.length} sub={`${plan.skipped.influencers} já existiam`} />
              <Stat label="Planos novos" value={plan.plans.length} sub="entram inativos" />
            </div>
            {plan.plans.length > 0 && <p className="mt-3 text-xs text-mute">Planos que serão criados: {plan.plans.map((p) => `${p.name} (${p.period})`).join(' · ')}. Se o período estiver errado, ajuste depois em Produtos e planos.</p>}
            {plan.sales.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-line"><th className="th">Cliente</th><th className="th">Plano</th><th className="th">Data</th><th className="th">Vencimento</th><th className="th">Valor</th><th className="th">Tipo</th></tr></thead>
                  <tbody>
                    {plan.sales.slice(0, 8).map((s) => (
                      <tr key={s.id} className="border-b border-line/60"><td className="td">{s.clientName}</td><td className="td">{s.planName}</td><td className="td">{fmtDate(s.date)}</td><td className="td">{fmtDate(s.endDate)}</td><td className="td">{fmtBRL2(s.gross)}</td><td className="td"><Badge>{s.kind === 'renovacao' ? 'Renovação' : s.kind === 'troca' ? 'Troca' : 'Nova'}</Badge></td></tr>
                    ))}
                  </tbody>
                </table>
                {plan.sales.length > 8 && <p className="mt-2 text-xs text-mute">e mais {plan.sales.length - 8} vendas.</p>}
              </div>
            )}
            {plan.influencers.length > 0 && <p className="mt-3 text-sm">{plan.influencers.map((i) => `${i.name} (@${i.handle})`).join(' · ')}</p>}
            {[...rowErrors, ...plan.warnings].length > 0 && (
              <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs">
                <div className="mb-1 font-medium">Linhas com problema ({rowErrors.length + plan.warnings.length}) — o resto importa normalmente:</div>
                {[...rowErrors, ...plan.warnings].slice(0, 15).map((w) => <div key={w}>{w}</div>)}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
