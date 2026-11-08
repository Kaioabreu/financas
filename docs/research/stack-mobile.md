# Stack multiplataforma para um app financeiro local-first

Pesquisa do ticket [#4](https://github.com/Kaioabreu/financas/issues/4). Feita em 2026-11-08.

**Legenda.** **[confirmado]**: fato tirado da fonte primária citada ao lado. **[opinião]**: julgamento meu, com base nos fatos. Toda afirmação de fato tem link.

**Resumo.** A recomendação é **React Native com Expo (SDK 58)**. Detalhes em [Recomendação](#recomendação) e [Riscos](#riscos).

---

## Contexto que pesa na escolha

- O autor sabe Python, tem pouca experiência em mobile e desenvolve no Windows.
- Distribuição: agora um APK instalado direto no Android. Depois, iOS e as lojas.
- Os dados vivem só no aparelho: banco local cifrado, credenciais em secure storage, bloqueio por biometria.
- Pelo ticket [#2](https://github.com/Kaioabreu/financas/blob/research/autorizacao-meu-pluggy/docs/research/autorizacao-meu-pluggy.md), o app guarda no aparelho o **clientSecret** do Pluggy de cada usuário e um itemId por banco, e chama `api.pluggy.ai` direto. Por isso, guardar esse segredo no Keystore (Android) ou no Keychain (iOS) é **requisito obrigatório**.
- Não há webhooks, porque eles exigiriam um servidor. O app busca dados novos ao abrir, e a busca em segundo plano é no máximo um extra.

## Versões atuais (novembro de 2026)

| Stack | Versão estável | Fonte |
|---|---|---|
| Expo SDK | 58 (lançado em 15/10/2026), com React Native 0.88 | [changelog do Expo](https://expo.dev/changelog), [guia de upgrade do SDK 58](https://expo.dev/blog/how-to-upgrade-to-sdk-58) |
| React Native | 0.88.1 (27/10/2026). O repositório agora fica em `react/react-native` | [releases no GitHub](https://github.com/react/react-native/releases) |
| Flutter | 3.47.9 (29/10/2026), com Dart 3.13.7 | [feed oficial de releases](https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json) |
| Compose Multiplatform | 1.12.2 (15/10/2026). A 1.13 está em beta | [releases no GitHub](https://github.com/JetBrains/compose-multiplatform/releases) |
| Kotlin | 2.4.21 (08/10/2026) | [releases no GitHub](https://github.com/JetBrains/kotlin/releases) |

**[confirmado]** O Kotlin Multiplatform e o Compose Multiplatform estão marcados como **Stable** para Android e iOS ([plataformas suportadas](https://kotlinlang.org/docs/multiplatform/supported-platforms.html)).

---

## 1. Curva de aprendizado e documentação para iniciante

### React Native / Expo

- **[confirmado]** A documentação oficial do React Native recomenda começar um app novo com um framework e cita o Expo: *"if you're building a new app with React Native, we recommend using a Framework"* ([reactnative.dev](https://reactnative.dev/docs/environment-setup)).
- **[confirmado]** O Expo tem um tutorial passo a passo para Android, iOS e web ([tutorial](https://docs.expo.dev/tutorial/introduction/)).
- **[confirmado]** Dá para começar sem instalar Android Studio: o app Expo Go roda o projeto no celular. Para bibliotecas nativas fora do Expo Go, como o SQLCipher, é preciso um *development build*. Ele pode ser gerado na nuvem pelo EAS sem toolchain nativa, ou localmente com `npx expo run:android`, que exige Android Studio ([development builds](https://docs.expo.dev/develop/development-builds/introduction/)).
- **[confirmado]** As mudanças de código aparecem na hora com o Fast Refresh ([Fast Refresh](https://reactnative.dev/docs/fast-refresh)).
- **[confirmado]** O próprio ecossistema do Pluggy é JavaScript/TypeScript: o SDK oficial em Node ([pluggy-node](https://github.com/pluggyai/pluggy-node)) e o [quickstart](https://github.com/pluggyai/quickstart).
- **[opinião]** Para quem vem de Python, TypeScript é o caminho de menor atrito: muito material, tipagem opcional e gradual, e o mesmo idioma do Pluggy. O ponto fraco é o excesso de escolhas no ecossistema JS. A lista fechada em [Recomendação](#recomendação) resolve isso.

### Flutter

- **[confirmado]** A documentação é extensa, com codelabs e guias de primeiros passos ([get started](https://docs.flutter.dev/get-started), [codelab](https://docs.flutter.dev/get-started/codelab)) e o tour da linguagem Dart ([dart.dev](https://dart.dev/language)). O hot reload é nativo da ferramenta ([hot reload](https://docs.flutter.dev/tools/hot-reload)).
- **[confirmado]** O Flutter está no meio de uma transição: Material e Cupertino estão saindo do SDK para os pacotes `material_ui` e `cupertino_ui`. As bibliotecas embutidas estão congeladas desde a 3.44 e têm "formal deprecation in an upcoming stable release" ([guia de migração](https://docs.flutter.dev/release/breaking-changes/material-ui-and-cupertino-ui)).
- **[opinião]** Dart é fácil para quem sabe Python. Mas é uma linguagem que só serve para Flutter, e a transição do Material agora é um custo a mais para um iniciante, porque tutoriais e pacotes vão ficar misturados entre os dois estilos de import.

### Kotlin / Compose Multiplatform

- **[confirmado]** Para gerar o app iOS é preciso um Mac com Xcode: *"To create iOS applications, you need a macOS machine with Xcode installed"* ([quickstart do KMP](https://kotlinlang.org/docs/multiplatform/quickstart.html)).
- **[confirmado]** O Compose Hot Reload só está documentado para desktop (JVM). No celular, não há hot reload equivalente documentado ([Compose Hot Reload](https://kotlinlang.org/docs/multiplatform/compose-hot-reload.html)).
- **[confirmado]** O que é específico de cada plataforma se escreve com `expect`/`actual` ([expect/actual](https://kotlinlang.org/docs/multiplatform/multiplatform-expect-actual.html)).
- **[opinião]** É a curva mais íngreme para um iniciante: Gradle, Kotlin/Native e escrever ponte para APIs de cada plataforma, como Keychain e biometria (ver §3). É excelente para quem já domina Android nativo, que não é o caso aqui.

---

## 2. APK sem loja, caminho para as lojas e atualização OTA

### React Native / Expo

- **[confirmado] APK.** Um perfil do `eas.json` com `"buildType": "apk"` e o comando `eas build -p android --profile preview` geram o APK. Para instalar, basta abrir a URL do APK no celular ([APK com EAS](https://docs.expo.dev/build-reference/apk/)). Com `"distribution": "internal"` sai um APK com link para compartilhar ([internal distribution](https://docs.expo.dev/build/internal-distribution/)).
- **[confirmado] Assinatura.** O EAS gera e guarda a keystore Android ([Expo Build](https://docs.expo.dev/build/introduction/)). Ela pode ser baixada para um `credentials.json` com `eas credentials` ([syncing credentials](https://docs.expo.dev/app-signing/syncing-credentials/)).
- **[confirmado] Lojas.** O mesmo serviço gera o AAB da Play Store e builds iOS em *runners* macOS na nuvem do Expo, ou seja, sem Mac próprio ([Expo Build](https://docs.expo.dev/build/introduction/)). Para distribuir no iOS, mesmo em ad hoc, é preciso a conta paga do Apple Developer ([internal distribution](https://docs.expo.dev/build/internal-distribution/)).
- **[confirmado] OTA.** O EAS Update atualiza JS, estilos e imagens pelo ar. Mudanças em código nativo, permissões ou versão do SDK exigem um binário novo ([EAS Update](https://docs.expo.dev/eas-update/introduction/)). Por padrão, o app procura atualização no *cold boot* sem travar a abertura ([download de updates](https://docs.expo.dev/eas-update/download-updates/)). O protocolo é aberto e pode ter servidor próprio ([especificação expo-updates](https://docs.expo.dev/technical-specs/expo-updates-1/)).
- **[confirmado] Plano gratuito.** 15 builds Android e 15 iOS, e EAS Update para 1.000 usuários ativos por mês ([preços](https://expo.dev/pricing)). Os limites renovam todo mês e os builds gratuitos têm baixa prioridade ([planos](https://docs.expo.dev/billing/plans/)).
- **[confirmado] Build local.** `eas build --local` **não** tem suporte oficial no Windows, só em macOS e Linux ([local builds](https://docs.expo.dev/build-reference/local-builds/)). A alternativa no Windows é `npx expo prebuild` mais Gradle ([build de produção local](https://docs.expo.dev/guides/local-app-production/)).

### Flutter

- **[confirmado] APK.** `flutter build apk --split-per-abi` gera o APK, com assinatura configurada via `key.properties`, e há instruções para PowerShell ([deploy Android](https://docs.flutter.dev/deployment/android)).
- **[confirmado] iOS.** *"You must use a device running macOS"* ([deploy iOS](https://docs.flutter.dev/deployment/ios)). **[opinião]** Sem Mac, o build iOS depende de CI de terceiros.
- **[confirmado] OTA.** Não existe solução oficial do Flutter. A guia de deploy Android não fala de OTA ([deploy Android](https://docs.flutter.dev/deployment/android)). A opção é o **Shorebird**, de terceiros, que só altera código Dart: código nativo, assets e engine ficam de fora ([Shorebird code push](https://docs.shorebird.dev/code-push/)). O plano grátis dá 5.000 instalações de patch por mês ([preços do Shorebird](https://shorebird.dev/pricing/)).

### Kotlin / Compose Multiplatform

- **[confirmado] APK.** É o build Android padrão via Gradle. iOS exige Mac ([quickstart do KMP](https://kotlinlang.org/docs/multiplatform/quickstart.html)).
- **[confirmado] OTA.** Não há caminho. A política da Play proíbe baixar código executável (dex, JAR, .so) de fora da Play e só abre exceção para código interpretado, como JavaScript ([política da Play](https://support.google.com/googleplay/android-developer/answer/9888379)). O app KMP é compilado, então toda mudança exige um APK novo.

### Políticas de OTA nas lojas (valem para qualquer stack)

- **[confirmado]** Na Play, código que roda num interpretador está fora da proibição ([política da Play](https://support.google.com/googleplay/android-developer/answer/9888379)).
- **[confirmado]** Na Apple, a diretriz 2.5.2 proíbe baixar código *"which introduces or changes features or functionality of the app"* ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)). O Expo avisa que é preciso seguir as regras de cada loja ([EAS Update](https://docs.expo.dev/eas-update/introduction/)).
- **[opinião]** Na App Store, o OTA serve para correções, não para funcionalidades novas.

---

## 3. Banco local cifrado, secure storage e biometria

O clientSecret do Pluggy fica no aparelho, então o secure storage é requisito obrigatório.

### React Native / Expo

- **[confirmado] Banco cifrado.** O `expo-sqlite` (SDK 58) suporta SQLCipher no Android e no iOS pela opção `useSQLCipher` do *config plugin*. A chave é passada com `PRAGMA key` ([expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/)). **Cuidado:** se o binário não tiver SQLCipher, o que acontece no Expo Go ou sem rebuild, o `PRAGMA key` não faz nada e o banco fica **sem cifra, sem erro**. A documentação manda verificar com `PRAGMA cipher_version` ([expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/)).
- **[confirmado] ORM.** O Drizzle ORM funciona sobre o `expo-sqlite`, com migrações embutidas (`useMigrations`) e consultas reativas (`useLiveQuery`) ([Drizzle + Expo SQLite](https://orm.drizzle.team/docs/connect-expo-sqlite)).
- **[confirmado] Alternativa.** O `op-sqlite` também tem SQLCipher (`"sqlcipher": true`) e não roda no Expo Go ([op-sqlite](https://op-engineering.github.io/op-sqlite/docs/installation)).
- **[confirmado] Secure storage.** No Android, o `expo-secure-store` grava em SharedPreferences cifradas com o Android Keystore. No iOS, grava no Keychain ([expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/)). Ressalvas da própria documentação:
  - os dados somem ao desinstalar no Android;
  - o Auto Backup é configurado para ignorar esses dados;
  - com `requireAuthentication`, as chaves são invalidadas quando a biometria muda (um dedo novo cadastrado, por exemplo);
  - não serve como fonte única de dados insubstituíveis.
- **[confirmado] Chave do banco.** O `expo-crypto` gera bytes aleatórios nativos. Prefira `getRandomBytesAsync` ou `getRandomValues`, porque o `getRandomBytes` síncrono cai para `Math.random` em desenvolvimento ([expo-crypto](https://docs.expo.dev/versions/latest/sdk/crypto/)).
- **[confirmado] Biometria.** O `expo-local-authentication` usa a BiometricPrompt no Android e Face ID/Touch ID no iOS, e volta para o PIN do aparelho depois de algumas falhas ([expo-local-authentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/)).

### Flutter

- **[confirmado] Banco cifrado.** O `sqlcipher_flutter_libs` chegou ao fim de vida (versão `0.7.0+eol`) ([pub.dev](https://pub.dev/packages/sqlcipher_flutter_libs)). O drift agora recomenda SQLite3MultipleCiphers pelo pacote `sqlite3`, e avisa que *"SQLCipher is no longer supported with a straightforward setup"* ([drift: encryption](https://drift.simonbinder.eu/platforms/encryption/)). Outra opção é o `sqflite_sqlcipher` ([pub.dev](https://pub.dev/packages/sqflite_sqlcipher)).
- **[confirmado] Secure storage.** O `flutter_secure_storage` (v11) usa RSA OAEP com AES-GCM no Android e Keychain no iOS. O Auto Backup pode causar `InvalidKeyException` se não for desligado ou excluído ([pub.dev](https://pub.dev/packages/flutter_secure_storage)).
- **[confirmado] Biometria.** O `local_auth` é publicado pelo próprio flutter.dev e suporta Android e iOS ([pub.dev](https://pub.dev/packages/local_auth)).

### Kotlin / Compose Multiplatform

- **[confirmado] Banco.** O Room roda em KMP no Android e no iOS. A página oficial do Room KMP não documenta criptografia nem SQLCipher ([Room KMP](https://developer.android.com/kotlin/multiplatform/room)).
- **[confirmado] Secure storage e biometria.** Não há biblioteca multiplataforma oficial da JetBrains ou do Google. As da comunidade estão paradas: o [KVault](https://github.com/Liftric/KVault) (Keychain e SharedPreferences cifradas) teve o último push em 06/2024, e o [moko-biometry](https://github.com/icerockdev/moko-biometry) em 02/2025 (dados da API do GitHub). O caminho seguro é escrever `expect`/`actual` para Keychain e Keystore ([expect/actual](https://kotlinlang.org/docs/multiplatform/multiplatform-expect-actual.html)).
- **[opinião]** É o ponto mais fraco da stack para este app: justo os itens obrigatórios ficam por conta do autor iniciante.

---

## 4. Gráficos (linha, barra, rosca) e UI

### React Native / Expo

- **[confirmado]** O `react-native-gifted-charts` tem barra, linha, área, pizza, **rosca** e outros. No Expo, instala com `npx expo install react-native-gifted-charts expo-linear-gradient react-native-svg` ([README](https://github.com/Abhinandan-Kushwaha/react-native-gifted-charts)). O `react-native-svg` vem no Expo Go ([react-native-svg no Expo](https://docs.expo.dev/versions/latest/sdk/svg/)).
- **[confirmado]** O Victory Native (XL) tem linha, barra, área e pizza/rosca. Usa Skia, Reanimated e Gesture Handler ([Victory Native](https://nearform.com/open-source/victory-native/docs/)).
- **[confirmado] Troca de pacote no Skia.** O React Native Skia saiu do pacote `@shopify/react-native-skia` para `react-native-skia`, mantido por wcandillon ([README do Skia](https://github.com/wcandillon/react-native-skia)). O `victory-native@43` exige `react-native-skia >=2.15.1 <3` ([registry npm](https://registry.npmjs.org/victory-native)), mas a página do Expo SDK 58 ainda recomenda `@shopify/react-native-skia` 2.14.0 ([Skia no Expo](https://docs.expo.dev/versions/latest/sdk/skia/)).
- **[confirmado] UI.**
  - O React Native Paper implementa Material 3 ([React Native Paper](https://oss.callstack.com/react-native-paper/)).
  - O `@expo/ui` oferece componentes nativos: Jetpack Compose no Android e SwiftUI no iOS ([Expo UI](https://docs.expo.dev/versions/latest/sdk/ui/)).
  - O Expo Router cuida da navegação ([Expo Router](https://docs.expo.dev/router/introduction/)).

### Flutter

- **[confirmado]** O `fl_chart` (MIT) tem linha, barra, pizza, dispersão, radar e candlestick ([pub.dev](https://pub.dev/packages/fl_chart)). É a biblioteca de gráficos com mais estrelas entre as citadas aqui: 7,6 mil, contra 3,2 mil do Vico, 1,4 mil do gifted-charts e 1,2 mil do Victory Native XL (API do GitHub, em 08/11/2026; [fl_chart](https://github.com/imaNNeo/fl_chart)).
- **[confirmado]** O Material 3 é o padrão desde o Flutter 3.16 ([Material 3 default](https://docs.flutter.dev/release/breaking-changes/material-3-default)), mas está mudando para pacotes separados (§1).
- **[opinião]** Neste critério o Flutter é tão bom ou melhor: renderiza igual nas duas plataformas, e o `fl_chart` é maduro.

### Kotlin / Compose Multiplatform

- **[confirmado]** O Vico é *"a chart library for Compose Multiplatform"* ([README](https://github.com/patrykandpatrick/vico)). Tem camadas de linha, coluna e candlestick e um `PieChart` em `commonMain`, com exemplo de rosca ([código-fonte](https://github.com/patrykandpatrick/vico/blob/master/vico/compose/src/commonMain/kotlin/com/patrykandpatrick/vico/compose/pie/PieChart.kt)).

---

## 5. Integração com a API do Pluggy

- **[confirmado] Credenciais.** O app troca `clientId` e `clientSecret` por uma `apiKey` em `POST https://api.pluggy.ai/auth` ([referência](https://docs.pluggy.ai/reference/auth-create)). A `apiKey` vale 2 horas ([autenticação](https://docs.pluggy.ai/docs/authentication)) e vai no header `X-API-KEY` ([referência de transações](https://docs.pluggy.ai/reference/transactions-list)).
- **[confirmado] SDK de backend.** O SDK oficial em Node (`pluggy-sdk`) depende de `got` e exige Node `^22 || >=24` ([package.json](https://github.com/pluggyai/pluggy-node/blob/master/package.json)). **[opinião]** Não roda dentro do app em nenhuma das três stacks. Em todas, a integração será feita com HTTP direto (`fetch` no React Native, [network](https://reactnative.dev/docs/network)). No React Native, os *tipos* TypeScript do `pluggy-sdk` talvez possam ser reaproveitados com `import type`. Isso precisa ser testado.
- **[confirmado] Toolkit client-side.** O `pluggy-js`, toolkit JavaScript para o cliente, está **arquivado** ([GitHub](https://github.com/pluggyai/pluggy-js)).
- **[confirmado] Pluggy Connect.** A documentação lista SDKs oficiais do widget para React Native (`react-native-pluggy-connect`) e Flutter (`flutter_pluggy_connect`) ([ambientes do Connect](https://docs.pluggy.ai/en/docs/connect-widget/environments)).
  - O pacote React Native está na versão 1.6.0, de 29/07/2026, e depende de `react-native-webview` e do `pluggy-js` arquivado ([registry npm](https://registry.npmjs.org/react-native-pluggy-connect/latest)).
  - O pacote Flutter foi publicado pela última vez em 21/11/2024 ([pub.dev](https://pub.dev/packages/flutter_pluggy_connect)).
  - Não há SDK de Connect para Kotlin/Android nativo ([ambientes do Connect](https://docs.pluggy.ai/en/docs/connect-widget/environments)).
- **[confirmado] Segundo plano.** O `expo-background-task` usa WorkManager no Android (intervalo mínimo de 15 min) e BGTaskScheduler no iOS (o sistema decide quando roda) ([expo-background-task](https://docs.expo.dev/versions/latest/sdk/background-task/)). Isso cobre o "extra" de busca em segundo plano.
- **[opinião]** Vantagem do React Native: o SDK do Connect é o mais recente e o ecossistema do Pluggy é TypeScript.

---

## Quadro comparativo [opinião]

Nota de 1 a 5 em cada critério.

| Critério | Expo | Flutter | Compose MP |
|---|---|---|---|
| Curva para iniciante (Python, Windows) | 5 | 4 | 2 |
| APK sem loja, lojas depois, iOS sem Mac | 5 | 3 | 2 |
| OTA | 5 (oficial) | 3 (Shorebird, de terceiros) | 1 (nenhum) |
| Banco cifrado, secure storage, biometria | 4 | 4 | 2 |
| Gráficos e UI | 4 | 5 | 3 |
| Pluggy (Connect, ecossistema TS) | 5 | 3 | 2 |

**Fora da comparação.** Não avaliei a fundo as opções em Python, como [Flet](https://flet.dev) e [BeeWare](https://beeware.org). **[opinião]** As bibliotecas de segurança e de gráficos que este app exige estão maduras nos três ecossistemas acima.

---

## Recomendação

**React Native com Expo (SDK 58, React Native 0.88), em TypeScript.**

Por quê:

1. **Menor curva para o autor.** O React Native recomenda o Expo oficialmente, e dá para começar sem Android Studio, depois passar a *development builds* na nuvem.
2. **Distribuição resolvida de ponta a ponta.**
   - O EAS gera o APK com link e cuida da keystore.
   - O mesmo pipeline faz o AAB da Play e builds iOS **sem Mac**, algo que nenhuma das outras duas stacks oferece.
3. **OTA oficial.** O EAS Update atualiza JS e assets dos amigos sem reinstalar APK, e o plano grátis cobre 1.000 usuários ativos por mês.
4. **Itens obrigatórios cobertos por módulos oficiais do Expo**, versionados junto com o SDK:
   - SQLCipher no `expo-sqlite`;
   - Keystore e Keychain no `expo-secure-store`;
   - biometria no `expo-local-authentication`.
5. **Afinidade com o Pluggy.** O SDK do Connect para React Native é o mais recente, e o ecossistema do Pluggy é TypeScript.

### Bibliotecas centrais

| Necessidade | Escolha |
|---|---|
| Navegação | `expo-router` |
| Banco local cifrado | `expo-sqlite` com `useSQLCipher: true` e **Drizzle ORM** (`drizzle-orm/expo-sqlite`), com migrações via `useMigrations` e consultas reativas via `useLiveQuery`. Na abertura, checar `PRAGMA cipher_version` e **recusar abrir** se vier vazio |
| Chave do banco | 32 bytes de `expo-crypto` (`getRandomBytesAsync`), guardados no `expo-secure-store` **sem** `requireAuthentication`, para a chave não ser invalidada quando a biometria muda |
| Credenciais do Pluggy (clientSecret, itemIds) | `expo-secure-store` (Keystore/Keychain) |
| Bloqueio por biometria | `expo-local-authentication` na abertura e na volta do segundo plano, com o PIN do aparelho como reserva |
| Gráficos | `react-native-gifted-charts` (com `react-native-svg` e `expo-linear-gradient`), que é baseado em SVG e não sofre com a troca de pacote do Skia. Plano B: Victory Native XL, quando o Expo alinhar a versão do Skia |
| Kit de UI | React Native Paper (Material 3) como base. A direção visual fica para o ticket [#5](https://github.com/Kaioabreu/financas/issues/5) e pode mudar sem mexer na stack |
| HTTP para o Pluggy | `fetch` nativo (o SDK de Node não roda no app) |
| Build e distribuição | EAS Build, perfil `preview` com `"buildType": "apk"`. Keystore gerenciada pelo EAS, com cópia de segurança via `eas credentials` (o `credentials.json` fica **fora** do repo) |
| OTA | EAS Update (`expo-updates`), verificando no cold boot |
| Segundo plano (extra) | `expo-background-task` |
| iOS e lojas, no futuro | EAS Build na nuvem (macOS) e EAS Submit. Exige conta do Apple Developer Program |

**[opinião]** Validar no primeiro *spike*: o SQLCipher do `expo-sqlite` funcionando junto com o Drizzle num APK de *preview*, com `PRAGMA key` executado antes de criar o `drizzle(db)`. As duas documentações não tratam a combinação explicitamente.

---

## Riscos

1. **Cifra que falha em silêncio.** Sem SQLCipher no binário, o `PRAGMA key` não faz nada e o banco fica em claro ([expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/)). Mitigação: checar `cipher_version` e falhar fechado, sem usar Expo Go para nada que toque o banco.
2. **Perda de chave significa perda dos dados locais.** O SecureStore some ao desinstalar no Android, e com `requireAuthentication` as chaves morrem quando a biometria muda ([expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/)). O cache do Pluggy pode ser baixado de novo. Já as regras, recategorizações e fotos do patrimônio não podem. Isso vai para o ticket [#11](https://github.com/Kaioabreu/financas/issues/11): exportação ou backup cifrado.
3. **Rotatividade no ecossistema JS.** O Skia trocou de pacote ([README](https://github.com/wcandillon/react-native-skia)). O Expo lançou os SDKs 56, 57 e 58 entre maio e outubro de 2026 ([changelog](https://expo.dev/changelog)), e o Expo Go novo suporta só o SDK 58 ([guia do SDK 58](https://expo.dev/blog/how-to-upgrade-to-sdk-58)). Mitigação: instalar sempre com `npx expo install` e atualizar o SDK uma vez por ciclo.
4. **Dependência do serviço do Expo.** O plano grátis é limitado: 15 builds Android por mês, de baixa prioridade ([preços](https://expo.dev/pricing), [planos](https://docs.expo.dev/billing/plans/)), e não há `eas build --local` no Windows ([local builds](https://docs.expo.dev/build-reference/local-builds/)). Mitigação: `expo prebuild` mais Gradle local ([build local](https://docs.expo.dev/guides/local-app-production/)), e o protocolo de updates é aberto ([especificação](https://docs.expo.dev/technical-specs/expo-updates-1/)).
5. **OTA na App Store.** A diretriz 2.5.2 restringe código baixado que muda funcionalidade ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)). No iOS, use OTA só para correções.
6. **Keystore perdida significa fim das atualizações.** Atualizações exigem o mesmo certificado, e uma chave perdida não pode ser gerada de novo ([app signing](https://developer.android.com/studio/publish/app-signing)). Para ir à Play depois mantendo a mesma chave, é preciso enviar a chave própria ao Play App Signing em vez de deixar o Google gerar uma (mesma fonte).
7. **clientSecret no aparelho.** O Pluggy recomenda usar o secret só num servidor seguro ([autenticação](https://docs.pluggy.ai/docs/authentication)). Como o secret é do próprio usuário, o modelo foi aceito no ticket #2. A stack não muda isso, mas o secure storage passa a ser o único controle (ver o ticket [#8](https://github.com/Kaioabreu/financas/issues/8)).

---

## Achados colaterais (afetam outros tickets)

- **Verificação de desenvolvedor Android (#12), que vale para qualquer stack.**
  - Desde **30/09/2026**, no Brasil, instalações vindas de "lojas participantes" exigem desenvolvedor verificado. Instalação direta (sideload) **ainda não** é afetada, mas a verificação vira **global em 2027** para todos os apps em aparelhos certificados ([developer verification](https://developer.android.com/developer-verification), [FAQ](https://developer.android.com/developer-verification/guides/faq?hl=en)).
  - Há uma conta de **distribuição limitada**, grátis e sem documento, para estudantes e hobbistas. O limite de aparelhos diverge entre as fontes: 20 no [FAQ](https://developer.android.com/developer-verification/guides/faq?hl=en) e 50 na [ajuda do Console](https://support.google.com/android-developer-console/answer/17131204?hl=en).
  - Essa conta só registra *package names* nunca vistos antes no Android (mesma ajuda). O package name deve ser escolhido e registrado **antes** de espalhar o APK.
  - Sem registro, o amigo precisa do "advanced flow", com espera única de 24 h. Atualizações de app não registrado falham se esse fluxo for desligado ([FAQ](https://developer.android.com/developer-verification/guides/faq?hl=en)).
  - A conta completa custa US$ 25 ([FAQ](https://developer.android.com/developer-verification/guides/faq?hl=en)).
- **API do Pluggy (#3).** O `GET /transactions` está *deprecated* e sai depois de 31/12/2026. É preciso usar o `GET /v2/transactions`, com paginação por cursor ([referência](https://docs.pluggy.ai/reference/transactions-list)).
