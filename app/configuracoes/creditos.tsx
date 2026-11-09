import { ScrollView, Text } from "react-native";
import { SettingsScreen } from "../../src/shell/SettingsScreen";
import { Body, font, usePalette } from "../../src/shell/theme";

function Head({ children }: { children: string }) {
  const c = usePalette();
  return <Text style={{ fontFamily: font.semibold, fontSize: 16, color: c.ink, marginTop: 18 }}>{children}</Text>;
}

export default function Creditos() {
  return (
    <SettingsScreen title="Créditos">
      <ScrollView>
        <Head>Fontes dos dados</Head>
        <Body>
          Banco Central do Brasil (BCB), Tesouro Nacional e Comissão de Valores Mobiliários (CVM, sob a licença ODbL) fornecem os preços e índices públicos usados nas estimativas.
        </Body>
        <Body style={{ marginTop: 8 }}>A Pluggy fornece a leitura do Open Finance, pelo Meu Pluggy.</Body>
        <Head>Fonte</Head>
        <Body>A fonte Jost, sob a licença SIL Open Font License.</Body>
        <Head>Licença</Head>
        <Body>O app é distribuído sob a licença MIT.</Body>
        <Head>Como o passado é estimado</Head>
        <Body>
          Antes da primeira leitura de cada banco, o app não tem retratos reais do patrimônio. Para os 12 meses anteriores, ele traça uma reta entre os preços conhecidos: do primeiro ao último ponto que ele sabe, o valor sobe ou desce em linha reta, sem inventar altos e baixos no meio. É uma estimativa, não um extrato.
        </Body>
      </ScrollView>
    </SettingsScreen>
  );
}
