# Finanças App

App pessoal de acompanhamento financeiro alimentado pelo Open Finance. Cada pessoa vê apenas as próprias finanças, e os dados dela vivem no próprio celular.

## Language

**Usuário**:
Pessoa que instala o app e vê somente as próprias finanças, conectadas através da própria conta no Meu Pluggy.
_Avoid_: cliente, conta (reservado para conta bancária)

**Aplicação**:
O cadastro que o usuário cria no Dashboard da Pluggy e de onde saem as credenciais dele. Uma só serve para todos os bancos.
_Avoid_: app, aplicativo (reservados para o Finanças)

**Credenciais**:
O Client ID e o Client Secret da aplicação do usuário. Quem tem o Client Secret lê todos os dados financeiros dele.
_Avoid_: chaves, token, senha

**Conexão**:
A autorização que o usuário dá no Meu Pluggy para o app ler os dados de um banco dele. Vence em 1 ano; renová-la exige um novo login do usuário e não muda os dados já lidos. Não é a ligação do banco com o Meu Pluggy, que o usuário cuida no app do Meu Pluggy.
_Avoid_: item, vínculo

**Conexão atrasada**:
Conexão cujos dados não se renovam há mais de dois dias, por qualquer causa. Continua sincronizando e mantém os dados.
_Avoid_: com erro, desatualizada

**Conexão a reconectar**:
Conexão que só volta com um novo login do usuário no Meu Pluggy, como a vencida ou a revogada. Para de sincronizar e mantém os dados.
_Avoid_: com erro, desatualizada

**Backup**:
Arquivo cifrado que o usuário gera à mão com os dados do app e que só abre com a senha que ele escolheu. É o único jeito de os dados sobreviverem à perda do celular.
_Avoid_: exportação, cópia de segurança

### Transações

**Transação**:
Uma entrada ou saída de dinheiro numa conta ou num cartão do usuário.
_Avoid_: movimentação, lançamento

**Natureza**:
O que uma transação significa para as finanças do usuário. Cada transação tem exatamente uma: receita, gasto, reembolso, aporte, resgate, transferência própria, pagamento de fatura ou empréstimo pessoal.
_Avoid_: tipo

**Categoria**:
O assunto de um gasto (Mercado, Transporte…), escolhido de uma lista fixa do app. Só gastos e reembolsos têm categoria; no reembolso ela é opcional.

**Fatura**:
O conjunto de compras de um cartão cobradas num mesmo vencimento. Ela não decide em que mês um gasto conta: a compra conta no mês em que foi feita.

**Lacuna**:
Parte do total de uma fatura fechada que não aparece nas transações que o Pluggy entregou para ela. O app a mostra, mas não a preenche.
_Avoid_: diferença, furo, lançamento faltante

**Compra parcelada**:
Compra no cartão paga em parcelas. Tem uma natureza e uma categoria só, que valem para todas as suas parcelas.

**Parcela**:
Cada pagamento de uma compra parcelada. A parcela k é um gasto no mesmo dia da compra, k − 1 meses depois (no último dia do mês, se ele for mais curto), a não ser que tenha sido adiantada.

**Parcela adiantada**:
Parcela que o usuário pagou antes do seu mês, na fatura atual, em troca de um desconto. É um gasto no dia do adiantamento, e o desconto é um reembolso dela.
_Avoid_: parcela antecipada

**Regra**:
Instrução do usuário que dá uma natureza e/ou uma categoria às transações cuja descrição contém um texto. Vale para as transações passadas e futuras, menos as editadas à mão.

**Regra embutida**:
Regra que vem com o app e cobre o jeito como um banco marca certas transações. O usuário pode sobrepô-la com uma regra própria, mas não pode editá-la.

**Operação de investimento**:
O que acontece dentro de um investimento: compra, venda, juros, amortização, imposto. Não é uma transação e não entra na visão mensal.
_Avoid_: transação de investimento, movimentação

### Naturezas

**Receita**:
Dinheiro novo que entra para o usuário vindo de fora dele. Toda receita tem uma origem: salário, rendimentos ou outras receitas.

**Salário**:
Origem de receita que reúne o pagamento do trabalho do usuário, incluindo PLR e bônus.

**Rendimento**:
Receita gerada por dinheiro já guardado que cai como transação: a remuneração da conta ou do cofrinho e os proventos. A valorização de um investimento não é rendimento; ela aparece só no patrimônio.

**Gasto**:
Dinheiro que sai do usuário para outra pessoa ou empresa em troca de consumo e não volta.

**Reembolso**:
Entrada que desfaz parte de um gasto do usuário, como a parte de um amigo, um estorno no cartão, um cashback ou a devolução de um Pix por uma loja. Abate dos gastos.
_Avoid_: devolução

**Empréstimo pessoal**:
Dinheiro emprestado entre o usuário e outra pessoa, na ida ou na volta. Não é receita nem gasto.
_Avoid_: devolução

**Aporte**:
Dinheiro que o usuário tira da conta e põe num investimento, num cofrinho ou numa caixinha. A aplicação automática do saldo de uma conta remunerada não é aporte, porque o dinheiro continua sendo o saldo da conta.

**Resgate**:
Dinheiro que volta de um investimento, cofrinho ou caixinha para a conta do usuário.

**Transferência própria**:
Transação entre o usuário e ele mesmo, isto é, com uma contraparte que tem o CPF dele, mesmo quando a outra conta não está no app. Não é receita nem gasto. Aportes, resgates e reembolsos que chegam com o CPF do usuário não são transferência própria.

**Pagamento de fatura**:
Transação que quita a fatura de um cartão conectado ao app. Não é gasto, porque as compras do cartão já contam como gasto. Pagar a fatura de um cartão que não está no app é gasto.

### Visão mensal

**Saldo do mês**:
Receitas menos gastos do mês, com os reembolsos já abatidos dos gastos. O aporte aparece ao lado e não entra no saldo.

**Aporte líquido**:
Aportes menos resgates do mês. Quando é negativo, o mês mostra um resgate líquido.

**Semana**:
De segunda a domingo, cortada no começo e no fim do mês para que as semanas somem o mês.

### Patrimônio

**Patrimônio**:
O que o usuário tem menos o que ele deve, contando só o que o app enxerga: o caixa, a carteira e as dívidas. Fica de fora o que os bancos não compartilham, como cripto, FGTS e imóveis.
_Avoid_: patrimônio líquido, patrimônio bruto

**Carteira**:
Os investimentos, cofrinhos e caixinhas do usuário, isto é, o patrimônio sem o caixa e sem as dívidas. É para onde vão os aportes.
_Avoid_: portfólio, investimentos (no sentido do conjunto)

**Dívida**:
O que o patrimônio desconta: as compras de cartão já lançadas e ainda não pagas e o cheque especial usado. Uma parcela só vira dívida no dia em que conta como gasto.

**Valor de resgate**:
Quanto o usuário receberia ao resgatar um investimento hoje, já descontados o imposto e o IOF. É o valor que o patrimônio usa.
_Avoid_: valor líquido, valor bruto

**Classe**:
O grupo em que um item do patrimônio aparece na distribuição: Caixa, Renda fixa, Renda variável, Fundos ou Outros. O Caixa é o saldo das contas, inclusive o que rende sozinho numa conta remunerada; cofrinhos e caixinhas ficam em Renda fixa.
_Avoid_: mercado, tipo, categoria (reservada para gastos)

**Retrato**:
O valor de cada conta, investimento, cofrinho e dívida num dia. O app guarda um quando sincroniza; os 12 meses antes da primeira leitura de cada banco têm retratos estimados a partir das transações e das operações de investimento. Cada mês da evolução usa o último retrato do mês.
_Avoid_: foto, snapshot

**Valorização**:
Quanto a carteira variou num período sem contar os aportes e os resgates. Não é receita.
_Avoid_: ganho, lucro, rendimento

**Rentabilidade**:
A valorização da carteira num período, somada aos proventos e juros que ela pagou, em proporção ao que estava investido. É comparada com o CDI do mesmo período.
_Avoid_: rendimento, performance
