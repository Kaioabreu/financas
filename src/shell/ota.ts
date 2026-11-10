import * as Updates from "expo-updates";
import { CHANNEL_HEADER, nextChannel, type Channel } from "../core/canary";

// Dev and embedded builds run with Updates disabled: every call here degrades to a no-op.
export const otaId: string | null = Updates.isEnabled ? Updates.updateId : null;
export const otaDate: Date | null = Updates.isEnabled && !Updates.isEmbeddedLaunch ? Updates.createdAt : null;
export const currentChannel: string | null = Updates.isEnabled ? Updates.channel : null;

/** Flips this phone to the other channel and pulls its latest update right away when there is one. */
export async function toggleChannel(current: string | null): Promise<{ channel: Channel; supported: boolean; reloaded: boolean }> {
  const channel = nextChannel(current);
  if (!Updates.isEnabled) return { channel, supported: false, reloaded: false };
  Updates.setUpdateRequestHeadersOverride({ [CHANNEL_HEADER]: channel });
  try {
    const result = await Updates.fetchUpdateAsync();
    if (result.isNew) {
      await Updates.reloadAsync();
      return { channel, supported: true, reloaded: true };
    }
  } catch {
    // Offline or no update on that channel: the new channel still applies on the next open.
  }
  return { channel, supported: true, reloaded: false };
}
