import { useRouter } from "expo-router";
import { Body, Button, Screen } from "../src/shell/theme";

export default function BoasVindas() {
  const router = useRouter();
  return (
    <Screen
      title="Finanças"
      sub="Suas finanças a partir do Open Finance, guardadas só neste celular."
      footer={<Button label="Começar" onPress={() => router.push("/antes-de-comecar")} />}
    >
      <Body>Vamos configurar em poucos passos.</Body>
    </Screen>
  );
}
