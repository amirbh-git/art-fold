export type WallDensity = "normal" | "compact" | "ultraCompact";

export function wallDensityFromHeight(px: number): WallDensity {
  if (px >= 820) return "normal";
  if (px >= 720) return "compact";
  return "ultraCompact";
}
