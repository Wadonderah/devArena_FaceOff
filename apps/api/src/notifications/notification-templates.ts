import { NotificationType, RoundType, type Prisma } from '@prisma/client';

/// One notification, minus its recipient. Keeps every participant-visible
/// string in this file rather than in the services that trigger them.
export interface NotificationTemplate {
  type: NotificationType;
  title: string;
  body: string;
  /// App-relative, or null for a row that is not clickable.
  linkUrl?: string | null;
  metadata?: Prisma.InputJsonValue;
  /// Null means "may repeat". See `Notification.dedupeKey` in the schema.
  dedupeKey?: string | null;
}

/// Mirrors ROUND_PATH in apps/web/lib/taxonomy.ts. There is no `/rounds/<id>`
/// index page, so the type has to pick the path. Adding a format edits both.
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
    // Resuming a paused round transitions to LIVE again; not a second start.
    dedupeKey: `round:${round.id}:started`,
  };
}

export function roundEnded(round: RoundRef, competitionName: string): NotificationTemplate {
  return {
    type: NotificationType.ROUND_ENDED,
    title: `${round.name} has ended`,
    body: `Submissions are closed for this round in ${competitionName}. Scores may still be confirmed, so the standings can shift.`,
    // The round page is a dead end once closed; the standings are not.
    linkUrl: `/leaderboard/${round.competitionId}`,
    metadata: { roundId: round.id, competitionId: round.competitionId },
    // Unlocking a finished round to correct scores recloses it.
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

/// Staff only. The participant already sees `GRADING_FAILED_MESSAGE`; this is
/// what makes its "an organizer has been notified" true.
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
    // An internal fault string, kept out of the body.
    metadata: { submissionId: submission.id, reason: submission.reason },
    dedupeKey: `submission:${submission.id}:grading-failed`,
  };
}

/// Goes to the whole platform, unlike every other template here — it has to,
/// since nobody is enrolled at the moment it fires.
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
    // Setting up may toggle REGISTRATION → DRAFT → REGISTRATION. One opening.
    dedupeKey: `competition:${competition.id}:registration-open`,
  };
}

/// To the captain: somebody wants in.
export function teamJoinRequested(
  team: { id: string; name: string },
  requester: { id: string; label: string },
): NotificationTemplate {
  return {
    type: NotificationType.TEAM_JOIN_REQUEST,
    title: `${requester.label} asked to join ${team.name}`,
    body: 'Approve or decline the request on your team page.',
    linkUrl: `/teams/${team.id}`,
    metadata: { teamId: team.id, userId: requester.id },
    // Re-asking after a decline is a new request and should be announced again,
    // so this is keyed on neither.
    dedupeKey: null,
  };
}

export function teamRequestApproved(team: {
  id: string;
  name: string;
}): NotificationTemplate {
  return {
    type: NotificationType.TEAM_REQUEST_APPROVED,
    title: `You are in ${team.name}`,
    body: 'Your request was approved. Team rounds now score through this team.',
    linkUrl: `/teams/${team.id}`,
    metadata: { teamId: team.id },
    dedupeKey: null,
  };
}

export function teamRequestDeclined(team: {
  id: string;
  name: string;
  competitionId: string;
}): NotificationTemplate {
  return {
    type: NotificationType.TEAM_REQUEST_DECLINED,
    title: `${team.name} declined your request`,
    body: 'You can ask another team, or create your own.',
    // Back to the team list, which is where the next useful action is — the
    // team's own page would be a dead end.
    linkUrl: `/competitions/${team.competitionId}`,
    metadata: { teamId: team.id },
    dedupeKey: null,
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
    // No dedupeKey: sending the same reminder twice is intentional.
    dedupeKey: null,
  };
}
