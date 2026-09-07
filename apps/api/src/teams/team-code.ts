import { randomInt } from 'node:crypto';

// Excludes 0/O and 1/I/L. A join code gets read aloud across a room or copied off
// a slide, and those pairs are the ones people get wrong.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateTeamCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/// Codes are compared case-insensitively and ignoring spacing, so a participant
/// typing "abc 123" still matches the code shown as "ABC123".
export function normalizeTeamCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
