# Guia de entrada

Do convite do Firebase até a sua primeira Conexão. Tudo pode ser feito no celular (veja a nota do passo 3).

Conferido em: _AAAA-MM-DD (preencher ao refazer o caminho com as telas atuais da Pluggy)_

> Capturas de tela: Client ID, Client Secret, itemIds, CPF, nomes e valores ficam sob tarja sólida, nunca desfocados. Nenhum dado real vale neste guia, nem no texto nem nas imagens.

## O que saber antes de começar

1. **Os dados ficam só neste celular.** Ninguém mais os vê, nem o autor.
2. **O Meu Pluggy atualiza 1 vez por dia**, e um gasto pode levar ~2 dias para aparecer.
3. **Até 5 bancos, todos no seu nome.**
4. **A autorização vale 1 ano.** Renovar é fazer login de novo; o app avisa 30 dias antes.
5. **O app traz os últimos 12 meses.** Daí em diante, o histórico se acumula no celular.
6. **Sem Backup, perder o celular é perder o histórico.** A senha do backup não tem recuperação.
7. **Perdeu o celular ou desconfia de vazamento?** Gere um novo Client Secret no Dashboard da Pluggy (passo 3). O antigo para de funcionar na hora. Nunca envie o Client Secret a ninguém, nem ao autor.
8. **Uso pessoal.** O código é aberto; cada um usa a própria conta e a própria aplicação. A Pluggy não dá SLA.
9. **O que não vem:** VA/VR, cripto, FGTS e imóveis.

## 1. Instalar

1. Aceite o convite do Firebase App Distribution que chegou ao seu e-mail.
2. Baixe o APK e, quando o Android pedir, permita a instalação pelo navegador.
3. Se o Play Protect avisar, escolha instalar mesmo assim.

<!-- CAPTURA: convite do Firebase -->
<!-- CAPTURA: permissão de instalação pelo navegador -->
<!-- CAPTURA: aviso do Play Protect -->

A cada APK novo você recebe um e-mail; instale de novo quando ele chegar.

## 2. Meu Pluggy

1. Crie a conta no Meu Pluggy.
2. Conecte os bancos que quer acompanhar (até 5). Cada banco é aprovado pelo app do banco.

<!-- CAPTURA: Meu Pluggy com bancos conectados (tarja em nomes e valores) -->

## 3. Dashboard da Pluggy

1. Crie a conta no Dashboard com o **mesmo e-mail** do Meu Pluggy.
2. Crie uma aplicação.
3. Habilite o conector **MeuPluggy**.
4. Copie o **Client ID** e o **Client Secret**. O Client Secret aparece **uma vez só**: copie na hora.
5. **Não use o "Demo → Connect Account".** Quem conecta os bancos é o app.

<!-- CAPTURA: criar aplicação -->
<!-- CAPTURA: habilitar o conector MeuPluggy -->
<!-- CAPTURA: credenciais (tarja sólida em Client ID e Client Secret) -->

> A conferir: se o Dashboard funciona bem no celular. Se não funcionar, faça este passo no computador e **apague a mensagem com o secret depois** de colá-lo no app.

## 4. Voltar ao app

1. Abra o app, toque em "Começar" e leia os avisos.
2. Cole o Client ID e o Client Secret nos campos de mesmo nome. O app confere as credenciais antes de salvar.
3. Conecte seu primeiro banco: abre o Meu Pluggy; escolha um banco (os outros você conecta depois, um de cada vez).
4. Toque em "Ver meus dados".

<!-- CAPTURA: tela de credenciais do app -->

## Problemas comuns

Em qualquer erro, use "Copiar diagnóstico" no app e mande o texto ao autor pelo WhatsApp. O diagnóstico não leva valores, descrições, nomes, CPF, Client ID nem itemIds. Não abra issue no GitHub: ela é pública.

### Credenciais recusadas
Confira se copiou inteiro, sem espaços. Perdeu o secret? Gere outro no Dashboard e cole só o novo Client Secret.

### Conector não habilitado ou conta só de sandbox
No Dashboard, habilite o conector MeuPluggy na sua aplicação. A mensagem "Contas de teste só podem conectar conectores sandbox" indica conta de teste ou o "Demo → Connect Account": crie a aplicação com o mesmo e-mail do Meu Pluggy e conecte os bancos pelo app. Se persistir, avise o autor.

### Login que não terminou
O Meu Pluggy não concluiu em 4 minutos. Toque em "Tentar de novo" e termine a aprovação no app do banco. O app apaga sozinho o que ficou pela metade.

### Limite de 5 bancos
Cada aplicação aceita até 5 bancos. Remova uma Conexão que não usa mais (isso apaga os dados daquele banco) antes de conectar outra.

### Sem internet
Conecte-se à internet e tente de novo. Os dados já lidos continuam no app.

### Conexão atrasada
Os dados do banco não se renovam há mais de 2 dias. O app continua tentando e mantém os dados. Puxe para atualizar; se o banco vem de manhã cedo, o Meu Pluggy pode só estar atrasado. Abra o app do Meu Pluggy e veja se o banco está atualizado lá. Se passar de alguns dias, reconecte o banco.

### Reconectar um banco
Conexão vencida ou revogada para de sincronizar, mas mantém os dados. Em Conexões, toque no banco e em "Renovar", e faça o login no Meu Pluggy. Escolha o mesmo banco; seus dados e edições não mudam.

### Faltam compras numa fatura
Compras recentes levam ~2 dias para chegar. Confira se a Conexão do cartão está em dia e puxe para atualizar. Se ainda faltar depois disso, confira no app do Meu Pluggy se a compra aparece lá; se não, o banco não a informou. Mande o diagnóstico ao autor.
