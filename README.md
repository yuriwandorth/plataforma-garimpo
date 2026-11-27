# Plataforma Garimpo · Fase 1

Gestão interna da consultoria: clientes, renovações, produtos e planos, vendas, metas por canal, painel, desempenho, time e configurações.

## O que já funciona

| Tela | O que faz |
| --- | --- |
| Painel | Meta da semana, clientes ativos, renovações em 30 dias, progresso por canal, próxima conquista, últimas vendas |
| Desempenho | Faturamento líquido, vendas, ticket médio, clientes ativos e novos (comparando com o mês anterior), gráfico de 12 meses, por canal, por vendedor, taxa de renovação, mix de planos |
| Central de clientes | Lista com filtros por situação, canal, vendedor e plano; ficha com cadastro, plano e vendas, indicações; cliente de teste; excluir e restaurar; exportar CSV |
| Renovações | Quem vence em 15/30/60/90 dias, botão de WhatsApp com mensagem pronta, marcar contato |
| Vendas | Lançar, editar e estornar vendas; totais do mês; exportar CSV |
| Metas por canal | Meta mensal em 4 semanas por canal, realizado automático pelas vendas, ajuste manual, status em dia/atrasado |
| Produtos e planos | Produtos (o que inclui), planos com período, preço, pagamento, parcelas; duplicar e arquivar |
| Time | Convidar pessoas por e-mail, cargo, vendedor, desligar acesso |
| Configurações | Nome, canais de venda, marcos de faturamento, dados de exemplo |

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
| `npm test` | Conferir os cálculos dos indicadores (15 testes) |
| `npm run deploy` | Publicar o site |
| `npx firebase deploy --only firestore:rules` | Publicar as regras de novo, se eu mudar o arquivo `firestore.rules` |

## O que vem nas próximas etapas

- **Fase 1 (resto):** OKR e atividades, agenda, base de conhecimento com IA, importação de planilha.
- **Fase 2:** influencers (funil, comissão por faixa, permuta de 3 meses, painel da influencer), embaixadoras, checkout com webhooks, área da aluna (anamnese e feedbacks), notificações.
- **Fase 3:** venda para outros profissionais (várias consultorias, painel de mentor, montador de treino e dieta).

## Limites desta versão

- As vendas são lançadas à mão; o checkout integrado vem na Fase 2.
- "Enviar acesso ao app" só fica registrado; o envio do convite chega com a área da aluna.
- Permissões do time: quem é do time vê e edita clientes, vendas, planos e metas; só o(a) dono(a) mexe em time, canais e configurações e apaga vendas. Permissão por cargo vem depois.
- As regras de segurança foram revisadas, mas não puderam ser testadas no emulador do Firebase no ambiente onde a plataforma foi feita. O teste do passo 5 (criar conta, carregar exemplos, lançar uma venda) confirma que estão funcionando.
