# Finanças App

App pessoal de acompanhamento financeiro alimentado pelo Open Finance. Cada pessoa vê apenas as próprias finanças, e os dados dela vivem no próprio celular.

## Language

**Usuário**:
Pessoa que instala o app e vê somente as próprias finanças, conectadas através da própria conta no Meu Pluggy.
_Avoid_: cliente, conta (reservado para conta bancária)

**Conexão**:
A autorização que o usuário dá no Meu Pluggy para o app ler os dados de um banco dele. Vence em 1 ano; renová-la exige um novo login do usuário e não muda os dados já lidos.
_Avoid_: item, vínculo

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

**Parcela**:
Cada pagamento de uma compra parcelada. Cada parcela é um gasto no mês em que cai.

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
