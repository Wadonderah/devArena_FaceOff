export interface Dust {
  x: number;
  y: number;
  r: number;
  o: number;
}

/// A deterministic star field.
///
/// Positions come from a seeded generator (mulberry32) so the field is
/// identical on the server, the client, and every refresh. A random field
/// would shift on hydration and read as a bug. Shared by the arena
/// illustration and the landing-page sky so the two are one continuous space.
export function dustField(count: number, seed: number, width: number, height: number): Dust[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return Array.from({ length: count }, () => ({
    x: Math.round(rand() * width),
    y: Math.round(rand() * height),
    r: 0.5 + rand() * 1.1,
    o: 0.1 + rand() * 0.3,
  }));
}
