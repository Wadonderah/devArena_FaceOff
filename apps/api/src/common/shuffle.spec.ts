import { relabel, seededShuffle } from './shuffle';

const OPTIONS = ['A', 'B', 'C', 'D'];

describe('seededShuffle', () => {
  it('is stable for the same seed, so a refresh does not reorder mid-question', () => {
    const first = seededShuffle(OPTIONS, 'user-1:question-1');
    const second = seededShuffle(OPTIONS, 'user-1:question-1');
    expect(first).toEqual(second);
  });

  it('orders differently for different participants on the same question', () => {
    // The property that makes immediate answer reveal survivable: "it's B" does
    // not transfer between participants.
    const orders = new Set(
      Array.from({ length: 40 }, (_, i) =>
        seededShuffle(OPTIONS, `user-${i}:question-1`).join(''),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('orders differently for the same participant across questions', () => {
    const q1 = seededShuffle(OPTIONS, 'user-1:question-1').join('');
    const q2 = seededShuffle(OPTIONS, 'user-1:question-2').join('');
    const q3 = seededShuffle(OPTIONS, 'user-1:question-3').join('');
    expect(new Set([q1, q2, q3]).size).toBeGreaterThan(1);
  });

  it('preserves every element exactly once', () => {
    const shuffled = seededShuffle(OPTIONS, 'user-9:question-9');
    expect([...shuffled].sort()).toEqual([...OPTIONS].sort());
    expect(shuffled).toHaveLength(OPTIONS.length);
  });

  it('does not mutate the input array', () => {
    const input = [...OPTIONS];
    seededShuffle(input, 'seed');
    expect(input).toEqual(OPTIONS);
  });

  it('handles empty and single-element inputs', () => {
    expect(seededShuffle([], 'seed')).toEqual([]);
    expect(seededShuffle(['only'], 'seed')).toEqual(['only']);
  });

  it('reaches a spread of permutations rather than a couple of fixed orders', () => {
    const seen = new Set(
      Array.from({ length: 400 }, (_, i) => seededShuffle(OPTIONS, `u${i}`).join('')),
    );
    // 4 items have 24 permutations; a biased shuffle would cluster on a few.
    expect(seen.size).toBeGreaterThan(12);
  });
});

describe('relabel', () => {
  const options = [
    { id: 'o1', label: 'A', text: 'first' },
    { id: 'o2', label: 'B', text: 'second' },
    { id: 'o3', label: 'C', text: 'third' },
    { id: 'o4', label: 'D', text: 'fourth' },
  ];

  it('assigns A-D by position, not by the stored label', () => {
    const reordered = [options[2], options[0], options[3], options[1]];
    expect(relabel(reordered).map((o) => `${o.label}:${o.text}`)).toEqual([
      'A:third',
      'B:first',
      'C:fourth',
      'D:second',
    ]);
  });

  it('makes a shared letter meaningless between two participants', () => {
    // The whole point of relabelling. Without it both participants' "B" would be
    // the same option and immediate reveal would leak across the room.
    const forUser1 = relabel(seededShuffle(options, 'user-1:q1'));
    const forUser2 = relabel(seededShuffle(options, 'user-2:q1'));

    const bFor1 = forUser1.find((o) => o.label === 'B')!.id;
    const bFor2 = forUser2.find((o) => o.label === 'B')!.id;

    // Not a guarantee for any single pair, but across many participants the
    // mapping must not be constant.
    const bIds = new Set(
      Array.from({ length: 30 }, (_, i) =>
        relabel(seededShuffle(options, `user-${i}:q1`)).find((o) => o.label === 'B')!.id,
      ),
    );
    expect(bIds.size).toBeGreaterThan(1);
    expect(typeof bFor1).toBe('string');
    expect(typeof bFor2).toBe('string');
  });

  it('preserves option ids, which is what grading resolves by', () => {
    const shuffled = relabel(seededShuffle(options, 'seed'));
    expect(shuffled.map((o) => o.id).sort()).toEqual(['o1', 'o2', 'o3', 'o4']);
  });

  it('does not mutate its input', () => {
    const input = [...options];
    relabel(input);
    expect(input[0].label).toBe('A');
  });
});
