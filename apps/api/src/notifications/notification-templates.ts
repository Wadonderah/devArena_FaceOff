import { NotificationType, RoundType, type Prisma } from '@prisma/client';

/// One notification, minus its recipient.
///
/// Separating the wording from the fan-out is what lets a single event become
/// fifty rows without the copy being written fifty times, and it keeps every
/// participant-visible string in this file rather than scattered through the
/// services that happen to trigger them.
export interface NotificationTemplate {
  type: NotificationType;
  title: string;
  body: string;
  /// App-relative path, or null for a row that is not clickable.
  linkUrl?: string | null;
  metadata?: Prisma.InputJsonValue;
  /// See `Notification.dedupeKey` in the schema. Null means "may repeat".
  dedupeKey?: string | null;
}

/// Which participant page serves each round type.
///
/// Mirrors ROUND_PATH in apps/web/lib/taxonomy.ts, which is the original. The
/// API cannot import from the web app, and there is no `/rounds/<id>` index
/// page to link to instead — only these three. Adding a round format means
/// editing both, which is why each file names the other.
const ROUND_PATH: Record<RoundType, string> = {
  [RoundType.MCQ]: 'mcq',
  [RoundType.CODING]: 'coding',
  [RoundType.DEBUGGING]: 'debugging',
};

interface RoundRef {
  id: string;
  name: string;
  type: RoundType;
  competitionId: string;
}

export function roundStarted(round: RoundRef, competitionName: string): NotificationTemplate {
  return {
    type: NotificationType.ROUND_STARTED,
    title: `${round.name} is open`,
    body: `The round has started in ${competitionName} and is accepting submissions.`,
    linkUrl: `/rounds/${round.id}/${ROUND_PATH[round.type]}`,
    metadata: { roundId: round.id, competitionId: round.competitionId },
    // A paused round transitions to LIVE again when it resumes, which is not a
    // second start and must not be a second notification.
    dedupeKey: `round:${round.id}:started`,
  };
}

export function roundEnded(round: RoundRef, competitionName: string): NotificationTemplate {
  return {
    type: NotificationType.ROUND_ENDED,
    title: `${round.name} has ended`,
    body: `Submissions are closed for this round in ${competitionName}. Scores may still be confirmed, so the standings can shift.`,
    // The round page itself is a dead end once it has closed; the standings are
    // the thing anyone reading this actually wants.
    linkUrl: `/leaderboard/${round.competitionId}`,
    metadata: { roundId: round.id, competitionId: round.competitionId },
    // An organizer unlocking a finished round to correct scores recloses it.
    dedupeKey: `round:${round.id}:ended`,
  };
}

export function teamJoined(
  team: { id: string; name: string },
  member: { id: string; label: string },
): NotificationTemplate {
  return {
    type: NotificationType.TEAM_JOINED,
    title: `${member.label} joined ${team.name}`,
    body: 'Your team has a new member.',
    linkUrl: `/teams/${team.id}`,
    metadata: { teamId: team.id, userId: member.id },
    dedupeKey: `team:${team.id}:joined:${member.id}`,
  };
}

/// Sent to staff, not to the participant.
///
/// The participant already sees `GRADING_FAILED_MESSAGE` on their submission.
/// This is the other half of that sentence: somebody is actually told.
export function gradingAlert(submission: {
  id: string;
  attempts: number;
  reason: string;
}): NotificationTemplate {
  return {
    type: NotificationType.GRADING_ALERT,
    title: 'A submission could not be graded',
    body: `Grading failed after ${submission.attempts} attempts and the submission was marked as a system error. The participant was told it was not their fault and invited to retry.`,
    linkUrl: '/admin',
    // The reason is an internal fault string (a Judge0 error, a timeout). It is
    // kept in metadata rather than the body because only staff receive this
    // row and the console is where it is useful.
    metadata: { submissionId: submission.id, reason: submission.reason },
    dedupeKey: `submission:${submission.id}:grading-failed`,
  };
}

/// A competition has opened for registration.
///
/// Goes to the whole platform rather than to a competition's participants,
/// which is the opposite of every other template here — and has to be, since
/// nobody is enrolled at the moment it fires. Recruiting is the point.
export function competitionOpenForRegistration(competition: {
  id: string;
  name: string;
}): NotificationTemplate {
  return {
    type: NotificationType.COMPETITION_OPEN,
    title: `${competition.name} is open for registration`,
    body: 'Registration is now open. Join to take part in this competition.',
    linkUrl: `/competitions/${competition.id}`,
    metadata: { competitionId: competition.id },
    // An organizer setting a competition up may move it into REGISTRATION, back
    // to DRAFT to fix something, and into REGISTRATION again. That is one
    // opening, not three.
    dedupeKey: `competition:${competition.id}:registration-open`,
  };
}

export function announcement(
  title: string,
  body: string,
  competitionId?: string,
): NotificationTemplate {
  return {
    type: NotificationType.ANNOUNCEMENT,
    title,
    body,
    linkUrl: competitionId ? `/competitions/${competitionId}` : null,
    metadata: competitionId ? { competitionId } : undefined,
    // Deliberately no dedupeKey: an organizer who sends the same reminder twice
    // means to send it twice, and collapsing that would look like a bug.
    dedupeKey: null,
  };
}
