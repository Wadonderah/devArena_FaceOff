'use client';

import { Check, UserPlus, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAnswerJoinRequest, useTeamJoinRequests } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { relativeTime } from '@/lib/notifications';

/// Pending requests, with approve and decline. Captain only — the endpoint
/// refuses anyone else regardless.
export function TeamJoinRequests({
  teamId,
  competitionId,
  isCaptain,
}: {
  teamId: string;
  competitionId: string;
  isCaptain: boolean;
}) {
  const { data: requests, isLoading } = useTeamJoinRequests(teamId, isCaptain);
  const answer = useAnswerJoinRequest(competitionId, teamId);
  const toast = useToast();

  if (!isCaptain) return null;
  if (isLoading) return <Skeleton className="mb-5 h-24 w-full rounded-xl" />;
  if (!requests || requests.length === 0) return null;

  // Success toast lives in the hook; see the note there.
  const respond = (id: string, approve: boolean, name: string) => {
    answer.mutate(
      { id, approve, name },
      {
        onError: (err) =>
          toast.error(
            approve ? 'Could not approve that request' : 'Could not decline that request',
            err instanceof ApiError ? err.displayMessage : 'Please try again.',
          ),
      },
    );
  };

  return (
    <section className="panel hairline mb-5 overflow-hidden">
      <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <UserPlus aria-hidden size={15} strokeWidth={1.5} className="shrink-0 text-brand-bright" />
        <h2 className="text-[14px] font-medium text-ink">
          {requests.length === 1 ? '1 person wants to join' : `${requests.length} people want to join`}
        </h2>
      </header>

      <ul className="divide-y divide-line">
        {requests.map((request) => {
          const name = request.user.profile?.displayName ?? 'A participant';
          const pending = answer.isPending && answer.variables?.id === request.id;

          return (
            <li key={request.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={name} src={request.user.profile?.avatarUrl} size={32} tone="muted" />

              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="truncate text-[14px] text-ink">{name}</span>
                  <time
                    dateTime={request.createdAt}
                    className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint"
                  >
                    {relativeTime(request.createdAt)}
                  </time>
                </p>
                {request.message && (
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-faint">
                    {request.message}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  loading={pending}
                  icon={<Check />}
                  onClick={() => respond(request.id, true, name)}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  icon={<X />}
                  onClick={() => respond(request.id, false, name)}
                >
                  Decline
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
