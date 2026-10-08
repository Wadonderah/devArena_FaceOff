import { canSubmitPasswords, shouldShowMismatch } from './password-match';

describe('shouldShowMismatch', () => {
  it('says nothing before the confirmation is touched', () => {
    expect(shouldShowMismatch('correct-horse', '')).toBe(false);
  });

  // The reason this rule exists: comparing on every keystroke means the form
  // shows an error for almost the whole time it is being filled in correctly.
  it('stays quiet while the confirmation is still being typed', () => {
    expect(shouldShowMismatch('correct-horse', 'c')).toBe(false);
    expect(shouldShowMismatch('correct-horse', 'correct-hor')).toBe(false);
  });

  it('complains once the confirmation is long enough to judge', () => {
    expect(shouldShowMismatch('correct-horse', 'correct-horsf')).toBe(true);
    expect(shouldShowMismatch('correct-horse', 'something-entirely-else')).toBe(true);
  });

  it('says nothing when they match', () => {
    expect(shouldShowMismatch('correct-horse', 'correct-horse')).toBe(false);
  });
});

describe('canSubmitPasswords', () => {
  it('blocks a half-typed confirmation even without showing an error', () => {
    expect(shouldShowMismatch('correct-horse', 'correct')).toBe(false);
    expect(canSubmitPasswords('correct-horse', 'correct')).toBe(false);
  });

  it('blocks an empty pair', () => {
    expect(canSubmitPasswords('', '')).toBe(false);
  });

  it('allows a matching pair', () => {
    expect(canSubmitPasswords('correct-horse', 'correct-horse')).toBe(true);
  });

  // Trailing whitespace is a real password character, so two values that look
  // alike but are not must stay blocked.
  it('does not treat a trailing space as a match', () => {
    expect(canSubmitPasswords('secret', 'secret ')).toBe(false);
  });
});
