import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useCore } from "../src/shell/appCore";
import { Body, Screen, usePalette } from "../src/shell/theme";

export default function Entry() {
  const core = useCore();
  const c = usePalette();
  const [saved, setSaved] = useState<boolean | null>(null);

  useEffect(() => {
    core.credentialsStatus().then((s) => setSaved(s.saved));
  }, [core]);

  if (saved === null) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  // Leaving before saving brings the user back to the Boas-vindas, with nothing stored.
  if (!saved) return <Redirect href="/boas-vindas" />;
  return (
    <Screen title="Conecte um banco" sub="Seus dados aparecem aqui depois da primeira leitura.">
      <Body>Nenhuma Conexão ainda.</Body>
    </Screen>
  );
}
