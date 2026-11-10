const CONTENT_HEIGHT = 56;
const MIN_PADDING = 6;

/** Tab bar size that grows by the bottom safe-area inset (Android 3-button bar or gesture pill). */
export function tabBarMetrics(bottomInset: number) {
  const inset = Math.max(0, bottomInset);
  return { height: CONTENT_HEIGHT + MIN_PADDING + inset, paddingBottom: MIN_PADDING + inset };
}
