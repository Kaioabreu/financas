import { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCore } from "./appCore";
import { Body, Button, Fine, font, usePalette } from "./theme";
import { Text } from "react-native";

/** Asks, on top of the current screen, whether the ~135 MB of fund quotas may download on mobile data. */
export function FundQuotasSheet() {
  const core = useCore();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = () => core.fundQuotasPrompt().then((v) => alive && setOpen(v), () => {});
    void check();
    const timer = setInterval(check, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [core]);

  const answer = (choice: "download" | "wait") => {
    setOpen(false);
    void core.answerFundQuotas(choice);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => answer("wait")}>
      <Pressable style={{ flex: 1, backgroundColor: "#0008" }} onPress={() => answer("wait")} accessibilityLabel="Fechar" />
      <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: insets.bottom + 24, gap: 10 }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 20, color: c.ink }}>Baixar as cotas dos fundos?</Text>
        <Body>Para estimar o passado dos seus fundos, o app baixa os arquivos da CVM: uns 135 MB. Você está no 4G.</Body>
        <Fine>No Wi-Fi o download começa sozinho.</Fine>
        <Button label="Baixar agora" onPress={() => answer("download")} />
        <Button label="Esperar o Wi-Fi" secondary onPress={() => answer("wait")} />
      </View>
    </Modal>
  );
}
