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
