import { useEffect, useState } from "react";
import { Text, TextInput } from "react-native";
import type { BackupStatus } from "../../src/core/createCore";
import { useCore } from "../../src/shell/appCore";
import { shareBackup } from "../../src/shell/backupFile";
import { SettingsScreen } from "../../src/shell/SettingsScreen";
import { Body, Button, Fine, font, LinkText, usePalette } from "../../src/shell/theme";

const date = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export default function Backup() {
  const core = useCore();
  const c = usePalette();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void core.backupStatus().then(setStatus);
  }, [core]);

  const input = {
    fontFamily: font.regular,
    fontSize: 16,
    color: c.ink,
    backgroundColor: c.track,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  } as const;
  const field = (value: string, set: (v: string) => void, placeholder: string) => (
    <TextInput style={input} value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={c.ink2} secureTextEntry autoCapitalize="none" autoCorrect={false} />
  );

  if (!status) return <SettingsScreen title="Backup">{null}</SettingsScreen>;
  const mustCreate = creating || !status.passwordSet;

  async function createPassword() {
    setError(null);
    const result = await core.createBackupPassword(password, confirmation);
    if (!result.ok) {
      setError(result.reason === "too-short" ? "A senha precisa ter no mínimo 8 caracteres." : "As duas senhas não são iguais.");
      return;
    }
    setStatus(await core.backupStatus());
    setCreating(false);
    setConfirmation("");
    setError(null);
  }

  async function makeBackup() {
    setError(null);
    if (!(await core.verifyBackupPassword(password))) {
      setError("Senha incorreta.");
      return;
    }
    setBusy(true);
    try {
      await shareBackup(password, Date.now());
      await core.recordBackup();
      setStatus(await core.backupStatus());
      setPassword("");
    } catch {
      setError("Não foi possível gerar o backup. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsScreen
      title="Backup"
      sub={status.lastBackupAt ? `Último backup: ${date(status.lastBackupAt)}` : "Último backup: nunca"}
      footer={
        mustCreate ? (
          <Button label="Criar senha" disabled={!password || !confirmation} onPress={createPassword} />
        ) : (
          <Button label={busy ? "Gerando…" : "Fazer backup"} disabled={busy || !password} onPress={makeBackup} />
        )
      }
    >
      {mustCreate ? (
        <>
          <Body>{status.passwordSet ? "Escolha uma nova senha para os próximos backups." : "Crie a senha que protege o seu backup."}</Body>
          {field(password, setPassword, "Senha (mínimo 8 caracteres)")}
          {field(confirmation, setConfirmation, "Digite a senha de novo")}
          <Text style={{ fontFamily: font.medium, color: c.neg, fontSize: 15 }}>Sem esta senha o backup não abre, e ninguém consegue recuperá-la.</Text>
        </>
      ) : (
        <>
          <Body>Digite a sua senha para gerar o backup e salvá-lo onde quiser.</Body>
          {field(password, setPassword, "Senha do backup")}
          <LinkText onPress={() => { setCreating(true); setPassword(""); setError(null); }}>Esqueci a senha</LinkText>
          <Fine>"Esqueci a senha" leva a criar uma nova senha; os backups antigos continuam pedindo a senha antiga.</Fine>
        </>
      )}
      {error ? <Text style={{ fontFamily: font.medium, color: c.neg, fontSize: 15, marginTop: 12 }}>{error}</Text> : null}
    </SettingsScreen>
  );
}
