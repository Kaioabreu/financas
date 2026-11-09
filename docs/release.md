# Processo de release

O app tem um binário só (APK, canal `production`). Mudanças de JS chegam em silêncio pelo EAS Update; mudanças nativas exigem um APK novo.

## Como o app atualiza

- `expo-updates` com `checkAutomatically: ON_LOAD` e `fallbackToCacheTimeout: 0`: o app verifica ao abrir, baixa em segundo plano e aplica na abertura seguinte, sem perguntar.
- `runtimeVersion` segue a política `appVersion`: um OTA só chega a APKs com a mesma `version` do `app.config.ts`.
- Builds de desenvolvimento e `expo start` rodam com o Updates desligado (Configurações → Sobre mostra "versão embutida").

## Canário (celular do autor)

Em Configurações → Sobre, 7 toques seguidos na linha da versão trocam o celular entre `production` e `preview` (override do cabeçalho `expo-channel-name`, `Updates.setUpdateRequestHeadersOverride`, persistido pelo expo-updates). Outros 7 toques devolvem. A linha mostra "canal preview" enquanto estiver no canário. A troca puxa o último update do canal na hora, se houver, e vale de qualquer forma na próxima abertura.

O cabeçalho precisa estar declarado em `updates.requestHeaders` no `app.config.ts`; sem isso o override é recusado.

## Publicar uma mudança de JS

1. `npx tsc --noEmit` e `npm test` verdes.
2. Publicar em `preview`: `eas update --channel preview --message "..."`.
3. Trocar o celular do autor para o canal `preview` (7 toques) e usar por **pelo menos 1 dia**.
4. Se estiver bom, promover à mão para `production`: `eas update:republish --channel production` (ou `eas update --channel production` do mesmo commit). Nunca publicar direto em `production`.
5. Voltar o celular para `production` (7 toques).

**Nunca `eas update:rollback`.** Se um OTA ruim chegou, publique um novo OTA corrigido por cima.

## Mudança nativa

Adicionar/atualizar módulo nativo, mudar plugin, permissão ou `app.config.ts` nativo: **suba a `version`** no `app.config.ts` (novo `runtimeVersion`, os APKs antigos não recebem esse JS) e gere um APK novo. Receita de build local: ver a memória do autor / `eas build --profile production --platform android`.

## Distribuição do APK (Firebase App Distribution)

1. Gerar o APK de produção (`eas build --profile production --platform android` ou build local).
2. No console do Firebase, App Distribution, subir o APK e convidar os amigos **por e-mail**. Não há SDK do Firebase no app; o Firebase só entrega o arquivo.
3. Quem já tem o app recebe JS novo pelo OTA, sem novo APK, salvo mudança nativa.

## Passo do autor (fora do repo)

Guarde o backup das credenciais de assinatura (`eas credentials`: baixar o keystore e as senhas) num gerenciador de senhas e numa cópia offline. Sem elas não há como publicar atualização do mesmo app.
