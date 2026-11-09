import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, TextInput } from "react-native";
import { useCore } from "../src/shell/appCore";
import { Button, Fine, font, Screen, usePalette } from "../src/shell/theme";

export default function Cpf() {
  const core = useCore();
  const router = useRouter();
  const c = usePalette();
  const [cpf, setCpf] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const result = await core.setCpf(cpf);
    if (result.ok) router.back();
    else setError(result.message);
  }

  return (
    <Screen
      title="Seu CPF"
      sub="Os bancos não trouxeram o seu CPF. Com ele, o app reconhece o dinheiro que você move entre as suas contas."
      footer={<Button label="Salvar" onPress={submit} />}
    >
      <TextInput
        value={cpf}
        onChangeText={setCpf}
        placeholder="000.000.000-00"
        placeholderTextColor={c.ink2}
        keyboardType="number-pad"
        maxLength={14}
        style={{ fontFamily: font.regular, fontSize: 18, color: c.ink, backgroundColor: c.track, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 }}
      />
      {error ? <Text style={{ fontFamily: font.medium, color: c.neg, marginTop: 12 }}>{error}</Text> : null}
      <Fine>O CPF fica só neste celular.</Fine>
    </Screen>
  );
}
