# PROTÓTIPO DESCARTÁVEL: Pluggy Connect × conector MeuPluggy

Responde ao ticket [O Pluggy Connect consegue autorizar o conector MeuPluggy com as credenciais do próprio usuário?](https://github.com/Kaioabreu/financas/issues/14). O código não vai para o `main`; a resposta completa está no comentário de resolução do ticket.

## Como rodar

```sh
python -I prototypes/pluggy-connect/server.py [caminho/do/.env.pluggy]
```

Depois abra http://127.0.0.1:8765. O servidor lê `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` e `PLUGGY_ITEM_IDS` do `.env.pluggy`; o padrão é a pasta acima do repo. Ele entrega à página só connect tokens, nunca o segredo. Nada é persistido.

A página tem três fluxos:

- **A. Widget, criar item**: `PluggyConnect` web (SDK v2.11.0 do `cdn.pluggy.ai`) com `connectorIds: [200]` e `selectedConnectorId: 200`.
- **B. Widget, renovar**: connect token com `itemId` e o widget com `updateItem`.
- **C. Sem widget**: `POST /items` com `connectorId: 200`, abre `item.parameter.data` (a URL de OAuth do Meu Pluggy) numa aba e consulta `GET /items/{id}` a cada 3 s.

## Veredito (09/11/2026)

**Funciona.** Com o connect token gerado pelas credenciais do próprio usuário, o conector MeuPluggy cria um item novo e devolve o itemId, pelo widget (A) e também sem ele (C).

- A renovação **não** funciona por `updateItem`. O widget responde: "Os Itens Meu Pluggy só podem ser atualizados manualmente pelo aplicativo e sempre são atualizados diariamente."
- Renovar é **criar um item novo** para o mesmo banco: ele recebe um prazo novo de 1 ano.
- Os itens do mesmo banco compartilham os mesmos ids de contas, transações e investimentos.
- Apagar o item velho com `DELETE /items/{id}` não afeta o novo.
