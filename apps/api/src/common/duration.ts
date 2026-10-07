const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/// Parse a jsonwebtoken-style duration (`15m`, `7d`, `30s`, `500ms`) to
/// milliseconds.
///
/// This exists so the access cookie's lifetime can be derived from
/// `ACCESS_TOKEN_TTL` rather than hardcoded. The two were set independently —
/// the config said `15m` and the cookie said `15 * 60 * 1000` — and agreed only
/// because both defaults happened to be fifteen minutes. Changing the TTL would
/// have left the cookie outliving or outlived by the token it carries, which
/// surfaces as a session that dies early or a cookie that lingers useless.
///
/// A bare number is seconds, matching jsonwebtoken's own rule, so the same
/// string can feed both the signer and the cookie without translation.
export function parseDuration(value: string): number {
  const trimmed = value.trim();

  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;

  // `ms` before the single letters, or `500ms` would match `m` and be read as
  // 500 minutes.
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i.exec(trimmed);

  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Use a number of seconds, or a value with a unit such as 15m, 2h or 7d.`,
    );
  }

  return Number(match[1]) * UNIT_MS[match[2].toLowerCase()];
}
