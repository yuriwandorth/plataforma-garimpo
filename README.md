# Plataforma Garimpo · Fase 1

Gestão interna da consultoria: clientes, renovações, produtos e planos, vendas, metas por canal, painel, desempenho, time e configurações.

## O que já funciona

| Área | Tela | O que faz |
| --- | --- | --- |
| Visão | Painel | OKR atual, atividades pendentes, meta da semana, clientes ativas, renovações, progresso por canal, próxima conquista, últimas vendas |
| Visão | Desempenho | Faturamento líquido, vendas, ticket, ativas e novas vs mês anterior; 12 meses; por semana e por canal com maior queda; hunter × farmer; MRR; renovações; taxa de ascensão; planos e vendedores |
| Clientes | Central de clientes | Filtros, ficha (cadastro, plano e vendas, indicações), renovar, trocar de plano, cliente de teste, excluir/restaurar, CSV |
| Clientes | Renovações | Por mês de referência: a renovar, realizadas, receita estimada, vencidas, taxa; WhatsApp e "Marcar renovado" |
| Clientes | Cobranças | Sinal + restante e parcelado: a receber, recebidas, inadimplência, saldo em aberto; "Marcar recebido" |
| Comercial | Vendas | Nova venda, renovação ou troca de plano; forma de recebimento; influencer e indicação; CSV |
| Comercial | Checkout e pedidos | Link de pagamento por plano (InfinitePay, Pix ou cartão até 12x); a aluna aceita os termos e paga; a plataforma confere o pagamento na InfinitePay; um clique cria a aluna e a venda; lista de quem não pagou para chamar no WhatsApp |
| Comercial | Metas por canal | Meta mensal em 4 semanas por canal, realizado automático + ajuste manual |
| Comercial | Campanhas | Data, oferta, preços, meta e plano de ação por canal com táticas; realizado do período; resultado |
| Comercial | Produtos, planos e Ofertas | Planos e o construtor de oferta em 5 passos com texto para WhatsApp |
| Comercial | Influencers | Funil, modelos de comissão por faixa, permuta com teste de 3 meses e checklist, painel mensal com comissão automática |
| Comercial | Embaixadoras | Ranking mês/tudo por volume ou receita, negociação (mais meses, comissão, desconto), radar e mapa de oportunidades |
| Comercial | Ranking do negócio | Autoavaliação 1–4 em 5 áreas e 25 pilares, nível e histórico |
| Gestão | OKR, Atividades, Base de conhecimento, Diário, Time, Configurações | Objetivo e KRs com progresso; tarefas; manual por setor com insumos; diário privado; convites; canais hunter/farmer |

Regras dos números: só vendas **aprovadas** de clientes que **não são de teste** entram nos indicadores. Semanas do mês: S1 dias 1–7, S2 8–14, S3 15–21, S4 22 até o fim. Fuso de Recife.

## Antes de começar: use um projeto do Firebase NOVO

Não use o mesmo projeto do seu painel de CS. O passo 4 publica regras de segurança no banco, e isso **substituiria as regras do painel de CS**, podendo travá-lo. Um projeto novo é grátis e evita isso.

## Passo a passo (uma vez só)

**1. Instale o Node.js** (versão 20 ou mais nova): baixe em nodejs.org, opção "LTS", e instale clicando em Avançar.

**2. Crie o projeto no Firebase**
1. Entre em console.firebase.google.com › Adicionar projeto › nome `plataforma-garimpo` (pode desligar o Google Analytics).
2. Menu **Authentication** › Começar › ative **E-mail/senha** e **Google**.
3. Menu **Firestore Database** › Criar banco de dados › local `southamerica-east1 (São Paulo)` › modo produção.
4. Engrenagem › **Configurações do projeto** › em "Seus apps" clique no ícone **</>** (Web) › dê um nome › Registrar. Vai aparecer um bloco `firebaseConfig` com apiKey, authDomain etc. Deixe essa tela aberta.

**3. Configure e rode no seu computador**
1. Descompacte o .zip numa pasta (ex.: Documentos/plataforma-garimpo).
2. Dentro da pasta, copie o arquivo `.env.example` e renomeie a cópia para `.env.local`. Abra no Bloco de Notas e cole cada valor do `firebaseConfig` na linha correspondente. Salve.
3. Abra o Terminal (Mac) ou PowerShell (Windows) **dentro da pasta** e rode:
   ```
   npm install
   ```
   (só na primeira vez; demora uns minutos)

**4. Publique as regras de segurança** (sem isso o login funciona mas nada salva)
```
npx firebase login
npx firebase use --add
```
Escolha o projeto `plataforma-garimpo` e dê o apelido `default`. Depois:
```
npx firebase deploy --only firestore:rules
```

**5. Abra a plataforma**
```
npm run dev
```
Acesse http://localhost:3000 no navegador. Crie sua conta, dê o nome da consultoria e pronto.

Para testar sem medo: **Configurações › Carregar dados de exemplo** cria 60 clientes fictícios com 12 meses de vendas. Depois, **Apagar dados de exemplo** remove só eles.

## Colocar no ar (link para acessar de qualquer lugar)

```
npm run deploy
```
O endereço aparece no fim (algo como `plataforma-garimpo.web.app`). Depois disso, no Firebase › Authentication › Configurações › **Domínios autorizados**, confirme que esse endereço está na lista (para o login com Google).

## Subir para o GitHub

Crie um repositório **privado** no GitHub e envie a pasta inteira. O arquivo `.env.local` não sobe (está no `.gitignore`); quem clonar precisa criar o próprio.

## Comandos úteis

| Comando | Para quê |
| --- | --- |
| `npm run dev` | Rodar no computador |
| `npm test` | Conferir os cálculos dos indicadores (48 testes) |
| `npm run deploy` | Publicar o site |
| `npx firebase deploy --only firestore:rules` | Publicar as regras de novo, se eu mudar o arquivo `firestore.rules` |

## Checkout: como ativar

1. No painel da InfinitePay (Conta Web), em **Configurações do Checkout**, ligue **Habilitar checkout integrado**. Ali também ficam as regras de parcelamento e de repasse de juros.
2. Em **Configurações** da plataforma, preencha a InfiniteTag (sem o $) e o WhatsApp da consultoria.
3. Em **Checkout e pedidos**, crie um link por plano e copie. Acrescente `&cupom=CODIGO` para o desconto já vir aplicado, ou `&ref=nome` só para marcar a origem.
4. Cupons: o cupom cadastrado na influencer vira cupom de desconto sozinho (10% por padrão) quando a parceria está fechada. Cupons avulsos ficam na aba **Cupons**.
5. Faça uma compra de teste de R$ 1,00 (a InfinitePay não tem ambiente de teste) e depois estorne pelo app.

Sem servidor, a confirmação depende de a aluna voltar para a página de obrigado. Se ela fechar a página antes, o pedido fica em "Não pagaram": confira no app da InfinitePay e use "Recebi por fora". A confirmação automática por webhook precisa do plano pago do Firebase (Blaze).

## O que vem nas próximas etapas

- **Próximas:** área da aluna (anamnese e feedbacks), funções com IA (campanhas, base de conhecimento, importação de planilha), notificações, confirmação de pagamento por webhook.
- **Depois:** venda para outros profissionais (várias consultorias, painel de mentor). Treino e dieta continuam no treino.io.

## Limites desta versão

- Vendas fora do checkout continuam lançadas à mão em Vendas.
- Os termos padrão do checkout são um resumo para revisar com um advogado.
- "Enviar acesso ao app" só fica registrado; o envio do convite chega com a área da aluna.
- Permissões do time: quem é do time vê e edita clientes, vendas, planos e metas; só o(a) dono(a) mexe em time, canais e configurações e apaga vendas. Permissão por cargo vem depois.
- As regras de segurança foram revisadas, mas não puderam ser testadas no emulador do Firebase no ambiente onde a plataforma foi feita. O teste do passo 5 (criar conta, carregar exemplos, lançar uma venda) confirma que estão funcionando.
