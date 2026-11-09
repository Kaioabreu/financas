import { StyleSheet, Text, View } from "react-native";

export default function Home() {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Finanças</Text>
      <Text>Banco cifrado aberto (SQLCipher).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  title: { fontSize: 24, fontWeight: "600" },
});
