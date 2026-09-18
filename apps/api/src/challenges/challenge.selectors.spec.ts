import {
  ORGANIZER_CHALLENGE_SELECT,
  PARTICIPANT_CHALLENGE_SELECT,
} from './challenge.selectors';

/// These assertions are the last line of defence for the rule that a participant
/// must never receive an MCQ answer or a hidden test case. They fail loudly if
/// someone widens the participant selector later.
describe('PARTICIPANT_CHALLENGE_SELECT', () => {
  const mcqOptions = PARTICIPANT_CHALLENGE_SELECT.mcqQuestion.select.options;
  const testCases = PARTICIPANT_CHALLENGE_SELECT.codingChallenge.select.testCases;

  it('never selects which MCQ option is correct', () => {
    expect(mcqOptions.select).not.toHaveProperty('isCorrect');
  });

  it('never selects the answer explanation', () => {
    expect(PARTICIPANT_CHALLENGE_SELECT.mcqQuestion.select).not.toHaveProperty('explanation');
  });

  it('filters test cases down to the visible ones', () => {
    expect(testCases.where).toEqual({ isHidden: false });
  });

  it('does not expose the isHidden flag itself', () => {
    expect(testCases.select).not.toHaveProperty('isHidden');
  });

  it('does not expose internal execution limits', () => {
    const coding = PARTICIPANT_CHALLENGE_SELECT.codingChallenge.select;
    expect(coding).not.toHaveProperty('wallTimeLimit');
    expect(coding).not.toHaveProperty('maxProcesses');
    expect(coding).not.toHaveProperty('maxFileSizeKb');
  });

  it('does not expose publication state', () => {
    expect(PARTICIPANT_CHALLENGE_SELECT).not.toHaveProperty('isPublished');
  });

  it('still returns everything a participant legitimately needs', () => {
    expect(mcqOptions.select).toMatchObject({ id: true, label: true, text: true });
    expect(PARTICIPANT_CHALLENGE_SELECT.codingChallenge.select).toMatchObject({
      statement: true,
      starterCode: true,
    });
  });
});

describe('ORGANIZER_CHALLENGE_SELECT', () => {
  it('does expose the correct option, since organizers author the content', () => {
    expect(ORGANIZER_CHALLENGE_SELECT.mcqQuestion.select.options.select).toHaveProperty(
      'isCorrect',
      true,
    );
  });

  it('returns every test case, hidden included', () => {
    const testCases = ORGANIZER_CHALLENGE_SELECT.codingChallenge.select.testCases;
    expect(testCases).not.toHaveProperty('where');
    expect(testCases.select).toHaveProperty('isHidden', true);
  });
});
