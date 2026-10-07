import { clearDraft, draftKey } from './use-draft';

describe('draftKey', () => {
  // A shared machine at a venue is the normal case, not an edge case. Without
  // the user id in the key, the next person to sign in would inherit the
  // previous participant's code.
  it('separates two participants on the same challenge', () => {
    expect(draftKey('user-a', 'ch-1', 'PYTHON')).not.toBe(draftKey('user-b', 'ch-1', 'PYTHON'));
  });

  it('separates two languages on the same challenge', () => {
    expect(draftKey('user-a', 'ch-1', 'PYTHON')).not.toBe(draftKey('user-a', 'ch-1', 'JAVA'));
  });

  it('separates two challenges', () => {
    expect(draftKey('user-a', 'ch-1', 'PYTHON')).not.toBe(draftKey('user-a', 'ch-2', 'PYTHON'));
  });

  it('is stable for the same inputs', () => {
    expect(draftKey('user-a', 'ch-1', 'PYTHON')).toBe(draftKey('user-a', 'ch-1', 'PYTHON'));
  });

  it('is namespaced so it cannot collide with other stored values', () => {
    // `faceoff-theme` already lives in the same storage.
    expect(draftKey('u', 'c', 'PYTHON')).toMatch(/^faceoff:draft:/);
  });
});

describe('clearDraft', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => void store.set(k, v),
          removeItem: (k: string) => void store.delete(k),
        },
      },
      configurable: true,
      writable: true,
    });
  });

  it('removes only the matching draft', () => {
    store.set(draftKey('u1', 'c1', 'PYTHON'), 'kept-by-language');
    store.set(draftKey('u1', 'c1', 'JAVA'), 'removed');

    clearDraft('u1', 'c1', 'JAVA');

    expect(store.has(draftKey('u1', 'c1', 'JAVA'))).toBe(false);
    expect(store.get(draftKey('u1', 'c1', 'PYTHON'))).toBe('kept-by-language');
  });

  // Private mode and blocked site data both throw on access. A draft is a
  // convenience; failing to clear one must never break a submission.
  it('does not throw when storage is unavailable', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: {
          removeItem: () => {
            throw new Error('SecurityError');
          },
        },
      },
      configurable: true,
      writable: true,
    });

    expect(() => clearDraft('u1', 'c1', 'PYTHON')).not.toThrow();
  });
});
