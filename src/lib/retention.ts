// Retenção: o que acontece com quem vence o plano (renova, negocia, pausa ou sai) e a fila de recall.
// Funções puras, testadas em tests/retention.test.ts.
import type { Client, Sale } from './types';
import { addDays, countable, daysBetween, monthBounds, saleKind } from './calc';

export type ChurnReason =
  | 'financeiro' | 'inadimplencia' | 'rotina' | 'resultado' | 'atendimento' | 'saude' | 'outro_profissional' | 'sozinha' | 'sem_resposta' | 'outro';

/** Motivo de saída + em quantos dias vale chamar de novo */
export const CHURN_REASONS: Record<ChurnReason, { label: string; recallDays: number }> = {
  financeiro: { label: 'Financeiro', recallDays: 60 },
  inadimplencia: { label: 'Parou de pagar as parcelas', recallDays: 45 },
  rotina: { label: 'Falta de tempo / rotina', recallDays: 45 },
  resultado: { label: 'Insatisfeita com o resultado', recallDays: 90 },
  atendimento: { label: 'Insatisfeita com o atendimento', recallDays: 120 },
  saude: { label: 'Saúde / gestação / lesão', recallDays: 60 },
  outro_profissional: { label: 'Foi para outro profissional', recallDays: 120 },
  sozinha: { label: 'Vai treinar sozinha', recallDays: 60 },
  sem_resposta: { label: 'Não respondeu', recallDays: 30 },
  outro: { label: 'Outro motivo', recallDays: 60 },
};

export type OutcomeStatus = 'negociando' | 'pausa' | 'nao_renovou';
export const OUTCOME_LABEL: Record<OutcomeStatus, string> = { negociando: 'Em negociação', pausa: 'Pausa', nao_renovou: 'Não renovou' };

export interface RenewalOutcome {
  /** Vencimento a que esta decisão se refere (se a aluna renovar, o vencimento muda e a decisão deixa de valer) */
  cycleEnd: string;
  status: OutcomeStatus;
  reason?: ChurnReason;
  note?: string;
  decidedAt: string;
  /** Em negociação: próximo contato */
  followUpAt?: string;
  /** Pausa: previsão de volta */
  returnAt?: string;
}

export interface Recall {
  /** Próximo contato de recall (vazio = não chamar mais) */
  nextAt?: string;
  attempts: number;
  lastAt?: string;
  /** Pediu para não ser mais contatada */
  optOut?: boolean;
  notes?: string;
}

export type RClient = Client & { outcome?: RenewalOutcome; recall?: Recall };

/** Dias de tolerância depois do vencimento até exigir uma decisão */
export const GRACE_DAYS = 7;

/** Decisão vale só para o ciclo atual */
export function currentOutcome(c: RClient): RenewalOutcome | undefined {
  return c.outcome && (c.outcome.cycleEnd === c.endDate || !c.endDate) ? c.outcome : undefined;
}

export interface BoardRow { client: RClient; daysLeft: number; outcome?: RenewalOutcome }

/** Painel de renovações do mês: quem vence, o que aconteceu com cada uma e os números */
export function renewalBoard(clients: RClient[], sales: Sale[], y: number, m: number, today: string, grace = GRACE_DAYS) {
  const { start, end } = monthBounds(y, m);
  const due = clients.filter((c) => !c.deleted && !c.isTest && c.endDate && c.endDate >= start && c.endDate <= end);
  const row = (c: RClient): BoardRow => ({ client: c, daysLeft: daysBetween(today, c.endDate!), outcome: currentOutcome(c) });
  const rows = due.map(row).sort((a, b) => (a.client.endDate! < b.client.endDate! ? -1 : 1));

  const aVencer: BoardRow[] = [];
  const semDecisao: BoardRow[] = [];
  const negociando: BoardRow[] = [];
  const perdidas: BoardRow[] = [];
  for (const r of rows) {
    const st = r.outcome?.status;
    if (st === 'nao_renovou' || st === 'pausa') perdidas.push(r);
    else if (st === 'negociando') negociando.push(r);
    else if (r.client.status !== 'ativo') perdidas.push(r); // inativada sem motivo registrado (ex.: histórico importado)
    else if (r.daysLeft >= 0) aVencer.push(r);
    else semDecisao.push(r);
  }
  const renovadas = sales
    .filter((s) => countable(s) && saleKind(s) === 'renovacao' && s.date >= start && s.date <= end)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const reasons = new Map<ChurnReason | 'sem_motivo', number>();
  for (const r of perdidas) {
    const k = r.outcome?.reason ?? 'sem_motivo';
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
  }
  const lastValue = (rs: BoardRow[]) => rs.reduce((a, r) => a + (r.client.lastValue ?? 0), 0);
  const total = renovadas.length + perdidas.length + aVencer.length + semDecisao.length + negociando.length;
  return {
    aVencer, semDecisao, negociando, perdidas, renovadas,
    /** passaram do prazo de tolerância sem decisão: precisam de atenção */
    atrasadas: semDecisao.filter((r) => -r.daysLeft > grace),
    renovadasValor: renovadas.reduce((a, s) => a + s.gross, 0),
    receitaEmAberto: lastValue([...aVencer, ...semDecisao, ...negociando]),
    receitaPerdida: lastValue(perdidas),
    /** renovadas ÷ (renovadas + perdidas + ainda em aberto) */
    taxaRenovacao: total ? renovadas.length / total : null,
    /** perdidas ÷ a mesma base: as duas taxas + as em aberto fecham 100% */
    taxaPerda: total ? perdidas.length / total : null,
    motivos: [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: k === 'sem_motivo' ? 'Sem motivo registrado' : CHURN_REASONS[k].label, n })),
  };
}

/** Data sugerida para o recall depois de uma saída */
export function suggestedRecall(o: Pick<RenewalOutcome, 'status' | 'reason' | 'returnAt'>, today: string): string {
  if (o.status === 'pausa' && o.returnAt) return addDays(o.returnAt, -7) > today ? addDays(o.returnAt, -7) : today;
  return addDays(today, CHURN_REASONS[o.reason ?? 'outro'].recallDays);
}

export interface RecallRow { client: RClient; reason?: ChurnReason; leftAt?: string; nextAt?: string; due: boolean; attempts: number }

/** Fila de recall (winning back): ex-alunas para chamar de novo */
export function recallList(clients: RClient[], today: string): RecallRow[] {
  return clients
    .filter((c) => !c.deleted && !c.isTest && c.status !== 'ativo' && c.status !== 'rascunho' && !c.recall?.optOut)
    .map((c) => {
      const o = currentOutcome(c);
      const nextAt = c.recall ? c.recall.nextAt : undefined;
      return { client: c, reason: o?.reason, leftAt: c.endDate, nextAt, due: !!nextAt && nextAt <= today, attempts: c.recall?.attempts ?? 0 };
    })
    .sort((a, b) => {
      if (a.due !== b.due) return a.due ? -1 : 1;
      if (a.nextAt && b.nextAt) return a.nextAt < b.nextAt ? -1 : 1;
      if (a.nextAt !== b.nextAt) return a.nextAt ? -1 : 1;
      return (b.leftAt ?? '') < (a.leftAt ?? '') ? -1 : 1;
    });
}

/** Mensagem de recall de acordo com o motivo da saída */
export function recallMessage(firstName: string, reason?: ChurnReason): string {
  const open = `Oi, ${firstName}! Tudo bem?`;
  switch (reason) {
    case 'inadimplencia': return `${open} Lembrei de você aqui. Sei que a parte das parcelas apertou e tá tudo bem. Se quiser retomar, me chama que a gente acha um formato que caiba no seu momento.`;
    case 'financeiro': return `${open} Lembrei de você aqui. Se a parte financeira estiver mais tranquila agora e fizer sentido voltar, me chama que a gente vê o plano que cabe melhor pra você.`;
    case 'rotina': return `${open} Como tá a rotina por aí? Se quiser retomar os treinos, a gente monta algo que encaixe no tempo que você tem hoje, mesmo que seja pouco.`;
    case 'saude': return `${open} Passando pra saber como você tá. Quando estiver liberada pra voltar, me chama que a gente recomeça no seu ritmo.`;
    case 'resultado':
    case 'atendimento': return `${open} Lembrei de você e queria entender melhor o que faltou na sua experiência com a gente. Sua opinião me ajuda muito, e se um dia quiser voltar, a porta tá aberta.`;
    default: return `${open} Faz um tempinho que você saiu e lembrei de você. Como tão os treinos? Se fizer sentido voltar, me chama que a gente vê o melhor jeito pra você agora.`;
  }
}
