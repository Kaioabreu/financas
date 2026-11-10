import { useRouter } from "expo-router";
import { useCore } from "../src/shell/appCore";
import { RestoreForm } from "../src/shell/RestoreForm";

export default function Restaurar() {
  const core = useCore();
  const router = useRouter();
  return <RestoreForm run={(input) => core.restoreBackup(input)} onDone={() => router.replace("/")} onCancel={() => router.back()} />;
}
