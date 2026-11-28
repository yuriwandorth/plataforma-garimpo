// Base de conhecimento padrão para consultoria online de treino e dieta.
// Ponto de partida: cada setor vem com um roteiro que o dono ajusta à realidade dele. Trechos entre [colchetes] são para personalizar.

export interface SectorTemplate { name: string; description: string; content: string }

export const KNOWLEDGE_TEMPLATES: SectorTemplate[] = [
  {
    name: 'Vendas',
    description: 'Da primeira mensagem ao fechamento, incluindo follow-up e objeções.',
    content: `PROCESSO COMERCIAL

1. Entrada do lead
- Toda pessoa que chama no WhatsApp ou no direct vira lead na plataforma (Leads), com a origem: orgânico, influencer (cupom), indicação, campanha.
- Resposta em até [2 horas] no horário comercial.

2. Qualificação (primeira conversa)
- Entender: objetivo, rotina (trabalho, filhos, faculdade), histórico (já tentou o quê?), o que a impediu antes.
- Perguntas-chave: "O que você quer mudar em 3 meses?", "O que já tentou e por que não continuou?", "Quanto tempo por dia consegue treinar?".
- Não mandar preço antes de entender a pessoa.

3. Apresentação da oferta
- Apresentar o plano que resolve o problema dela, não todos os planos. Ancorar no anual, recomendar o que faz sentido.
- Mostrar prova: resultado de aluna com perfil parecido (com autorização de uso de imagem).
- Enviar o link de pagamento da plataforma (Checkout e pedidos). Com cupom, usar o link com &cupom=.

4. Objeções mais comuns e resposta
- "Não tenho tempo": treino ajustado à rotina real, 3x por semana já dá resultado.
- "Já tentei de tudo": o que faltou foi acompanhamento e ajuste, não força de vontade.
- "Está caro": comparar com o custo de continuar como está; parcelamento em até 12x.
- "Vou pensar": combinar data para retomar e registrar o follow-up.

5. Follow-up
- Sem resposta: chamar em 1 dia, 3 dias e 7 dias. Depois, campanha de reativação.
- Registrar cada contato no lead ("Chamei") para a plataforma calcular o próximo.

6. Fechamento
- Pagamento confirmado na plataforma → mensagem de boas-vindas → onboarding (setor Pós-venda).

Indicadores do setor: leads por semana, conversão por canal, tempo até comprar, ticket médio.`,
  },
  {
    name: 'Marketing',
    description: 'Conteúdo, posicionamento, influencers e embaixadoras.',
    content: `POSICIONAMENTO
- Público: mulheres de 18 a 40 anos que treinam ou querem treinar, com rotina corrida.
- Promessa: [resultado + prazo realista], com treino de verdade, sem dieta de fome.
- Tom: técnico, direto, com humor e a vida real das alunas.

PILARES DE CONTEÚDO (semana-tipo)
- Técnica: execução, progressão de carga, mitos de treino e dieta.
- Prova: feedbacks, antes e depois (sempre com autorização escrita), conquistas pequenas.
- Bastidores: rotina, grupo das alunas, perrengues resolvidos.
- Conversão: chamada para o direct com palavra-chave, oferta com prazo.

INFLUENCERS
- Funil na plataforma: A prospectar → Prospectando → Em negociação → Fechado.
- Toda influencer fechada tem cupom próprio (10% padrão) e link com &cupom=.
- Permuta de teste: [3 meses]. Avaliar no fim: leads, vendas e entregas (stories e reels).

EMBAIXADORAS
- Convidar alunas engajadas e com resultado. Benefícios combinados ficam no cadastro dela.
- Toda venda indicada deve ter "Indicado por" preenchido.

Indicadores do setor: alcance e conversas geradas por conteúdo, leads por influencer, indicações por mês.`,
  },
  {
    name: 'Pós-venda e sucesso',
    description: 'Onboarding, acompanhamento, renovação e recall.',
    content: `ONBOARDING (primeiros 7 dias)
1. Pagamento confirmado → mensagem de boas-vindas em até [2 horas].
2. Envio da anamnese (formulário). Cobrar se não responder em 48 h.
3. Treino e dieta entregues em até [5 dias úteis] depois da anamnese completa.
4. Entrada no grupo das alunas, com apresentação.
5. Check-in no dia 7: "Conseguiu começar? Alguma dúvida no treino?".

ACOMPANHAMENTO
- Feedback [semanal/quinzenal] pelo formulário. Ajustar o protocolo pelo feedback.
- Aluna sumida há mais de [10 dias]: mensagem individual, sem cobrança, com interesse genuíno.

RENOVAÇÃO (tela Renovações)
- 30 dias antes do vencimento: conversa de resultado (o que já conquistou, o que vem a seguir).
- 15 dias antes: proposta de renovação com o próximo plano.
- Vencimento: link de renovação.
- Todo vencimento precisa de destino: renovou, em negociação, pausa ou não renovou (com motivo).

RECALL DE EX-ALUNAS
- Quem sai entra na fila de Recall com a data sugerida pelo motivo.
- Mensagem leve e pessoal. Quem pedir para não ser chamada sai da lista.

Indicadores do setor: taxa de renovação, motivos de saída, tempo de entrega do protocolo, recall reativadas.`,
  },
  {
    name: 'Operações e processos',
    description: 'Entrega do serviço, ferramentas e responsabilidades.',
    content: `FERRAMENTAS
- Plataforma Garimpo: clientes, vendas, renovações, leads, checkout, metas e gestão.
- [Treino.io]: montagem e entrega de treino e dieta.
- WhatsApp + Waspeed: conversas, etiquetas e campanhas.
- InfinitePay: pagamentos.

RESPONSABILIDADES (ajuste aos papéis do seu time)
- Treinador: montagem e ajuste de treino, análise de execução.
- Nutricionista: dieta, ajustes alimentares, validação de alimentos novos.
- Médico parceiro (planos completos): consulta, exames e prescrições.
- Sucesso da aluna (CS): onboarding, check-ins, renovação, grupo.

ENCAMINHAMENTO MÉDICO (planos com médico)
1. Aluna do plano com médico → agendar consulta em até [7 dias].
2. Enviar ao médico um resumo da anamnese (com consentimento da aluna).
3. Retorno do médico registrado e aplicado ao protocolo pelo treinador e pela nutricionista.

PRAZOS
- Resposta no WhatsApp: [até 2 h úteis]. Protocolo: [5 dias úteis]. Ajuste por feedback: [3 dias úteis].

Escalonamento de problemas: [canal do time] com o formato: aluna · problema · o que já foi feito · o que precisa.`,
  },
  {
    name: 'Gestão e financeiro',
    description: 'Preços, metas, indicadores e rotina de gestão.',
    content: `ROTINA SEMANAL (segunda de manhã)
- Desempenho: faturamento da semana por canal e comparação com a semana anterior.
- Metas por canal: está no ritmo do mês?
- Renovações: quem vence nos próximos 30 dias e quem está sem destino.
- Cobranças: parcelas em atraso.
- OKR: atualizar os números dos resultados-chave.

ROTINA MENSAL
- Fechamento do mês: faturamento, vendas novas, renovações, taxa de renovação, motivos de saída.
- Comissões de influencers e recompensas de embaixadoras.
- Emissão das notas fiscais.
- Ranking do negócio (a cada 15 dias).

PREÇOS
- Reajuste anual em [janeiro]. Promoções com prazo definido e cupom rastreável.
- Desconto só com motivo registrado (cupom, embaixadora, condição especial anotada na venda).`,
  },
  {
    name: 'Jurídico e LGPD',
    description: 'Contrato, termos, dados das alunas e uso de imagem.',
    content: `PONTOS DE ATENÇÃO (revise com um advogado)

Contrato e termos
- Toda compra aceita os termos do acompanhamento (checkout da plataforma guarda uma cópia do texto aceito).
- Direito de arrependimento: 7 dias para compra online (CDC, art. 49).
- Política de cancelamento e reembolso escrita e igual para todas.

Dados das alunas (LGPD)
- Anamnese tem dados de saúde, que são dados sensíveis: pedir consentimento específico e guardar só o necessário.
- Acesso aos dados só para quem precisa (use as permissões do Time na plataforma).
- Pedido de exclusão: atender e registrar.

Uso de imagem e depoimentos
- Antes e depois e prints de conversa só com autorização escrita da aluna.

Limites de atuação
- Treinador prescreve treino; dieta é da nutricionista; prescrição médica é do médico.

[Liste aqui o contato do seu advogado e as datas de revisão dos documentos.]`,
  },
];
