/** Normalise to E.164 ("+971501234567"), or null if it isn't a plausible international number. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) return null;
  return digits;
}
