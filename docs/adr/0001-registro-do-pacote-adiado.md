# Registro do pacote na verificação de desenvolvedor Android adiado

O app (`com.kabreu.finance`) chega aos amigos por instalação direta (via Firebase App Distribution), sem registrar o pacote na verificação de desenvolvedor do Android. A regra já vale no Brasil desde 30/09/2026, mas só para apps vindos de lojas. Ela chega à instalação direta em 2027, ainda sem data, e afeta só a instalação: o app já instalado e as atualizações OTA continuam funcionando.

Optamos por não registrar porque o v1 tem custo zero. O Play Console custa US$ 25. A conta de distribuição limitada é gratuita, mas não tem caminho documentado para o Google Play, o que contraria as "Portas abertas" do mapa.

## Consequências

- **A conta limitada deixa de ser opção.** Ela só registra pacotes que o Android nunca viu, então perde a validade para `com.kabreu.finance` quando o primeiro APK for compartilhado. Não tente "consertar" isso registrando o pacote depois.
- **Revisar quando o Google marcar a data de 2027.** Há dois caminhos:
  - cada amigo ativa o fluxo avançado (*advanced flow*) uma vez, com espera de 24 h, e o mantém ligado, porque sem ele os APKs novos não instalam;
  - pagar o Play Console naquela hora, que aceita registrar um pacote já distribuído fora da Play.
- A variante `com.kabreu.finance.dev` é instalada por ADB e não é afetada.

Decidido em [Como o app chega aos amigos e se atualiza?](https://github.com/Kaioabreu/financas/issues/12).
