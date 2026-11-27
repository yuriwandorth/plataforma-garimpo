// Gestão: OKR, atividades, diário e base de conhecimento.
export type KRStatus = 'nao-iniciado' | 'em-andamento' | 'concluido';
export const KR_LABEL: Record<KRStatus, string> = { 'nao-iniciado': 'Não iniciado', 'em-andamento': 'Em andamento', concluido: 'Concluído' };

export interface KeyResult { text: string; status: KRStatus; progress: number }
export interface Okr {
  id: string;
  objective: string;
  start: string;
  end: string;
  status: 'ativo' | 'encerrado';
  krs: KeyResult[];
  /** Meta de faturamento do ciclo (opcional) */
  revenueGoal?: number;
  createdAt: number;
  updatedAt: number;
}

/** Progresso geral do OKR: média dos KRs (concluído conta 100%) */
export function okrProgress(o: Pick<Okr, 'krs'>): number {
  if (!o.krs.length) return 0;
  return o.krs.reduce((a, k) => a + (k.status === 'concluido' ? 100 : k.progress || 0), 0) / o.krs.length / 100;
}

export type ActivityOrigin = 'manual' | 'okr' | 'reuniao';
export interface Activity {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  origin: ActivityOrigin;
  okrId?: string;
  done: boolean;
  doneAt?: string;
  createdAt: number;
  updatedAt: number;
}

export interface JournalEntry { id: string; title?: string; date: string; text: string; createdAt: number }

export interface KnowledgeInput { type: 'call' | 'anotacao' | 'processo'; title?: string; text: string; at: string; consolidated: boolean }
export interface KnowledgeSector {
  id: string;
  name: string;
  description: string;
  order: number;
  content: string;
  inputs: KnowledgeInput[];
  createdAt: number;
  updatedAt: number;
}
export const INPUT_LABEL = { call: 'Transcrição de call', anotacao: 'Anotação', processo: 'Processo' } as const;

export const DEFAULT_SECTORS = [
  { name: 'Vendas', description: 'Como conduzir o processo comercial: da abordagem ao fechamento.' },
  { name: 'Marketing', description: 'Posicionamento, canais e mensagens que geram demanda.' },
  { name: 'Pós-venda e sucesso', description: 'Onboarding, acompanhamento e retenção da aluna.' },
  { name: 'Operações e processos', description: 'Processos, ferramentas e responsabilidades do dia a dia.' },
  { name: 'Gestão e financeiro', description: 'Preços, controle financeiro e metas do negócio.' },
];
