# Como um usuário do Meu Pluggy autoriza um app de terceiros a ler seus dados?

Pesquisa do ticket [#2](https://github.com/Kaioabreu/financas/issues/2), feita em 2026-11-08 contra fontes primárias da Pluggy: docs.pluggy.ai, meu.pluggy.ai, pluggy.ai, o repositório oficial `pluggyai/meu-pluggy` e o Q&A curado da Pluggy (servidor MCP oficial). Cada afirmação traz o link da fonte. Relatos da comunidade estão marcados como tal e não valem como posição oficial.

## Resposta curta

- **Não existe um "Entrar com Meu Pluggy" para apps de terceiros.** A Pluggy só oferece um caminho para a pessoa física ler os próprios dados por código. A pessoa cria também um cadastro no **Dashboard da Pluggy** (o portal de desenvolvedores) e cria lá uma **aplicação**, que tem `clientId` e `clientSecret`. Dentro dessa aplicação, ela autoriza o **conector MeuPluggy** (id 200), uma vez por banco. Com o `clientId` e o `clientSecret` dela, qualquer programa lê os dados pela API REST ([guia oficial](https://meu.pluggy.ai/api-guide), [docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use)).
- **Isso é grátis, sem prazo e sem aprovação**, mas só para **uso pessoal**: até 5 conexões ativas, todas do mesmo titular, sem uso comercial ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy), [docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use)).
- **A Pluggy aceita explicitamente o uso dessas credenciais em ferramentas de terceiros**, como "planilha, app self-hosted, automação ou agente de IA" ou "apps de finanças open source" ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy), FAQ). O que ela **não** aceita no plano grátis é um produto em que "os seus usuários vão conectar as contas deles", nem "usar os dados dentro de um produto para outras pessoas". Esses dois casos exigem o plano pago, que custa a partir de R$ 2.500/mês ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy), [preços](https://www.pluggy.ai/precos)).
- **Consequência para o app:** o único modelo grátis compatível com os termos é o **"traga as suas próprias credenciais"**. Cada amigo tem o próprio Meu Pluggy e a própria aplicação no Dashboard, e cola o `clientId`/`clientSecret` dele no app. O app chama `api.pluggy.ai` direto do celular, sem servidor do autor. Tecnicamente funciona: é REST puro sobre HTTPS, e o endpoint `/auth` responde com CORS `*`. A documentação, porém, recomenda guardar o `clientSecret` "only in your secured server". No modelo pessoal, quem guarda é o próprio dono do segredo, no celular dele.
- **Atualização:** o Meu Pluggy atualiza cada banco **a cada 24 h**. **Não dá para forçar** uma atualização pela API no modo pessoal ([docs: Item](https://docs.pluggy.ai/docs/item)).

## O modelo de acesso, passo a passo

O caminho oficial, segundo a [página do Meu Pluggy na pluggy.ai](https://www.pluggy.ai/meu-pluggy), o [guia de API do Meu Pluggy](https://meu.pluggy.ai/api-guide) e o [guia de uso pessoal da documentação](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use), tem estes passos:

1. A pessoa cria um cadastro em [meu.pluggy.ai](https://meu.pluggy.ai) e conecta cada banco por Open Finance: CPF, app do banco, aprovação. "Tem conta em mais de um banco? Repita para cada um" ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)).
2. Ela cria um cadastro em [dashboard.pluggy.ai](https://dashboard.pluggy.ai), "de preferência com o mesmo e-mail". O aviso de teste de 15 dias "não afeta o uso pessoal" ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)). A documentação pede **a mesma conta** do Meu Pluggy ([docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use)).
3. Ela cria **uma aplicação** no Dashboard. "Uma só basta, mesmo que você tenha vários bancos" ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)).
4. Ela copia o **Client ID** e o **Client Secret**. O segredo aparece **uma única vez**. Se for perdido, gera-se outro, e o anterior para de funcionar na hora ([docs: Dashboard](https://docs.pluggy.ai/en/docs/guides/dashboard-connectors)).
5. Ela habilita o conector **MeuPluggy** (um conector *Direct*) em *Customization → Connectors*. Depois abre *Applications → aplicação → Demo → Connect Account*, escolhe **MeuPluggy** (não o banco, nem o Sandbox) e entra com o login do Meu Pluggy ([docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use), [docs: Dashboard](https://docs.pluggy.ai/en/docs/guides/dashboard-connectors)). A [página de preços](https://www.pluggy.ai/precos) identifica esse conector como "Conector 200".
6. **Cada banco** conectado no Meu Pluggy vira um **item** na aplicação, e cada banco é autorizado **separadamente**. Um banco adicionado depois precisa de nova autorização ([docs: Item](https://docs.pluggy.ai/docs/item), [README oficial](https://github.com/pluggyai/meu-pluggy)).
7. Com `clientId` + `clientSecret`, o programa chama `POST https://api.pluggy.ai/auth` e recebe uma `apiKey`. Depois chama `GET /accounts?itemId=…`, `GET /transactions?accountId=…` etc. com o header `X-API-KEY` ([docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use), [guia de API](https://meu.pluggy.ai/api-guide)).

O item na aplicação é um **proxy**. O consentimento com o banco fica no Meu Pluggy, e o item da aplicação só espelha a conexão original ([guia de API](https://meu.pluggy.ai/api-guide), [docs: Item](https://docs.pluggy.ai/docs/item)). Existem, portanto, **duas autorizações empilhadas**:

- o consentimento Open Finance de cada banco, dentro do Meu Pluggy;
- a autorização "Meu Pluggy → aplicação", que dura 1 ano ([docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use)).

## 1. O que o Meu Pluggy oferece à pessoa física para acesso programático

| Mecanismo | Existe? | Detalhe | Fonte |
|---|---|---|---|
| `clientId` / `clientSecret` | **Sim** | São da *aplicação* que a pessoa cria no Dashboard, não do Meu Pluggy. "As credenciais ficam no dashboard.pluggy.ai, na aba 'Aplicação'." Valem para todas as conexões da aplicação, e não há uma credencial por banco. | [pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy) |
| API key (`apiKey`) | **Sim** | Sai de `POST /auth` com clientId/secret. Dura **2 h** e dá acesso total à API. | [docs: Authentication](https://docs.pluggy.ai/docs/authentication) |
| Connect Token | **Sim** | Sai de `POST /connect_token` com a apiKey e dura **30 min**. Serve para abrir o widget Pluggy Connect. O escopo é só o item criado com ele, e ele não lê dados detalhados (devolve 403). | [docs: Authentication](https://docs.pluggy.ai/docs/authentication) |
| Pluggy Connect (widget) | **Sim** | É o widget que a página *Demo* do Dashboard usa para autorizar o conector MeuPluggy. Há SDKs para React Native, Flutter, iOS, Android e WebView. | [docs: Connect](https://docs.pluggy.ai/en/docs/connect-widget/introduction), [docs: Environments](https://docs.pluggy.ai/en/docs/connect-widget/environments) |
| OAuth "Entrar com Meu Pluggy" para um app qualquer | **Não encontrado** | O único OAuth do Meu Pluggy é o do conector MeuPluggy, e ele sempre aponta para uma *aplicação Pluggy* (com clientId/secret). Nenhuma fonte documenta cliente OAuth independente para apps de terceiros. | [docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use), [README](https://github.com/pluggyai/meu-pluggy) |
| MCP / CLI de dados do Meu Pluggy | **Anunciado, não documentado** | A home do Meu Pluggy cita "API, MCP, CLI", mas não encontrei documentação de MCP ou CLI para dados do usuário. O MCP oficial documentado (`mcp.pluggy.ai/mcp`) é de **documentação**: com login, mostra times, aplicações, conectores, items e uso do Dashboard. | [meu.pluggy.ai](https://meu.pluggy.ai), [docs: MCP](https://docs.pluggy.ai/en/docs/developer-tools/mcp) |

## 2. Como o app descobre as conexões (items) e as contas

- **Não dá para listar items.** `GET /v2/items` devolve `403` (`LIST_ITEMS_FEATURE_NOT_ENABLED`) e "cannot be enabled on the Free plan or on Meu Pluggy personal-use accounts" ([docs: Item](https://docs.pluggy.ai/docs/item), [docs: FAQ](https://docs.pluggy.ai/en/docs/get-started/faq)). O guia do Meu Pluggy é taxativo: "Não é possível habilitar […] o suporte não vai alterar isso" ([guia de API](https://meu.pluggy.ai/api-guide)). O OpenAPI não tem outro endpoint de listagem de items além de `/v2/items` ([OAS](https://api.pluggy.ai/oas3.json)).
- **O caminho é guardar o `itemId` de cada banco** e consultar com `GET /items/{id}` ([guia de API](https://meu.pluggy.ai/api-guide)). Há três formas de obter o id:
  - **Copiar do Dashboard.** Em *Demo → Connected Items*, o id tem um botão de copiar ([docs: Dashboard](https://docs.pluggy.ai/en/docs/guides/dashboard-connectors)). O usuário cola o id no app.
  - **Callback `onSuccess` do widget.** O callback traz `item.id` ([docs: Authentication](https://docs.pluggy.ai/docs/authentication), [docs: Connect](https://docs.pluggy.ai/en/docs/connect-widget/introduction)). Se o próprio app abrir o Pluggy Connect com `selectedConnectorId`/`connectorIds` = 200, ele recebe o id sem o usuário copiar nada ([docs: Environments](https://docs.pluggy.ai/en/docs/connect-widget/environments)). **Não documentado especificamente para o conector MeuPluggy: validar em protótipo.** Abrir o widget exige um Connect Token, que exige a apiKey, ou seja, o segredo do usuário no celular.
  - **Webhook `item/created`.** Os items proxy recebem webhooks ([docs: Item](https://docs.pluggy.ai/docs/item)), mas o webhook exige uma URL HTTPS pública ([docs: Webhooks](https://docs.pluggy.ai/en/docs/reference/webhooks)). Isso significa servidor, então **não serve** sem backend.
- **Contas:** com o `itemId`, `GET /accounts?itemId=…` lista as contas e cartões. Depois `GET /transactions?accountId=…` traz as transações ([docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use)).
- **O `itemId` pode mudar.** A autorização Meu Pluggy → aplicação vence em 1 ano. Ao renová-la, "Do not assume the same itemId": verifique em qual item estão os dados e reconcilie transações pelos ids delas ([docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use)). Isso afeta o modelo de dados local.

## 3. Custo, limites, rate limits e validade de tokens

**Custo**

- Meu Pluggy + acesso à API por ele: **grátis, "por tempo indeterminado, sem prazo de expiração"**, sem aprovação e self-service ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)). Também não exige due diligence nem liberar dados reais no Dashboard, e o trial não vence para esse uso ([guia de API](https://meu.pluggy.ai/api-guide)).
- **Histórico divergente:** o README antigo fala em trial de 15 dias ([README](https://github.com/pluggyai/meu-pluggy)). Em 2024 e 2025, um membro da Pluggy respondeu que era preciso configurar o conector MeuPluggy **antes** do fim do trial, e que extensões eram pedidas no Discord ([issue #10](https://github.com/pluggyai/meu-pluggy/issues/10), [issue #12](https://github.com/pluggyai/meu-pluggy/issues/12)). A posição atual das páginas oficiais é que o trial não afeta o uso pessoal ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy), [preços](https://www.pluggy.ai/precos)).
- Plano pago (para produtos com usuários de terceiros): **a partir de R$ 2.500/mês** com até 500 conexões ativas ([preços](https://www.pluggy.ai/precos)).

**Limites do plano grátis**

- Até **5 conexões ativas**, todas de contas **do mesmo titular**. Contas de cônjuge ou familiar não entram no plano grátis ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy), [docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use)). A FAQ da documentação diz que hoje uma conta Meu Pluggy *aceita* bancos de titulares diferentes, mas que isso está "em revisão por compliance" e pode ser restringido ([docs: FAQ](https://docs.pluggy.ai/en/docs/get-started/faq)).
- Aplicação em ambiente *Development*: limite de **100 items** ([docs: FAQ](https://docs.pluggy.ai/en/docs/get-started/faq)). Para o caso de até 5 bancos, isso é irrelevante.
- Sem SLA nem contrato ([preços](https://www.pluggy.ai/precos)). Suporte do uso pessoal só pela comunidade no Discord ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)).

**Rate limits da API** ([docs: Rate limits](https://docs.pluggy.ai/docs/rate-limits))

- **360 req/min por IP e por endpoint** em `POST /auth`, `GET /accounts`, `GET /transactions`, `GET /investments` e `GET /investments/{id}/transactions`. `PATCH /items` tem 20 req/min.
- Ao estourar, a API devolve `429` com `Retry-After: 60`. A página não fala de diferença por plano.
- A contagem é **por IP**, "explicitly *not* per account and not per API key" ([docs: multi-tenant](https://docs.pluggy.ai/en/docs/get-started/multi-tenant-applications)). Chamando de cada celular, cada usuário tem a própria cota. Num proxy do autor, todos dividiriam a cota de um IP.
- Não encontrei cota mensal de requisições documentada para o uso pessoal. A [página de preços](https://www.pluggy.ai/precos) fala em cobrança por requisição só nos planos pagos. **Não confirmado.**
- Os limites operacionais **mensais** do Open Finance (por CPF, instituição e produto) limitam com que frequência a *Pluggy sincroniza com o banco* ([docs: OF rate limits](https://docs.pluggy.ai/en/docs/open-finance/rate-limits)). As leituras do app vêm da base da Pluggy, que coleta da instituição "and storing it on our DB" ([docs: Item](https://docs.pluggy.ai/docs/item)). Por inferência, ler a API não consome esses limites.

**Validade e renovação de credenciais e tokens**

| O quê | Validade | Renovação | Fonte |
|---|---|---|---|
| `clientSecret` | Sem validade documentada | "Generate new secret" no Dashboard (só Owner/Admin). O anterior para **na hora**. Também rotaciona ao mover a aplicação para produção. | [docs: Dashboard](https://docs.pluggy.ai/en/docs/guides/dashboard-connectors) |
| `apiKey` | **2 h** | Novo `POST /auth` com clientId/secret | [docs: Authentication](https://docs.pluggy.ai/docs/authentication) |
| Connect Token | **30 min** | Novo `POST /connect_token`. Recomendado 1 por conexão. | [docs: Authentication](https://docs.pluggy.ai/docs/authentication) |
| Autorização Meu Pluggy → aplicação (items proxy) | **1 ano** (`consentExpiresAt` no item) | Repetir o passo do Demo/MeuPluggy com login humano. **Não renova** por API nem por sync. Depois de vencer, as leituras voltam **vazias**, e o próximo update vai a `LOGIN_ERROR` / `USER_AUTHORIZATION_EXPIRED`. | [docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use) |
| Consentimento Open Finance de cada banco (dentro do Meu Pluggy) | Por padrão a Pluggy pede consentimento **sem expiração**. O usuário pode revogar no app do banco, e alguns conectores (ex.: Inter PJ) vencem em 1 ano. | Reconectar o banco no Meu Pluggy | [docs: Consents](https://docs.pluggy.ai/docs/consents) |

## 4. Dá para chamar a API direto do celular com o segredo do próprio usuário?

**Tecnicamente, sim.**

- A API é REST sobre HTTPS, com autenticação por header `X-API-KEY` ([docs: Authentication](https://docs.pluggy.ai/docs/authentication)).
- Não há allowlist de IP documentada. O rate limit é por IP ([docs: Rate limits](https://docs.pluggy.ai/docs/rate-limits)).
- Observado em 2026-11-08 com `curl`: o preflight CORS de `POST https://api.pluggy.ai/auth` responde `Access-Control-Allow-Origin: *`, com os métodos GET/POST/PATCH/DELETE permitidos. Até uma stack baseada em WebView/JS conseguiria chamar a API direto. Isso é **comportamento observado, não contrato documentado.**
- SDKs oficiais existem só para servidor (Node, .NET, Java), mais um SDK Python da comunidade. A Pluggy publica o OpenAPI para gerar clientes em outras linguagens ([docs: SDKs](https://docs.pluggy.ai/docs/server-side-sdks), [OAS](https://api.pluggy.ai/oas3.json)).
- A [página do Meu Pluggy](https://www.pluggy.ai/meu-pluggy) diz: "Com o Client ID e o Client Secret você consome a api.pluggy.ai **de onde quiser**: planilha, app self-hosted, automação ou agente de IA."

**O que a documentação recomenda contra isso, e por quê:**

- A documentação de autenticação diz que clientId/secret são "extremely sensitive" e que o `POST /auth` deve ser feito "in your secured server only" ([docs: Authentication](https://docs.pluggy.ai/docs/authentication)).
- O fluxo padrão do widget pressupõe um backend que emite Connect Tokens ([docs: Connect](https://docs.pluggy.ai/en/docs/connect-widget/introduction)).
- A regra oficial de agent skills da Pluggy marca como CRITICAL "Use API Keys Only on Backend" e dá como exemplo errado o `clientSecret` no frontend ([pluggyai/agent-skills](https://github.com/pluggyai/agent-skills/blob/1e3ac7f062151cc0a9f06a95de9c33083402d1c9/skills/pluggy-integration/rules/auth-api-keys.md)).

Essas recomendações miram o modelo empresa: **um** segredo da empresa que dá acesso aos dados de **todos** os clientes, e que no frontend vazaria para todos. No modelo pessoal, o segredo é do próprio usuário e só alcança a aplicação dele. Items de uma aplicação "are reachable only with that application's credentials" ([docs: multi-tenant](https://docs.pluggy.ai/en/docs/get-started/multi-tenant-applications)). O risco real é outro: quem pegar o segredo no celular lê **todos os dados financeiros daquele usuário**.

Mitigações documentadas:

- rotacionar o segredo, o que invalida o anterior na hora ([docs: Dashboard](https://docs.pluggy.ai/en/docs/guides/dashboard-connectors));
- excluir o cadastro no Meu Pluggy, o que encerra a autorização na hora ([docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use)).

Guardar o segredo no Keystore (Android) ou no Keychain (iOS) é decisão de arquitetura, fora desta pesquisa.

**O modelo exige backend?** Só para estas coisas:

- **Webhooks**, que exigem URL HTTPS pública ([docs: Webhooks](https://docs.pluggy.ai/en/docs/reference/webhooks)). Sem backend, o app consulta `GET /items/{id}` (`lastUpdatedAt`, `status`, `consentExpiresAt`) quando abre.
- **Esconder um segredo do autor.** Isso só existe nos modelos em que a aplicação Pluggy é do autor, e esses modelos violam o plano grátis (seção 5).

## 5. O que os termos dizem sobre app de terceiros e distribuição

- **Permitido no grátis:** usar as próprias credenciais em "ferramentas que já existem, tipo planilhas ou apps de finanças open source", "app self-hosted, automação ou agente de IA", ou "construir uma ferramenta pessoal" ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)). A documentação dá como exemplo "an app only you use" ([docs: uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use)).
- **Exige plano pago:**
  - "mais de 5 conexões ativas";
  - "conectar contas de outras pessoas";
  - "conectar direto no banco sem passar pelo Meu Pluggy";
  - "**usar os dados dentro de um produto para outras pessoas**".

  Também: "Posso usar essa API para fins comerciais? Não." ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)).
- "São contas de outras pessoas — Você está construindo um produto, um app ou um serviço em que os seus usuários vão conectar as contas deles. **O Meu Pluggy não atende esse caso.** O caminho é a Pluggy API." ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)).
- A [página de preços](https://www.pluggy.ai/precos) admite que uma empresa usar o conector 200 para os próprios usuários é "tecnicamente" possível. Aponta, porém, limites sérios: fricção de onboarding, 5 conexões por titular, sem SLA nem contrato. E conclui: "Se você está construindo algo para outros usuários, os planos comerciais são o caminho."
- Os **Termos e Condições de Uso** públicos da Pluggy são voltados ao titular dos dados. Não têm cláusula sobre credenciais de API, apps de terceiros ou redistribuição. Dizem que a Pluggy pode "incluir ou remover funcionalidades […] suspender ou encerrar um Serviço" e que os serviços são fornecidos "na forma em que estão" ([Termos](https://www.pluggy.ai/docs/termos-e-condicoes-de-uso.pdf)). **Não encontrei termos públicos específicos do Dashboard de desenvolvedores.** Se o cadastro no Dashboard apresentar termos próprios, não deu para verificá-los sem login.
- **Precedente:** o Actual Budget, app de finanças open source, documenta a integração com a Pluggy pelo Meu Pluggy. Nela, cada usuário informa o próprio Client ID/Secret e Item ID ([Actual Budget docs](https://actualbudget.org/docs/advanced/bank-sync/pluggyai), fonte secundária).

**Leitura para este app.** Um app distribuído aos amigos em que **cada um** usa o próprio Meu Pluggy e a própria aplicação, sem dado nem credencial passando pelo autor, cabe na letra do FAQ ("apps de finanças open source", "ferramenta pessoal"). Já um app em que os amigos conectam as contas **na aplicação Pluggy do autor** cai em "conectar contas de outras pessoas" e "produto para outras pessoas", e exige plano pago. A zona cinzenta é publicar na Play Store ou na App Store um app "traga suas credenciais" para o público. Não achei fonte que trate esse caso. O canal oficial para tirar a dúvida é o Discord ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)).

## 6. Com que frequência os dados atualizam, e se dá para forçar

- A conexão original, dentro do Meu Pluggy, atualiza **a cada 24 h**, automática e grátis. Essa cadência pertence ao próprio serviço ("belongs to the service itself") e não depende do plano da aplicação ([docs: Item](https://docs.pluggy.ai/docs/item), [guia de API](https://meu.pluggy.ai/api-guide), [pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)).
- O item proxy na aplicação **reflete toda atualização** da original, mas não roda auto-sync próprio. Por isso `nextAutoSyncAt` vem `null`, o que não indica conexão quebrada ([docs: Item](https://docs.pluggy.ai/docs/item), [guia de API](https://meu.pluggy.ai/api-guide)).
- **Não dá para forçar.** O item proxy "cannot be updated through the API (no update/`PATCH`)" ([docs: Item](https://docs.pluggy.ai/docs/item)). O Q&A curado da Pluggy diz que, no uso pessoal, "não é necessário (nem possível) disparar a atualização manualmente" (servidor MCP oficial `https://mcp.pluggy.ai/mcp`, ferramenta `search_qa`, consultado em 2026-11-08; [docs: MCP](https://docs.pluggy.ai/en/docs/developer-tools/mcp)). Um relato da comunidade mostra `PATCH /items/{id}` devolvendo `400 "MeuPluggy item cant be updated"` ([issue #26](https://github.com/pluggyai/meu-pluggy/issues/26)).
- Latência extra do Open Finance: transações novas podem levar **até 24 h** para ficar disponíveis ([docs: FAQ](https://docs.pluggy.ai/en/docs/get-started/faq)). Ou seja, um gasto pode levar até cerca de 48 h para aparecer no app (inferência: 24 h do ciclo + 24 h do Open Finance).
- No sync, a Pluggy recoleta até 4 dias antes do último update bem-sucedido. Na criação do item, traz até 365 dias de histórico ([docs: Item](https://docs.pluggy.ai/docs/item)). Que o item proxy herda o histórico da conexão original é **inferência, não confirmada**.
- Se o Meu Pluggy tem um botão de "atualizar agora" na interface web, **não está documentado**.

## Confirmado vs. não claro

| Afirmação | Status |
|---|---|
| A pessoa física acessa por clientId/secret de uma aplicação no Dashboard + conector MeuPluggy (200) | Confirmado ([docs](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use), [guia](https://meu.pluggy.ai/api-guide)) |
| Grátis, sem prazo, até 5 conexões do mesmo titular, sem uso comercial | Confirmado ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)) |
| Usar as próprias credenciais num app de finanças de terceiros (open source/self-hosted) é aceito | Confirmado ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)) |
| App em que usuários conectam contas na aplicação do autor exige plano pago | Confirmado ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)) |
| Distribuir na loja um app "traga suas credenciais" é aceito no grátis | **Não claro.** Nenhuma fonte trata o caso. |
| `GET /v2/items` indisponível, itemId precisa ser guardado | Confirmado ([docs](https://docs.pluggy.ai/docs/item)) |
| O app pode criar o item proxy abrindo o Pluggy Connect com o conector 200 (sem passar pelo Demo) | **Não documentado.** Plausível, já que o Demo usa o mesmo widget. Validar em protótipo. |
| apiKey 2 h, Connect Token 30 min, autorização Meu Pluggy 1 ano | Confirmado ([auth](https://docs.pluggy.ai/docs/authentication), [uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use)) |
| Atualização a cada 24 h, sem como forçar | Confirmado ([docs](https://docs.pluggy.ai/docs/item)) |
| CORS aberto (`*`) em `api.pluggy.ai` | Observado, não documentado |
| Cota mensal de requisições no uso pessoal | **Não documentada** |
| Termos de desenvolvedor do Dashboard | **Não encontrados** publicamente |
| MCP/CLI de dados do Meu Pluggy anunciados na home | **Sem documentação** encontrada |

## Sinais de risco (relatos da comunidade, não oficiais)

O repositório oficial `pluggyai/meu-pluggy` tem issues abertas e recentes que valem como alerta:

- [#27](https://github.com/pluggyai/meu-pluggy/issues/27) (out/2026): conta nova no Meu Pluggy com o botão "Conectar minha conta" desabilitado antes da primeira conexão. Está sem resposta oficial, o que é um **risco para o onboarding dos amigos**.
- [#26](https://github.com/pluggyai/meu-pluggy/issues/26) (set/2026): uma conexão do Inter parou de atualizar sem nenhum sinal de erro. O autor do relato lê a API "a partir de um app pessoal", o mesmo padrão deste projeto.
- [#28](https://github.com/pluggyai/meu-pluggy/issues/28): caixinhas (RDB) do Nubank não aparecem em `/investments` via MeuPluggy.
- [#24](https://github.com/pluggyai/meu-pluggy/issues/24): XP com investimentos zerados.

Esses dois últimos interessam ao ticket [#3](https://github.com/Kaioabreu/financas/issues/3).

## Implicações para o app

Opções de integração, sem decidir (a decisão é de outro ticket):

**A. "Traga suas credenciais", com o segredo no celular e item copiado do Dashboard.**
O usuário faz o fluxo oficial no Meu Pluggy e no Dashboard e cola no app o `clientId`, o `clientSecret` e um `itemId` por banco. O app chama `api.pluggy.ai` direto.
- A favor: **cabe no plano grátis e no FAQ** da Pluggy. Zero servidor do autor. Cada usuário tem a própria cota de rate limit. Segue o caminho oficial documentado.
- Contra: onboarding pesado (dois cadastros, habilitar conector, autorizar por banco, copiar ids e segredo). Segredo sensível no aparelho. Renovação anual manual no Dashboard, e o itemId pode mudar.

**B. Como A, mas o app cria os items proxy sozinho.**
Com o segredo do usuário, o app gera um Connect Token e abre o Pluggy Connect (SDK React Native/Flutter/WebView) já no conector MeuPluggy (200), com deep link de `oauthRedirectUri` ([docs: OAuth](https://docs.pluggy.ai/en/docs/connect-widget/oauth-support)). Recebe o `itemId` pelo `onSuccess`.
- A favor: elimina a cópia de itemIds e o passo do Demo. A renovação anual pode acontecer dentro do app.
- Contra: **não documentado para o conector 200, precisa de protótipo.** Continua exigindo o cadastro no Dashboard e a cópia de clientId/secret.

**C. Aplicação Pluggy única do autor, com proxy stateless guardando o segredo do autor.**
Os amigos autorizam o Meu Pluggy deles na aplicação do autor.
- A favor: onboarding mais simples para o amigo (só Meu Pluggy + OAuth).
- Contra: **viola o plano grátis** ("conectar contas de outras pessoas", "produto para outras pessoas"). Exige plano pago, a partir de R$ 2.500/mês. O autor passaria a ter acesso técnico aos dados dos amigos, o que contraria "ninguém vê dados de outra pessoa". O limite de 5 conexões por titular continua valendo. **Na prática, descartada.**

**D. Plano pago da Pluggy, com conexão direta aos bancos no app.**
- Fora do escopo de um app pessoal pelo custo, e exige backend para o segredo. Fica registrada só por completude.

Pontos que valem para A e B e alimentam tickets do mapa:

- **Sem proxy.** No modelo grátis não há segredo do autor a proteger, então o "plano B: proxy stateless" do mapa perde a razão de existir. Um proxy só faria sentido nos modelos C e D.
- **Sincronização.** Sem webhook, o app consulta ao abrir ou ao puxar para atualizar. Os dados mudam no máximo uma vez a cada 24 h, e não há como forçar.
- **Estados degradados.** O app precisa tratar:
  - `consentExpiresAt` no passado, com leituras vazias mesmo com status `UPDATED`;
  - `LOGIN_ERROR` / `USER_AUTHORIZATION_EXPIRED`;
  - troca de `itemId` na renovação anual.
- **Dados locais.** Reconciliar transações pelo id da transação, não pelo itemId.
