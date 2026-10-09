'use client';

import { useMemo, useState } from 'react';
import { Send, Users } from 'lucide-react';
import { AuthGate } from '@/components/auth-gate';
import { ConsoleShell } from '@/components/console-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { TextAreaField } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { useCompetitions, useCurrentUser, useSendAnnouncement } from '@/lib/hooks';
import { describeError } from '@/lib/api';

/// Mirrors the server's limits in CreateAnnouncementDto. Checked here as well so
/// the writer finds out before they press send, not after.
const TITLE_MAX = 120;
const BODY_MAX = 2000;
const MIN = 3;

/// The value the audience select uses for "everyone". Not a competition id, and
/// not the empty string — an empty option value is indistinguishable from an
/// unset select, which is how a form like this sends a platform-wide broadcast
/// by accident.
const PLATFORM = '__platform__';

function AnnouncementForm() {
  const { data: user } = useCurrentUser();
  const { data: competitions } = useCompetitions();
  const send = useSendAnnouncement();
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('');
  const [confirming, setConfirming] = useState(false);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const options = useMemo(() => {
    const competitionOptions = (competitions ?? []).map((competition) => ({
      value: competition.id,
      label: competition.name,
    }));

    return [
      { value: '', label: 'Choose who this reaches…' },
      ...competitionOptions,
      // Offered only to an administrator, because the server refuses it for
      // anyone else. Showing a disabled-on-submit option would be a worse way
      // to communicate the same rule.
      ...(isSuperAdmin
        ? [{ value: PLATFORM, label: 'Everyone on the platform' }]
        : []),
    ];
  }, [competitions, isSuperAdmin]);

  const platformWide = audience === PLATFORM;
  const chosen = competitions?.find((c) => c.id === audience);

  const titleTooLong = title.length > TITLE_MAX;
  const bodyTooLong = body.length > BODY_MAX;
  const ready =
    title.trim().length >= MIN &&
    body.trim().length >= MIN &&
    audience !== '' &&
    !titleTooLong &&
    !bodyTooLong;

  function submit() {
    setConfirming(false);

    send.mutate(
      {
        title: title.trim(),
        body: body.trim(),
        ...(platformWide ? {} : { competitionId: audience }),
      },
      {
        onSuccess: (result) => {
          toast.success(
            result.sent === 0
              ? 'Nobody to notify'
              : `Sent to ${result.sent} ${result.sent === 1 ? 'person' : 'people'}`,
            result.sent === 0
              ? 'That audience has no active members yet, so nothing was sent.'
              : undefined,
          );
          // Cleared on success only. A failed send keeps the text, because
          // retyping a paragraph someone just lost is the worst possible
          // response to a transient error.
          setTitle('');
          setBody('');
          setAudience('');
        },
        onError: (error) => {
          const { title: heading, detail } = describeError(error, 'Could not send that');
          toast.error(heading, detail);
        },
      },
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Was a bespoke icon-and-title block at `text-2xl`, which made this the
          one console page whose header did not match the others. */}
      <PageHeader
        title="Send an announcement"
        subtitle="Appears in the recipient’s notification bell straight away. There is no way to recall one, so read it back before you send."
      />

      <form
        className="panel hairline space-y-5 p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) setConfirming(true);
        }}
      >
        <SelectField
          label="Audience"
          options={options}
          value={audience}
          onChange={(event) => setAudience(event.target.value)}
          hint={
            platformWide
              ? 'Every active account, including organizers.'
              : chosen
                ? `Participants enrolled in ${chosen.name}.`
                : 'Only the people in the audience you pick will see this.'
          }
        />

        <Field
          label="Title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Round two starts at 14:00"
          hint={`${title.length}/${TITLE_MAX}`}
          error={titleTooLong ? 'Too long' : undefined}
        />

        <TextAreaField
          label="Message"
          rows={5}
          value={body}
          maxLength={BODY_MAX}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Doors open at 13:30. Bring your laptop and charger."
          hint={`${body.length}/${BODY_MAX}`}
          error={bodyTooLong ? 'Too long' : undefined}
        />

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <p className="flex items-center gap-1.5 text-[12px] text-ink-faint">
            <Users aria-hidden size={13} strokeWidth={1.5} />
            {platformWide
              ? 'Everyone on the platform'
              : chosen
                ? chosen.name
                : 'No audience chosen'}
          </p>

          <Button type="submit" disabled={!ready} loading={send.isPending} icon={<Send />}>
            Send
          </Button>
        </div>
      </form>

      {/* Confirmed because it cannot be undone and it reaches people who are
          mid-competition. The dialog names the audience rather than asking
          "are you sure", which tells the sender nothing they did not know. */}
      <ConfirmDialog
        open={confirming}
        title={platformWide ? 'Notify everyone?' : 'Send this announcement?'}
        description={
          platformWide
            ? `This reaches every active account on the platform and cannot be recalled. The title will read "${title.trim()}".`
            : `This reaches everyone enrolled in ${chosen?.name ?? 'that competition'} and cannot be recalled. The title will read "${title.trim()}".`
        }
        confirmLabel="Send it"
        destructive={platformWide}
        loading={send.isPending}
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

export default function AnnouncementsPage() {
  return (
    <AuthGate requireStaff>
      <ConsoleShell>
        <AnnouncementForm />
      </ConsoleShell>
    </AuthGate>
  );
}
