import type { ExpoConfig } from "expo/config";
import { resolveVariant } from "./src/core/variant.ts";

const variant = resolveVariant(process.env.APP_VARIANT);

const config: ExpoConfig = {
  name: variant.name,
  slug: variant.slug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: variant.androidPackage,
  userInterfaceStyle: "automatic",
  ios: { bundleIdentifier: variant.androidPackage },
  android: {
    package: variant.androidPackage,
    // Backup off: the encrypted database is only recoverable via the manual Backup.
    // expo-secure-store needs no extra backup rules while this stays false.
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
  },
  plugins: ["expo-router", "expo-secure-store", "expo-local-authentication", ["expo-sqlite", { useSQLCipher: true }]],
  experiments: { typedRoutes: true },
  extra: { databaseName: variant.databaseName, eas: { projectId: "2397abc9-98ec-4e75-ab8f-9a6d25bf72c0" } },
};

export default config;
