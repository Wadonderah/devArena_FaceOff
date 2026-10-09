'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';
import type {
  Challenge,
  Competition,
  CompetitionListItem,
  CurrentUser,
  Leaderboard,
  McqProgress,
  NotificationPage,
  Profile,
  RoundSummary,
  SubmissionDetail,
} from './types';

export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: CurrentUser }>('/auth/me').then((r) => r.user),
    // Deliberately no `retry: false`. The provider's policy already refuses to
    // retry a 4xx while retrying 5xx and network faults twice — and a dropped
    // connection or a restarting API must not read as "signed out".
    staleTime: 60_000,
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api<Profile>('/users/me'),
    retry: false,
  });
}

export function useCompetitions() {
  return useQuery({
    queryKey: ['competitions'],
    queryFn: () => api<CompetitionListItem[]>('/competitions'),
  });
}

export function useCompetition(id: string) {
  return useQuery({
    queryKey: ['competition', id],
    queryFn: () => api<Competition>(`/competitions/${id}`),
    enabled: Boolean(id),
  });
}

export function useRound(id: string) {
  return useQuery({
    queryKey: ['round', id],
    queryFn: () => api<RoundSummary & { competitionId: string; enrolled: boolean }>(`/rounds/${id}`),
    enabled: Boolean(id),
  });
}

export function useChallengeInRound(challengeId: string, roundId: string) {
  return useQuery({
    queryKey: ['challenge', challengeId, roundId],
    queryFn: () => api<Challenge>(`/challenges/${challengeId}/in-round/${roundId}`),
    enabled: Boolean(challengeId && roundId),
    retry: false,
  });
}

export function useMcqProgress(roundId: string) {
  return useQuery({
    queryKey: ['mcq-progress', roundId],
    queryFn: () => api<McqProgress>(`/submissions/mcq/rounds/${roundId}/progress`),
    enabled: Boolean(roundId),
  });
}

/// Polled rather than pushed. At pilot scale this reads as live without the
/// operational weight of a socket layer; the interval matches the 2s server-side
/// cache so a poll is nearly always a cache hit.
export function useLeaderboard(competitionId: string, intervalMs = 3000) {
  return useQuery({
    queryKey: ['leaderboard', competitionId],
    queryFn: () => api<Leaderboard>(`/leaderboard/${competitionId}`),
    enabled: Boolean(competitionId),
    refetchInterval: intervalMs,
    refetchIntervalInBackground: false,
  });
}

/// Polls a submission until it reaches a terminal state, then stops.
export function useSubmission(submissionId: string | null) {
  return useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => api<SubmissionDetail>(`/submissions/${submissionId}`),
    enabled: Boolean(submissionId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'QUEUED' || status === 'RUNNING' ? 1200 : false;
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => queryClient.clear(),
  });
}

/// Send the signed-in user another verification link.
///
/// The endpoint takes no body — it reads the account from the session — and is
/// throttled to 3 per hour per user, so the caller must be ready to surface a
/// 429 as something more useful than "failed".
export function useResendVerification() {
  return useMutation({
    mutationFn: () =>
      api<{ message: string }>('/auth/resend-verification', { method: 'POST' }),
  });
}

/// Re-check verification status when the tab regains focus.
///
/// Verification happens in a *different* tab: the link in the email opens one.
/// The global query policy sets `refetchOnWindowFocus: false` deliberately, so
/// without this the banner would still be sitting there when the user came
/// back, telling them to do the thing they just did. Scoped to the banner so
/// the global policy stays as it is.
export function useRecheckOnFocus(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const recheck = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ queryKey: ['me'] });
      }
    };

    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [enabled, queryClient]);
}

/// Countdown to a round's end. Returns null when there is no deadline.
export function useCountdown(target: string | null): {
  remainingMs: number | null;
  label: string;
} {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (!target) return { remainingMs: null, label: '' };

  const remainingMs = Math.max(0, new Date(target).getTime() - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const label = hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;

  return { remainingMs, label };
}

// ── Notifications ──────────────────────────────────────────────────────────
//
// Two queries, not one, and the split is the whole design.
//
// Every signed-in page renders the bell, so whatever it polls is the most
// frequently requested route in the app. `unread-count` is one indexed COUNT
// that returns a single integer; the list is rows, bodies and a second count.
// Polling the cheap one on a timer and fetching the expensive one only when
// somebody actually opens the panel is the difference between a background
// heartbeat and a background load.

const UNREAD_POLL_MS = 25_000;

export function useUnreadNotificationCount() {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api<{ unreadCount: number }>('/notifications/unread-count'),
    enabled: Boolean(user),
    refetchInterval: UNREAD_POLL_MS,
    // `refetchIntervalInBackground` is left at its default of false, which is
    // what pauses this while the tab is hidden: React Query's focus manager
    // tracks `visibilitychange`, so a backgrounded tab stops polling entirely
    // and resumes when it comes forward. No visibility listener of our own.
    //
    // The global default for this is false, so it is overridden here on
    // purpose: returning to the tab should update the badge immediately rather
    // than up to 25 seconds later.
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/// The list, fetched only while the panel is open.
export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api<NotificationPage>('/notifications'),
    enabled,
    // Reopening the panel within a few seconds should not refetch; opening it
    // after a poll has moved the badge should.
    staleTime: 10_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api<{ read: true }>(`/notifications/${id}/read`, { method: 'POST' }),
    // Optimistic, because the row is marked read as a side effect of clicking
    // through to somewhere else: by the time the request resolves the panel is
    // usually gone, and a badge that stays lit after you have read the thing
    // is the single most irritating way for this feature to be wrong.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const previousList = queryClient.getQueryData<NotificationPage>(['notifications', 'list']);
      const previousCount = queryClient.getQueryData<{ unreadCount: number }>([
        'notifications',
        'unread-count',
      ]);

      // Only count down if this row was actually unread, or clicking an
      // already-read notification would drive the badge negative.
      const wasUnread = previousList?.items.find((n) => n.id === id)?.readAt === null;

      if (previousList) {
        queryClient.setQueryData<NotificationPage>(['notifications', 'list'], {
          ...previousList,
          items: previousList.items.map((n) =>
            n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
          ),
          unreadCount: Math.max(0, previousList.unreadCount - (wasUnread ? 1 : 0)),
        });
      }

      if (previousCount && wasUnread) {
        queryClient.setQueryData(['notifications', 'unread-count'], {
          unreadCount: Math.max(0, previousCount.unreadCount - 1),
        });
      }

      return { previousList, previousCount };
    },
    onError: (_error, _id, context) => {
      // Put back exactly what was there. Leaving the optimistic value would
      // show a badge that disagrees with the server until the next poll.
      if (context?.previousList) {
        queryClient.setQueryData(['notifications', 'list'], context.previousList);
      }
      if (context?.previousCount) {
        queryClient.setQueryData(['notifications', 'unread-count'], context.previousCount);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api<{ read: number }>('/notifications/read-all', { method: 'POST' }),
    // Optimistic for the same reason the single-row version is. This button's
    // entire purpose is to clear the badge, so a badge that survives the press
    // until a round trip completes is the one outcome it must not produce.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });

      const previousList = queryClient.getQueryData<NotificationPage>(['notifications', 'list']);
      const previousCount = queryClient.getQueryData<{ unreadCount: number }>([
        'notifications',
        'unread-count',
      ]);

      const readAt = new Date().toISOString();

      if (previousList) {
        queryClient.setQueryData<NotificationPage>(['notifications', 'list'], {
          ...previousList,
          items: previousList.items.map((n) => (n.readAt ? n : { ...n, readAt })),
          unreadCount: 0,
        });
      }

      queryClient.setQueryData(['notifications', 'unread-count'], { unreadCount: 0 });

      return { previousList, previousCount };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(['notifications', 'list'], context.previousList);
      }
      if (context?.previousCount) {
        queryClient.setQueryData(['notifications', 'unread-count'], context.previousCount);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useSendAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { title: string; body: string; competitionId?: string }) =>
      // `api` stringifies the body itself, so this passes the object.
      api<{ sent: number; audience: 'competition' | 'platform' }>('/admin/announcements', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
