# Que dados o Pluggy entrega via Open Finance?

Pesquisa do ticket [#3](https://github.com/Kaioabreu/financas/issues/3), feita em 2026-11-08. O foco é o caminho que o app vai usar: o **conector MeuPluggy (id 200)**, com a aplicação Pluggy de cada usuário, como definido em [#2][sib].

**Fontes primárias:**

- a documentação da Pluggy (docs.pluggy.ai, incluindo o changelog e o OpenAPI);
- os tipos do SDK oficial `pluggy-node`;
- o repositório oficial `pluggyai/meu-pluggy`, onde as respostas do fundador da Pluggy contam como posição oficial;
- as especificações OpenAPI oficiais do Open Finance Brasil;
- o normativo do Banco Central.

**Relatos da comunidade** estão marcados com **[comunidade]** e não valem como posição oficial. **[inferência]** marca as conclusões minhas que nenhuma fonte afirma diretamente.

## Resposta curta

- **Tudo chega como dado Open Finance, pelo proxy MeuPluggy.** O item do app espelha a conexão que o usuário fez dentro do Meu Pluggy, que atualiza a cada 24 h ([docs: uso pessoal][d-mp]). O conector MeuPluggy entrega identidade, contas, cartões, transações, dados de pagamento, investimentos e transações de investimento. **Empréstimos não** ([docs: cobertura][d-cov]).
- **Histórico de transações: 12 meses para trás**, contados da criação da conexão. Isso vale para conta, cartão e investimentos ([docs: transações][d-tx], [docs: limites OF][d-ofrl], [spec OF: contas][ofb-acc]).
- **Endpoint de transações: `GET /v2/transactions`**, com paginação por cursor. O `GET /transactions` (v1) será removido depois de 31/12/2026 ([OpenAPI][oas]). Os campos são os mesmos nas duas versões. O v2 não tem filtro por `billId` nem total de registros (§3).
- **Investimentos: só a posição atual mais 12 meses de movimentações.** Não há histórico de posição nem de rentabilidade. No Open Finance, `amountProfit` e as taxas de rentabilidade vêm `null` ([docs: investimentos][d-inv]). **A evolução do patrimônio precisa ser montada com snapshots locais.**
- **Categorias:** são uma taxonomia em árvore, com tradução para português ([docs: categorização][d-cat]). Oficialmente, categorização é recurso **pago**, e "the free plan covers data access" ([docs: contato][d-contact]). Mesmo assim, no conector MeuPluggy a categoria vem preenchida em ~100% das transações **[comunidade]** ([open-finance-pessoal][com-ofp]). É um bom ponto de partida, mas não é garantido.
- **Marcações que existem:**
  - transferência para a mesma titularidade, pela categoria "Same person transfer" e pelo CPF da contraparte em `paymentData`;
  - pagamento de fatura, por `operationType: PAGAMENTO_FATURA` e pela categoria "Credit card payment";
  - parcela, por `installmentNumber`/`totalInstallments`/`purchaseDate`.

  **Não existe** um id que agrupe as parcelas de uma mesma compra, e o valor total da compra não vem no Open Finance ([docs: parcelas][d-inst], [docs: OF vs direto][d-ofvsd]).
- **Faturas:** trazem vencimento (`dueDate`), fechamento (`billClosingDate`, desde jul/2026), total, mínimo, encargos e pagamentos ([SDK: faturas][sdk-bill], [changelog 2026.07][cl-2026-07]). A fatura só aparece quando **fecha** (ou vence, conforme o banco). Compras do ciclo aberto vêm `PENDING`, sem `billId` ([docs: considerações OF][d-offaq]).
- **Instituições do autor:**
  - **Nubank:** só por Open Finance.
  - **BTG:** a conta e o cartão só por Open Finance; o conector direto do BTG é só de investimentos.
  - **Mercado Pago:** por Open Finance ou direto.

  Há lacunas relatadas: **caixinhas do Nubank (RDB) não aparecem** ([meu-pluggy#28][mp-28]) e **Cofrinhos do Mercado Pago não aparecem** ([meu-pluggy#22][mp-22]).
- **Contas de benefício:** **não há suporte documentado.** O modelo de contas da Pluggy só tem conta corrente, poupança e cartão ([SDK: contas][sdk-acc]). Desde 2023, os arranjos de vale-alimentação/refeição estão **fora do Sistema de Pagamentos Brasileiro** ([Resolução BCB 289/2023][bcb-289]). **[inferência]** Por isso, o cartão BTG Benefícios provavelmente não é compartilhado por Open Finance. Precisa ser verificado com os dados reais do autor.

## 1. O caminho: conector MeuPluggy sobre conexões Open Finance

- **Cada banco conectado no Meu Pluggy vira um item proxy na aplicação do usuário.** O item proxy "reflects every update of the original Item automatically", não roda sync próprio e não aceita atualização manual ([docs: Item][d-item]). A conexão original atualiza **a cada 24 h** ([docs: Item][d-item], [guia Meu Pluggy][mp-guide]). Isso foi confirmado pelo fundador da Pluggy ([meu-pluggy#3][mp-3]).
- **Produtos do conector MeuPluggy** ([docs: cobertura][d-cov]):

  | Produto | Disponível |
  |---|---|
  | Identity | Sim |
  | Accounts | Sim |
  | Credit Cards | Sim |
  | Transactions | Sim |
  | Payment Data | Sim |
  | Investments | Sim |
  | Investment Transactions | Sim |
  | Loans | **Não** |

  **[comunidade]** O endpoint `/loans` respondeu (vazio) em itens MeuPluggy ([meu-pluggy-guide][com-gg]).
- **A conexão original é Open Finance.** O README oficial diz que "most of the financial institution support the official Open Finance connectivity" ([README meu-pluggy][mp-readme]). A Pluggy está **descontinuando os conectores diretos para pessoa física** (Bradesco PF e Itaú PF já saíram) ([changelog 2026.07][cl-2026-07], [changelog 2026.08][cl-2026-08]). **[inferência]** Para o app, convém tratar todo dado como Open Finance.
- **Diferenças observadas no proxy [comunidade]**, verificadas ao vivo em out/2026 com Bradesco, Santander, C6 e XP ([open-finance-pessoal][com-ofp]):
  - todo item aparece com `connector.id = 200`, e o banco real só se reconhece pelo código COMPE em `bankData.transferNumber`;
  - **`providerId` não vem** no conector MeuPluggy, então a reconciliação usa `providerCode`;
  - `GET /transactions` (v1) responde 410, e só `GET /v2/transactions` (cursor) funciona. Isso bate com a descontinuação oficial do v1 em 31/12/2026 (ver §3).
- **Atraso:** no Open Finance, transações novas podem levar até 24 h para ficar disponíveis ([docs: FAQ][d-faq]). Somado ao ciclo de 24 h do Meu Pluggy, **[inferência]** isso dá até ~48 h. **[comunidade]** "Dados chegam com atraso de alguns dias" ([open-finance-pessoal][com-ofp]).
- **Limites operacionais do Open Finance** (por CPF, instituição e produto, por mês) ([docs: limites OF][d-ofrl]):
  - histórico de transações (7 a 365 dias): **4/mês**;
  - transações recentes: 240/mês;
  - faturas: 30/mês;
  - saldo de investimento: 120/mês.

  Com uma conexão por banco e sync diário, eles não são atingidos ([docs: limites OF][d-ofrl]). Reconectar o mesmo banco várias vezes no mês esgota o histórico ([docs: parcelas][d-inst]).

## 2. Contas

**Campos** ([docs: contas][d-acc], [SDK: contas][sdk-acc]):

| Campo | O que traz |
|---|---|
| `type` | `BANK` ou `CREDIT` |
| `subtype` | Só `CHECKING_ACCOUNT`, `SAVINGS_ACCOUNT` ou `CREDIT_CARD` |
| `number`, `name`, `marketingName`, `owner`, `taxNumber` | Identificação da conta |
| `balance`, `currencyCode` | Saldo atual |
| `bankData` | `transferNumber`, `closingBalance`, `automaticallyInvestedBalance`, cheque especial, `hasReservedBalance`/`reservedBalances` |
| `creditData` | Ver abaixo |

`creditData` traz:

- `balanceCloseDate` e `balanceDueDate` do ciclo atual;
- `creditLimit` e `availableCreditLimit`;
- `minimumPayment`;
- `brand` e `level`;
- `holderType` e `additionalCards`;
- `disaggregatedCreditLimits`.

**Saldo**

- `balance` é o saldo disponível ([docs: contas][d-acc]).
- No Open Finance, `closingBalance` é igual a `balance` mais o valor bloqueado ([docs: contas][d-acc]).
- No cartão via Open Finance, `balance` é o limite usado ([docs: contas][d-acc]).
- `reservedBalances` traz valores reservados, como "caixinhas" ou bloqueio judicial ([SDK: contas][sdk-acc], [changelog 2026.06][cl-2026-06]).

**Histórico:** **não há histórico de saldo.** A API não tem endpoint de saldo passado ([OpenAPI][oas]). O saldo por transação (`balance`) só vem em conectores diretos de Itaú PJ e Bradesco PJ ([docs: transações][d-tx], [docs: OF vs direto][d-ofvsd]).

## 3. Transações

### Endpoint: `GET /v2/transactions` (o v1 sai em 31/12/2026)

- **O v1 está com data para sair.** `GET /transactions` está `deprecated` e "will be available only until **2026-12-31**, after which it will be removed. Please migrate to `GET /v2/transactions`" ([OpenAPI][oas], [docs: referência v1][ref-v1], [docs: conceitos básicos][d-basic]).
  - Contas criadas a partir de jun/2026 já usam o v2 por padrão ([changelog 2026.06][cl-2026-06], [changelog 2026.09][cl-2026-09]).
  - **[comunidade]** No Meu Pluggy, o v1 já responde 410 ([open-finance-pessoal][com-ofp]).
  - **O app deve usar só o v2.**
- **Os campos não mudam.** As duas respostas usam o mesmo schema `Transaction`. Muda só o envelope: `PageResponseTransactions` (`results`, `page`, `total`, `totalPages`) no v1 e `CursorPageResponseTransactions` (`results`, `next`) no v2 ([OpenAPI][oas]).
- **Diferenças entre v1 e v2** ([OpenAPI][oas], [docs: referência v2][ref-v2], [docs: conceitos básicos][d-basic]):

  | | `GET /transactions` (v1, sai em 2026-12-31) | `GET /v2/transactions` |
  |---|---|---|
  | Paginação | Por página: `page`, `pageSize` (máx. 500), com `total`/`totalPages` | Por cursor: a resposta traz `next`, uma query string pronta para colar no caminho (`GET /v2/transactions{next}`), ou `null` na última página. **Não informa total.** O `after` é opaco: "Never build or decode `after` yourself". |
  | Filtro por data | `from` / `to` | `dateFrom` / `dateTo` (data ≥ / ≤) |
  | Filtro por criação | `createdAtFrom` | `createdAtFrom`, que **não pode ser combinado com `dateFrom`** |
  | Filtro por ids | `ids` (máx. 500; ignora `from`/`to`) | `ids` separados por vírgula (máx. 500) |
  | Filtro por fatura | **`billId`** | **Não existe.** Para listar as transações de uma fatura, é preciso filtrar localmente por `creditCardMetadata.billId`. |
  | Tamanho de página | Escolhido pelo cliente (`pageSize` ≤ 500) | Não é parâmetro. **[comunidade]** É fixo: 200 com `dateFrom`, 500 sem. `page`, `pageSize`, `from` e `to` respondem 400 ([open-finance-pessoal][com-ofp]). |

- **Profundidade do histórico:** nenhuma fonte diz que ela muda entre v1 e v2. Os dois leem as transações que a Pluggy guardou do item. O que define a profundidade é a sincronização: 12 meses na criação, ver abaixo ([docs: Item][d-item], [docs: limites OF][d-ofrl]). **[inferência]** O v2 devolve o mesmo histórico que o v1.

**Campos** do `Transaction`, iguais nas duas versões ([docs: transações][d-tx], [SDK: transações][sdk-tx], [OpenAPI][oas]):

| Campo | O que traz |
|---|---|
| `id`, `accountId` | Identificadores Pluggy |
| `date`, `description`, `descriptionRaw` | Data e descrição |
| `amount`, `amountInAccountCurrency`, `currencyCode` | Valor |
| `type` | `DEBIT` ou `CREDIT` |
| `status` | `PENDING` ou `POSTED` |
| `category`, `categoryId` | Categoria |
| `operationType`, `operationTypeAdditionalInfo` | Tipo de operação |
| `paymentData` | Pagador e recebedor, com nome, conta e CPF/CNPJ |
| `creditCardMetadata` | Só em transações de cartão |
| `merchant` | Recurso pago |
| `providerCode`, `providerId` | Ids do banco (`providerId` só em Open Finance) |
| `order` | Posição da transação dentro do mesmo dia |
| `createdAt`, `updatedAt` | Datas de registro na Pluggy |

**`operationType` no Open Finance** ([docs: transações][d-tx]):

- **Conta:** `TED`, `DOC`, `PIX`, `TRANSFERENCIA_MESMA_INSTITUICAO`, `BOLETO`, `CONVENIO_ARRECADACAO`, `PACOTE_TARIFA_SERVICOS`, `TARIFA_SERVICOS_AVULSOS`, `FOLHA_PAGAMENTO`, `DEPOSITO`, `SAQUE`, `CARTAO`, `ENCARGOS_JUROS_CHEQUE_ESPECIAL`, `RENDIMENTO_APLIC_FINANCEIRA`, `PORTABILIDADE_SALARIO`, `RESGATE_APLIC_FINANCEIRA`, `OPERACAO_CREDITO`, `OUTROS`.
- **Cartão:** `PAGAMENTO`, `PAGAMENTO_FATURA`, `TARIFA`, `OPERACOES_CREDITO_CONTRATADAS_CARTAO`, `ESTORNO`, `CASHBACK`, `OUTROS`.
- **Não há tipo "aplicação".** Só existem "rendimento" e "resgate".

**Quanto histórico**

| Caminho | Profundidade | Fonte |
|---|---|---|
| Open Finance: conta (depósito, poupança, pré-paga) | A spec permite consulta de "12 meses no passado mais 12 meses no futuro". A Pluggy busca de 7 a 365 dias na criação e a cada 7 dias. | [spec OF: contas][ofb-acc], [docs: limites OF][d-ofrl] |
| Open Finance: cartão | "últimos 12 meses", mais 7 dias de recentes e as transações por fatura | [spec OF: cartões][ofb-cc], [docs: parcelas][d-inst] |
| Open Finance: transações de investimento | 7 a 365 dias | [docs: limites OF][d-ofrl] |
| Pluggy em geral | "Retrieve up to 12 months"; "up to the last 365 days" na criação do item | [docs: transações][d-tx], [docs: Item][d-item] |
| Diretos (não se aplicam aos bancos do autor) | Variam por conector. Exemplos: Santander PJ, 90 dias; XP direto, 4 anos de transações de investimento contra 1 ano no Open Finance. | [docs: cobertura de contas][d-acccov], [docs: considerações OF][d-offaq] |

Pontos que não estão claros:

- **O histórico além de 12 meses se acumula?** Nenhuma fonte diz se a Pluggy apaga do item as transações que saem da janela de 365 dias. O README oficial diz que os dados ficam guardados "for you to keep track even after account its closed" ([README meu-pluggy][mp-readme]). **Não confirmado.**
- **Reconectar cria um item novo, com ids novos**, e a Pluggy não deduplica entre items ([docs: transações][d-tx]). Ao renovar a autorização anual do Meu Pluggy, "do not assume the same itemId" ([docs: uso pessoal][d-mp]).

**Estabilidade dos ids** ([docs: transações][d-tx], [docs: ciclo do cartão][d-cycle]):

- `PENDING` → `POSTED` mantém o id.
- Mudança grande de data, valor ou descrição vira *delete* + *create* com id novo, sem vínculo entre os dois.
- Uma transação pode sumir e reaparecer.
- `providerId` é o único id estável, e não viria no proxy **[comunidade]** ([open-finance-pessoal][com-ofp]).

**`PENDING`** cobre ([docs: transações][d-tx], [docs: considerações OF][d-offaq]):

- compra do ciclo aberto do cartão;
- parcela futura;
- transação bloqueada ou em processamento na conta;
- pagamento agendado (data futura, em alguns bancos).

## 4. Categorização

- **A taxonomia é uma árvore** de até 3 níveis, com ids de 8 dígitos (ex.: `05080000` "Transfer - TED", filha de `05000000` "Transfers") ([docs: categorização][d-cat]). `GET /categories` traz `descriptionTranslated` em português e `parentId` ([docs: categorização][d-cat], [OpenAPI][oas]).
- **Nível 1** ([docs: categorização][d-cat]): Income, Loans and Financing, Investments, Same person transfer, Transfers, Legal obligations, Services, Shopping, Digital services, Groceries, Food and drinks, Travel, Donations, Gambling, Taxes, Bank fees, Housing, Healthcare, Transportation, Insurance, Leisure.
- **Disponibilidade oficial:**
  - "requires **Pro** subscription level" ([docs: transações][d-tx]);
  - "enabled by default during trial period. After that, it is an opt-in premium feature" ([docs: categorização][d-cat]);
  - "**Data intelligence** — categorization, enrichment, merchants […] — is part of the paid plans only" ([docs: contato][d-contact]).
- **Disponibilidade observada no MeuPluggy [comunidade]:**
  - "`category` vem preenchida em ~100% das linhas" ([open-finance-pessoal][com-ofp]);
  - `category`/`categoryId` e `merchant.businessName` presentes com Nubank, C6 e BTG ([meu-pluggy-guide][com-gg]).
  - **[inferência]** O proxy deve repassar a categoria que o Meu Pluggy calcula para o próprio app dele, que mostra "Gastos por Categoria" ([meu.pluggy.ai][mp-home]). **Não documentado: pode mudar.**
- **Correção de categoria:** existem `PATCH /transactions/{id}` e regras por descrição (`/categories/rules`, com `matchType` `exact`/`contains`/`startsWith`/`endsWith`), específicas do `client_id` ([docs: categorização][d-cat]). Se funcionam no proxy MeuPluggy **não está documentado**. O mapa já prevê regras salvas no celular.

### Transferência entre contas do mesmo titular

- Existe a **categoria** "Same person transfer", com filhas Cash, PIX e TED ([docs: categorização][d-cat]).
- `paymentData.payer`/`receiver` trazem o `documentNumber` (CPF/CNPJ). No Open Finance, a contraparte de PIX e TED vem em **mais de 90%** das transações do BTG (675 e 614), do Nubank (612) e do Mercado Pago (606) ([docs: payment data OF][d-ofpd]). Basta comparar com o CPF do titular, que vem em `Account.taxNumber` e na Identity ([docs: contas][d-acc]).
- **Nubank:** quando a contraparte é CPF, o **nome** vem nulo, porque "para CPF não há obrigação de retornar o nome por questão de dados pessoais" (fundador da Pluggy, [meu-pluggy#5][mp-5]).
- `TRANSFERENCIA_MESMA_INSTITUICAO` significa **mesmo banco**, não mesmo titular ([docs: transações][d-tx]).

### Pagamento de fatura

- **No cartão:** `operationType: PAGAMENTO_FATURA`, informado pela instituição ou inferido pela Pluggy desde set/2026. Quando o banco não informa o pagamento, a Pluggy cria a transação "Pagamento recebido" a partir da fatura ([docs: transações][d-tx], [changelog 2026.09][cl-2026-09]).
- **Na conta:** a categoria "Credit card payment" fica em Transfers ([docs: categorização][d-cat]).
- **Na fatura:** `payments[]` traz data, modo e valor ([docs: faturas][d-bills]).

### Parcelamento

- `creditCardMetadata` traz ([SDK: transações][sdk-tx], [docs: OF vs direto][d-ofvsd]):
  - `installmentNumber`, `totalInstallments` e `purchaseDate`;
  - `paymentType` (`SINGLE`/`INSTALLMENT`), `billPostDate` e `transactionDateTime`, só em Open Finance e não retroativos.
- **`totalAmount` (valor total da compra) não vem no Open Finance** ([docs: OF vs direto][d-ofvsd]).
- **Não há id de grupo** das parcelas. É preciso heurística: número/total da parcela, data da 1ª parcela e estabelecimento ([docs: parcelas][d-inst]).
- A spec do Open Finance tem o número da parcela (`chargeIdentificator`) e o total (`chargeNumber`), obrigatórios quando a compra é a prazo ([spec OF: cartões][ofb-cc]). Ainda assim, há relatos de **`installmentNumber` ausente** no MeuPluggy com Bradesco, Santander, C6 e XP **[comunidade]** ([open-finance-pessoal][com-ofp]). Em 2023, o Nubank só indicava a parcela na descrição ("3/5") ([meu-pluggy#6][mp-6]). **Não claro para os bancos do autor.**

## 5. Cartões de crédito e faturas

- **Bill** ([docs: faturas][d-bills], [SDK: faturas][sdk-bill], [OpenAPI][oas]):

  | Campo | O que traz |
  |---|---|
  | `dueDate` | Vencimento |
  | `billClosingDate` | Fechamento. Existe desde jul/2026 e "only returned for connections created after the implementation" ([changelog 2026.07][cl-2026-07]). |
  | `totalAmount` | Total da fatura |
  | `minimumPaymentAmount` | Pagamento mínimo |
  | `allowsInstallments` | Se a fatura aceita parcelamento |
  | `financeCharges[]` | Encargos: juros, multa, IOF |
  | `payments[]` | `valueType`, `paymentMode`, `paymentDate`, `amount` |

  A fatura é obrigatória em todo conector Open Finance ([docs: faturas][d-bills]).
- **Quando a fatura aparece:**
  - "open bills are not returned until the bills are closed or overdue (This depends on the FI)" ([docs: considerações OF][d-offaq]);
  - no Inter PF, a fatura já chega no fechamento desde set/2026, e "other Open Finance connectors will receive this change progressively" ([changelog 2026.09][cl-2026-09]);
  - **[comunidade]** "`GET /bills` só lista faturas fechadas" ([open-finance-pessoal][com-ofp]).
- **Ciclo de uma compra** ([docs: parcelas][d-inst]):
  1. Aparece nas recentes como `PENDING`, sem `billId`.
  2. Quando a fatura fecha ou vence, passa a `POSTED` com `billId`.
  3. O webhook `transactions/updated` avisa da mudança.
- **Competência antes do fechamento:** `billForecastDate` (`YYYY-MM`) traz a fatura prevista e vem também em compras pendentes ([SDK: transações][sdk-tx], [changelog 2026.07][cl-2026-07]). Há relato de que ele **oscila entre sincronizações** e às vezes aponta para fatura já fechada (Itaú). O `billId` é o sinal mais confiável **[comunidade]** ([meu-pluggy#25][mp-25]).
- **Parcelas futuras:**
  - **BTG Pactual Investimentos (614)** traz as parcelas futuras na 1ª conexão, como `PENDING` ([docs: considerações OF][d-offaq]).
  - Desde set/2026, as parcelas futuras de **BTG e Mercado Pago** "now carry future dates and are no longer deleted and recreated whenever a bill closes" ([changelog 2026.09][cl-2026-09]).
  - O padrão mais comum nos grandes bancos é gerar uma parcela por fatura ([docs: parcelas][d-inst]).
- **Sinal do valor:** no cartão, compra é positiva e pagamento ou estorno é negativo ([docs: transações][d-tx]).
- **Data:** a partir da 2ª parcela, `date` usa a data de lançamento na fatura. A data original da compra fica em `purchaseDate` ([docs: parcelas][d-inst], [meu-pluggy#1][mp-1]).

## 6. Investimentos

**Campos** ([docs: investimentos][d-inv], [SDK: investimentos][sdk-inv]):

| Campo | O que traz |
|---|---|
| `type` | `FIXED_INCOME`, `MUTUAL_FUND`, `EQUITY`, `ETF`, `SECURITY`, `COE`, `OTHER` |
| `subtype` | CDB, LCI, LCA, TREASURY, DEBENTURES, CRI, CRA, fundos por classe, STOCK, REAL_ESTATE_FUND, BDR etc. |
| `balance` | Valor líquido |
| `amount` | Valor bruto |
| `taxes` / `taxes2` | IR / IOF |
| `amountWithdrawal` | Valor disponível para resgate |
| `amountOriginal` | Valor aplicado originalmente |
| `quantity`, `value`, `date` | Quantidade, preço e data de referência |
| `rate`, `rateType`, `fixedAnnualRate` | Remuneração contratada |
| `dueDate`, `issuer`, `issueDate`, `isin`, `code` | Dados do título |
| `status` | `ACTIVE`, `PENDING`, `TOTAL_WITHDRAWAL` |

**Diferenças no Open Finance** ([docs: investimentos][d-inv]):

- `amountProfit`, `annualRate`, `lastMonthRate` e `lastTwelveMonthsRate` "are not part of the data institutions share through Open Finance, and are returned as `null`";
- `rate`/`rateType` são a remuneração contratada, não rentabilidade medida.

**Histórico**

- **Só a posição atual.**
  - Na spec do Open Finance, a posição (`/balances`) traz a data e hora da última posição, que é a mesma da consulta ([spec OF: renda fixa bancária][ofb-bfi]).
  - A API da Pluggy não tem endpoint de posição passada ([OpenAPI][oas]).
- **Movimentações:** `GET /investments/{id}/transactions` traz até 12 meses no Open Finance ([docs: limites OF][d-ofrl], [spec OF: renda fixa bancária][ofb-bfi]).
  - Tipos: `BUY`, `SELL`, `TAX`, `TRANSFER`, `INTEREST`, `AMORTIZATION`.
  - Campos: `amount`, `netAmount`, `movementType` e `expenses`.
  - `expenses` vem em conexões Open Finance e Meu Pluggy ([docs: transações de investimento][d-invtx]).
  - **[comunidade]** Esse endpoint respondeu 403 num item MeuPluggy até para id inexistente, então o acesso pelo proxy ficou em dúvida ([meu-pluggy#28][mp-28]). **Não claro.**
- **Na primeira conexão, só vêm investimentos ativos.** Os já resgatados não aparecem ([docs: considerações OF][d-offaq]).

**O que não vem pelo Open Finance**

- **Previdência (PGBL/VGBL):**
  - a API "Pension" do Open Finance Brasil é de *dados abertos* de produto (`opendata-pension`), não de posição do cliente ([spec OF: pension][ofb-pension]);
  - a tabela de subtipos recebidos via Open Finance não tem `SECURITY` ([docs: investimentos OF][d-ofinv]);
  - **[comunidade]** "Previdência (PGBL/VGBL) não vem pelo Open Finance" ([open-finance-pessoal][com-ofp]).
- **Cripto:** não há API de cripto entre as APIs de investimento do Open Finance Brasil. Existem renda fixa bancária, renda fixa de crédito, renda variável, títulos do Tesouro e fundos ([specs OF][ofb-apis]).
- **COE:** no XP, COE vem só pelo direto ([docs: considerações OF][d-offaq]).

**Problemas relatados no proxy MeuPluggy**

- **Nubank (612):** `/investments` volta vazio enquanto `/items/{id}/resources` declara 109 recursos `BANK_FIXED_INCOME` `AVAILABLE` (as caixinhas, que são RDB). A hipótese é que `RDB` não tem subtipo na Pluggy ([meu-pluggy#28][mp-28]). De fato, os subtipos de renda fixa do SDK não têm RDB ([SDK: investimentos][sdk-inv]). Isso contradiz a documentação, que diz que caixinhas "configure as CDBs" ([docs: investimentos][d-inv]).
- **Mercado Pago:** "puxando apenas o saldo da conta bancária. Não está retornando os investimentos do Cofrinho" (aberto desde jun/2026, [meu-pluggy#22][mp-22]).
- **XP:** fundos ativos com saldo R$ 0 ([meu-pluggy#24][mp-24]). Não é banco do autor, mas é sinal de qualidade irregular nos investimentos.

## 7. Empréstimos e identidade

- **Empréstimos:** existem na API (`/loans`), mas o conector MeuPluggy está marcado sem Loans ([docs: cobertura][d-cov]). Para a planilha isso não importa: as "devoluções de empréstimo" dela são **empréstimos pessoais devolvidos por PIX**, não contratos bancários (ver Lacunas).
- **Identidade:** traz nome, CPF, contatos e, no Open Finance, `financialRelationships` (contas consentidas, inclusive do tipo `CONTA_PAGAMENTO_PRE_PAGA`) e `qualifications` ([docs: OF vs direto][d-ofvsd], [docs: identidade][d-id]). Serve para a detecção de transferência própria.

## 8. Contas de benefício

- **Na Pluggy:**
  - nenhum produto, campo ou página da documentação trata de vale-alimentação/refeição ou de "benefícios";
  - o `subtype` de conta só admite `CHECKING_ACCOUNT`, `SAVINGS_ACCOUNT` e `CREDIT_CARD` ([SDK: contas][sdk-acc], [docs: contas][d-acc]).
- **No Open Finance:**
  - a API de contas cobre conta de depósito à vista, poupança e **conta de pagamento pré-paga** (Circular 3.680) ([spec OF: contas][ofb-acc]);
  - a [Resolução BCB 289/2023][bcb-289], vigente desde 1º/3/2023, tira do SPB os arranjos cujo instrumento é de programa de benefícios trabalhistas ou de auxílio-alimentação (art. 457 §2º da CLT).
  - **[inferência]** Sem ser arranjo do SPB, o saldo de VA/VR não é uma conta de pagamento regulada. Assim, não entra no escopo obrigatório do Open Finance.
- **O produto do autor:** o **Cartão BTG Benefícios** foi anunciado em 20/08/2026. Ele junta VA e VR num cartão Mastercard e é acompanhado no app BTG Pactual Banking ([Forbes][forbes-btg]). A matéria não diz se é uma conta pré-paga nem menciona Open Finance.
- **Conclusão:** **não confirmado, e provavelmente não disponível.**
  - Verificação: `GET /accounts?itemId=<item BTG>` e `GET /items/{id}/resources` no item BTG do autor ([docs: recursos][d-res]).
  - Se aparecer, virá como uma conta `BANK` comum, sem marcação de benefício.
  - **[inferência]** O app não teria como diferenciá-la sem uma regra local.

## 9. Cobertura das instituições do autor

| Instituição | Conector Open Finance | Direto | Produtos Open Finance | Observações |
|---|---|---|---|---|
| **BTG Pactual** | BTGPactual (675, `PERSONAL_BANK`) e BTGPactual Investimentos (614, `INVESTMENT`) ([docs: OF][d-of], [docs: investimentos OF][d-ofinv]) | Só investimentos (214), com MFA e sem atualização automática ([docs: cobertura][d-cov]) | Contas, transações, cartões, investimentos e transações de investimento, nos dois conectores ([docs: instituições OF][d-ofinst]) | Os dois têm quase todos os subtipos de investimento ([docs: investimentos OF][d-ofinv]). O 614 tem cartão com parcelas futuras ([docs: considerações OF][d-offaq]). **Não claro** se o autor precisa de um ou dois conectores, e cada um gasta 1 das 5 conexões. Benefícios: ver §8. |
| **Nubank** | Nubank (612) ([docs: OF][d-of]) | Nenhum ([docs: OF][d-of]) | Contas, transações, cartões, investimentos e transações de investimento ([docs: instituições OF][d-ofinst]) | Caixinhas (RDB) ausentes ([meu-pluggy#28][mp-28]). Nome da contraparte CPF nulo ([meu-pluggy#5][mp-5]). Compras pendentes apagadas perto do fechamento: corrigido em set/2026 ([changelog 2026.09][cl-2026-09]). |
| **Mercado Pago** | Mercado Pago (606) ([docs: investimentos OF][d-ofinv]) | Mercado Pago (206, OAuth), só contas e transações ([docs: cobertura][d-cov], [docs: conectar conta][d-ca]) | Contas, transações, cartões, investimentos e transações de investimento ([docs: instituições OF][d-ofinst]) | Cofrinhos ausentes ([meu-pluggy#22][mp-22]). Parcelas futuras com data futura desde set/2026 ([changelog 2026.09][cl-2026-09]). |

Meu Pluggy funcionando com Nubank, C6 e BTG: **[comunidade]** ([meu-pluggy-guide][com-gg]). O plano pessoal aceita **até 5 conexões** ([docs: uso pessoal][d-mp]).

## 10. Confirmado vs. não claro

| Afirmação | Status |
|---|---|
| O conector MeuPluggy entrega contas, cartões, transações, dados de pagamento, investimentos, transações de investimento e identidade; empréstimos não | Confirmado ([docs][d-cov]) |
| 12 meses de transações na conexão (conta, cartão, investimentos) | Confirmado ([docs][d-ofrl], [spec OF][ofb-acc]) |
| `GET /transactions` (v1) sai em 2026-12-31; o `GET /v2/transactions` tem os mesmos campos, paginação por cursor e não filtra por `billId` | Confirmado ([OpenAPI][oas], [docs][d-basic]) |
| O v2 devolve a mesma profundidade de histórico que o v1 | **[inferência]**: o schema e a fonte de dados são os mesmos, mas nenhuma fonte afirma isso |
| O histórico se acumula além de 12 meses enquanto o item existir | **Não claro** |
| Investimentos: só posição atual; sem rentabilidade no Open Finance | Confirmado ([docs][d-inv], [spec OF][ofb-bfi]) |
| A categoria vem preenchida no proxy MeuPluggy, apesar de ser recurso pago | **[comunidade]**, não documentado ([open-finance-pessoal][com-ofp]) |
| `providerId` ausente no proxy | **[comunidade]** ([open-finance-pessoal][com-ofp]) |
| Categoria "Same person transfer" + CPF da contraparte | Confirmado ([docs][d-cat], [docs][d-ofpd]) |
| `PAGAMENTO_FATURA` em transações de cartão | Confirmado ([changelog][cl-2026-09]) |
| `installmentNumber` presente nos bancos do autor | **Não claro** (a spec exige; a comunidade relata ausência em outros bancos) |
| `billClosingDate` na fatura | Confirmado, só para conexões criadas depois de jul/2026 ([changelog][cl-2026-07]) |
| Faturas só depois de fechadas | Confirmado como regra geral, varia por banco ([docs][d-offaq]) |
| Caixinhas do Nubank e Cofrinhos do MP ausentes | Relatado no repo oficial, sem resposta ([#28][mp-28], [#22][mp-22]) |
| Previdência e cripto fora do Open Finance | Confirmado pelas specs ([pension][ofb-pension], [APIs][ofb-apis]) |
| Contas de benefício (BTG Benefícios) disponíveis | **Não claro; provavelmente não** ([BCB 289][bcb-289], inferência) |
| Qual conector BTG (675 e/ou 614) cobre os produtos do autor | **Não claro** |
| Acesso a `/investments/{id}/transactions` no proxy | **Não claro** ([#28][mp-28] vs. [docs][d-invtx]) |

## Lacunas vs. planilha

Esta seção compara a planilha atual com o Pluggy. Ela usa só a **estrutura** da planilha (`Financas_2026.xlsx` e `atualizar_planilha.py`, na pasta pai), sem dados reais.

- **Fontes da planilha:**
  - fatura do cartão BTG (xlsx);
  - extrato da conta BTG, já com a categoria do próprio BTG ("Salário", "Bônus e PLR", "Investimentos");
  - extrato da conta Nubank (CSV);
  - extrato da conta Mercado Pago (xlsx);
  - relatório de performance de investimentos do BTG (PDF).
- **Abas da planilha:**
  - dashboard mensal;
  - investimentos BTG;
  - transações por conta;
  - semanal.

| O que a planilha mostra ou faz hoje | Pelo Pluggy | Situação |
|---|---|---|
| Salário/PLR (pela categoria do BTG) | Categoria Income › Salary e `operationType` `FOLHA_PAGAMENTO`/`PORTABILIDADE_SALARIO` ([docs][d-cat], [docs][d-tx]) | **OK**, se a categoria vier. Senão, regra local. |
| Ignorar transferências entre contas próprias | "Same person transfer" + CPF da contraparte igual ao do titular ([docs][d-cat], [docs][d-ofpd]) | **OK**, com dados até melhores que a busca por nome feita hoje |
| Devoluções de empréstimo pessoal fora dos gastos | Não existe esse conceito: é um PIX recebido de terceiro | **Regra local**, como hoje (o mapa já prevê regras por descrição) |
| Fatura conta como gasto; pagamento da fatura não | Transações do cartão por `billId`/fatura; `PAGAMENTO_FATURA` no cartão; "Credit card payment" na conta ([docs][d-tx], [docs][d-cat]) | **OK** para faturas fechadas. Fatura aberta só por estimativa (`PENDING`, `billForecastDate` instável, [#25][mp-25]). |
| Total da fatura BTG por mês | `Bill.totalAmount` e `dueDate` ([docs][d-bills]) | **OK** |
| Aportes (saídas da conta para investimento) | Categoria "Investments" na conta, ou `BUY` nas transações de investimento ([docs][d-cat], [docs][d-invtx]). Não há `operationType` de aplicação ([docs][d-tx]). | **OK, com ressalva**: depende da categoria ou do acesso às transações de investimento no proxy |
| Rendimentos do Mercado Pago | `operationType` `RENDIMENTO_APLIC_FINANCEIRA` ([docs][d-tx]) | **Provável.** Verificar com dados reais. |
| Patrimônio bruto/líquido atual | `amount` (bruto) e `balance` (líquido) por investimento ([docs][d-inv]) | **OK** |
| Rentabilidade % no mês, % no ano, % do CDI | Não vem no Open Finance (`null`) ([docs][d-inv]) | **Lacuna.** Só calculável a partir de snapshots locais; o CDI precisa de outra fonte. |
| Histórico mensal de patrimônio (inicial, movimentações, IR, final, ganho) | Sem histórico de posição ([spec OF][ofb-bfi], [OpenAPI][oas]) | **Lacuna para o passado.** Daqui em diante, com snapshots locais mais as transações de investimento. |
| Distribuição por mercado (renda fixa, renda variável, conta corrente, cripto, em trânsito) | `type`/`subtype` dos investimentos e saldo das contas ([docs][d-inv]) | **Parcial.** Cripto não existe no Open Finance ([APIs OF][ofb-apis]); "em trânsito" não tem equivalente. |
| Lista de ativos de renda fixa e renda variável | `/investments` ([docs][d-inv]) | **OK** no BTG. Caixinhas do Nubank e Cofrinhos do MP podem faltar ([#28][mp-28], [#22][mp-22]). |
| Visão semanal | Data da transação; no cartão, `purchaseDate`/`transactionDateTime` ([SDK][sdk-tx]) | **OK.** Usar a data da compra, não a da parcela. |
| Período coberto (2026) | 12 meses para trás na conexão ([docs][d-ofrl]) | **OK**: conectar em nov/2026 cobre todo 2026 |
| Benefícios (novo, não está na planilha) | Ver §8 | **Provavelmente indisponível** |

**Há lacuna crítica que justifique importação manual de extratos?**

- **[inferência]** Para o conteúdo central do v1, não: visão mensal, categorias, transações por conta e cartão, patrimônio atual e distribuição.
- As lacunas que pesam são estas:
  - **rentabilidade e histórico de patrimônio do passado**: o relatório PDF do BTG traz isso e o Open Finance não;
  - **ativos que não aparecem**: caixinhas, cofrinhos, previdência e cripto;
  - **benefícios**.
- Nenhuma delas se resolve com *importação de extrato*: são posições e rentabilidade, não lançamentos. A exceção seria importar o PDF de performance do BTG.

## Implicações para o app

- **O histórico de patrimônio precisa ser construído com snapshots locais.**
  - A cada leitura, o app grava saldo de contas, posição de cada investimento e fatura aberta, com data.
  - **[inferência]** O saldo passado de **conta corrente** pode ser reconstruído para trás: saldo atual menos as transações dos 12 meses. O de investimentos não pode, porque só há os fluxos, sem marcação a mercado. Assim, a curva de patrimônio do v1 começa no dia da instalação, ou tem um trecho só de contas.
- **O banco local é a fonte de verdade do histórico.** Reconexões e a renovação anual da autorização do Meu Pluggy geram `itemId` e ids de transação novos ([docs: uso pessoal][d-mp], [docs: transações][d-tx]). Sem `providerId` no proxy **[comunidade]**, a reconciliação usa `providerCode` + data + valor + descrição.
- **A sincronização precisa ser idempotente e tolerar reescrita.**
  - Uma transação pode ser apagada e recriada, ou sumir e reaparecer.
  - `PENDING` vira `POSTED`.
  - A fatura reatribui `billId` ([docs: ciclo do cartão][d-cycle], [docs: parcelas][d-inst]).
  - O caminho mais seguro é reler uma janela (ex.: 30 a 60 dias) a cada sync e substituir, em vez de só acrescentar. **[inferência]**
- **Usar só o `GET /v2/transactions`.** A leitura segue o `next` até `null` e não depende de total nem de tamanho de página. Como o v2 não filtra por fatura, as transações de uma fatura se obtêm filtrando localmente por `creditCardMetadata.billId` ([OpenAPI][oas]). Para uma releitura incremental, `createdAtFrom` traz o que entrou desde a última leitura, mas não pega transações *atualizadas*. A janela por `dateFrom`/`dateTo` cobre os dois casos. **[inferência]**
- **Competência do cartão:**
  - para fatura fechada, usar `billId`;
  - para ciclo aberto, usar `billForecastDate` só como dica, com fallback pelo fechamento da última fatura ([meu-pluggy#25][mp-25]);
  - `billClosingDate` pode faltar em conexões antigas ([changelog 2026.07][cl-2026-07]).
- **A categorização local é obrigatória**, mesmo que a do Pluggy venha:
  - usar a categoria do Pluggy como padrão;
  - aplicar por cima as regras do usuário;
  - ter um categorizador local de fallback para o caso de `category: null`, que é a regra oficial do plano grátis ([docs: contato][d-contact]).
- **Guardar o JSON cru** de cada entidade, ou pelo menos ser tolerante a campos novos e nulos. Os campos variam por conexão e data: `billClosingDate`, `paymentType` e `billPostDate` não são retroativos ([docs: OF vs direto][d-ofvsd], [changelog 2026.07][cl-2026-07]).
- **Identificar o banco** pelo código COMPE de `bankData.transferNumber`, porque todo item tem conector 200 **[comunidade]** ([open-finance-pessoal][com-ofp]).
- **Frescor:** até ~48 h de atraso e nenhum jeito de forçar atualização ([docs: Item][d-item], [docs: FAQ][d-faq]). A tela deve mostrar "atualizado em" por banco.
- **Benefícios genéricos:** mostrar qualquer conta que o item devolver, sem lógica específica do BTG. Esperar que o cartão BTG Benefícios não apareça.

## Perguntas que surgem

1. **Exploração com os dados reais do autor** (registrando só estrutura anonimizada, como pedem as Notas do mapa). Verificar no BTG, no Nubank e no Mercado Pago:
   - se `category` vem;
   - se `providerId` e `installmentNumber` vêm;
   - se `billClosingDate` vem;
   - qual conector BTG é usado (675, 614 ou ambos);
   - se a conta do BTG Benefícios aparece em `/accounts` ou `/resources`;
   - se caixinhas e cofrinhos aparecem;
   - se `/investments/{id}/transactions` é acessível;
   - qual a profundidade real do histórico.
2. **O v1 precisa de rentabilidade** (% no mês, % do CDI)? Se sim, ela só existe a partir de snapshots locais, mais uma série de CDI externa.
3. **O que fazer com ativos invisíveis ao Open Finance** (caixinhas, cofrinhos, previdência, cripto, benefícios)? Aceitar a lacuna ou permitir um "saldo manual" de ativo? Isso tensiona a nota "Fonte única" do mapa.

<!-- Referências -->

[sib]: https://github.com/Kaioabreu/financas/blob/research/autorizacao-meu-pluggy/docs/research/autorizacao-meu-pluggy.md
[d-mp]: https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use
[d-item]: https://docs.pluggy.ai/en/docs/connections/item
[d-cov]: https://docs.pluggy.ai/en/docs/connections/connectors-coverage
[d-acccov]: https://docs.pluggy.ai/en/docs/connections/accounts-coverage
[d-of]: https://docs.pluggy.ai/en/docs/open-finance/overview
[d-ofinst]: https://docs.pluggy.ai/en/docs/open-finance/institutions-coverage
[d-offaq]: https://docs.pluggy.ai/en/docs/open-finance/considerations-faq
[d-ofinv]: https://docs.pluggy.ai/en/docs/open-finance/investments
[d-ofrl]: https://docs.pluggy.ai/en/docs/open-finance/rate-limits
[d-ofpd]: https://docs.pluggy.ai/en/docs/open-finance/payment-data
[d-ofvsd]: https://docs.pluggy.ai/en/docs/connections/open-finance-vs-direct-fields
[d-res]: https://docs.pluggy.ai/en/docs/connections/resources
[d-acc]: https://docs.pluggy.ai/en/docs/products/accounts
[d-tx]: https://docs.pluggy.ai/en/docs/products/transactions
[d-cat]: https://docs.pluggy.ai/en/docs/products/transaction-categorization
[d-bills]: https://docs.pluggy.ai/en/docs/products/credit-card-bills
[d-cycle]: https://docs.pluggy.ai/en/docs/products/credit-card-statement-cycle
[d-inst]: https://docs.pluggy.ai/en/docs/products/credit-card-installments
[d-inv]: https://docs.pluggy.ai/en/docs/products/investments
[d-invtx]: https://docs.pluggy.ai/en/docs/products/investment-transactions
[d-id]: https://docs.pluggy.ai/en/docs/products/identity
[d-contact]: https://docs.pluggy.ai/en/docs/get-started/contact
[d-faq]: https://docs.pluggy.ai/en/docs/get-started/faq
[d-ca]: https://docs.pluggy.ai/en/docs/developer-tools/connect-account
[cl-2026-06]: https://docs.pluggy.ai/en/changelog#2026.06
[cl-2026-07]: https://docs.pluggy.ai/en/changelog#2026.07
[cl-2026-08]: https://docs.pluggy.ai/en/changelog#2026.08
[cl-2026-09]: https://docs.pluggy.ai/en/changelog#2026.09
[oas]: https://docs.pluggy.ai/openapi/pluggy-api.json
[ref-v1]: https://docs.pluggy.ai/en/reference/transaction/transactions-list
[ref-v2]: https://docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor
[d-basic]: https://docs.pluggy.ai/en/docs/reference/basic-concepts
[sdk-tx]: https://github.com/pluggyai/pluggy-node/blob/3005f6a5c12701731edc8824a6316bf183b47dc0/src/types/transaction.ts
[sdk-acc]: https://github.com/pluggyai/pluggy-node/blob/3005f6a5c12701731edc8824a6316bf183b47dc0/src/types/account.ts
[sdk-bill]: https://github.com/pluggyai/pluggy-node/blob/3005f6a5c12701731edc8824a6316bf183b47dc0/src/types/creditCardBills.ts
[sdk-inv]: https://github.com/pluggyai/pluggy-node/blob/3005f6a5c12701731edc8824a6316bf183b47dc0/src/types/investment.ts
[mp-guide]: https://meu.pluggy.ai/api-guide
[mp-home]: https://meu.pluggy.ai/
[mp-readme]: https://github.com/pluggyai/meu-pluggy
[mp-1]: https://github.com/pluggyai/meu-pluggy/issues/1
[mp-3]: https://github.com/pluggyai/meu-pluggy/issues/3
[mp-5]: https://github.com/pluggyai/meu-pluggy/issues/5
[mp-6]: https://github.com/pluggyai/meu-pluggy/issues/6
[mp-22]: https://github.com/pluggyai/meu-pluggy/issues/22
[mp-24]: https://github.com/pluggyai/meu-pluggy/issues/24
[mp-25]: https://github.com/pluggyai/meu-pluggy/issues/25
[mp-28]: https://github.com/pluggyai/meu-pluggy/issues/28
[ofb-apis]: https://github.com/OpenBanking-Brasil/openapi/tree/main/swagger-apis
[ofb-acc]: https://github.com/OpenBanking-Brasil/openapi/blob/main/swagger-apis/accounts/2.4.2.yml
[ofb-cc]: https://github.com/OpenBanking-Brasil/openapi/blob/main/swagger-apis/credit-cards/2.3.1.yml
[ofb-bfi]: https://github.com/OpenBanking-Brasil/openapi/blob/main/swagger-apis/bank-fixed-incomes/1.1.0.yml
[ofb-pension]: https://github.com/OpenBanking-Brasil/openapi/blob/main/swagger-apis/pension/2.0.0.yml
[bcb-289]: https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20BCB&numero=289
[forbes-btg]: https://forbes.com.br/forbes-money/2026/08/btg-pactual-anuncia-entrada-no-mercado-de-beneficios-corporativos/
[com-ofp]: https://github.com/fellipefbarros/open-finance-pessoal/blob/HEAD/skills/usando-meu-pluggy/SKILL.md
[com-gg]: https://github.com/gabrielgydu/meu-pluggy-guide/blob/HEAD/meu-pluggy-report.md
