'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api, describeError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { TextAreaField } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import type { Competition } from '@/lib/types';

/// `datetime-local` wants `YYYY-MM-DDTHH:mm` in LOCAL time; the API sends UTC
/// ISO strings. Feeding one straight into the input silently shows the wrong
/// time to anyone not on UTC, so the offset is removed explicitly.
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const toIso = (local: string): string | undefined =>
  local ? new Date(local).toISOString() : undefined;

export function CompetitionSettings({ competition }: { competition: Competition }) {
  const { id } = competition;
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState(competition.name);
  const [description, setDescription] = useState(competition.description ?? '');
  const [opensAt, setOpensAt] = useState(toLocalInput(competition.registrationOpensAt));
  const [closesAt, setClosesAt] = useState(toLocalInput(competition.registrationClosesAt));
  const [maxTeamSize, setMaxTeamSize] = useState(String(competition.maxTeamSize ?? ''));
  const [confirmName, setConfirmName] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-competition', id] });
    queryClient.invalidateQueries({ queryKey: ['competitions'] });
    queryClient.invalidateQueries({ queryKey: ['competition', id] });
  };

  const save = useMutation({
    mutationFn: () =>
      api(`/competitions/${id}`, {
        method: 'PATCH',
        body: {
          name,
          description: description || null,
          registrationOpensAt: toIso(opensAt),
          registrationClosesAt: toIso(closesAt),
          maxTeamSize: maxTeamSize ? Number(maxTeamSize) : undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Competition updated');
      invalidate();
    },
    onError: (error) => {
      const { title, detail } = describeError(error, 'Could not save');
      toast.error(title, detail);
    },
  });

  const remove = useMutation({
    mutationFn: () => api<void>(`/competitions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Competition deleted');
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      router.push('/admin');
    },
    onError: (error) => {
      const { title, detail } = describeError(error, 'Could not delete');
      toast.error(title, detail);
    },
  });

  // Only a draft can be deleted. Anything further along owns rounds,
  // submissions and score events, and there is no undo. The API enforces this
  // too — hiding the control is a courtesy, not the check.
  const deletable = competition.state === 'DRAFT';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <section className="panel hairline overflow-hidden">
      <div className="border-b border-line p-4">
        <h2 className="text-lg">Settings</h2>
        <p className="mt-0.5 text-[13px] text-ink-faint">
          Name, description and the registration window.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 p-4">
        <Field
          label="Name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <TextAreaField
          label="Description"
          name="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          hint="Shown to participants on their dashboard and the competition page."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Registration opens"
            name="registrationOpensAt"
            type="datetime-local"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
          />
          <Field
            label="Registration closes"
            name="registrationClosesAt"
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
        </div>

        <Field
          label="Maximum team size"
          name="maxTeamSize"
          type="number"
          min={1}
          value={maxTeamSize}
          onChange={(e) => setMaxTeamSize(e.target.value)}
        />

        <Button type="submit" loading={save.isPending}>
          Save changes
        </Button>
      </form>

      {/* Visually separated from the form above, not stacked onto it: the two
          do different kinds of thing and one of them cannot be undone. */}
      <div className="border-t border-line bg-danger/[0.04] p-4">
        <h3 className="text-[15px] font-medium text-danger">Delete this competition</h3>

        {deletable ? (
          <>
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink-dim">
              This cannot be undone. The competition and its rounds are removed permanently. Type
              the name below to confirm.
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem] flex-1">
                <Field
                  label=""
                  aria-label={`Type ${competition.name} to confirm deletion`}
                  placeholder={competition.name}
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                />
              </div>
              <Button
                variant="danger"
                icon={<Trash2 />}
                loading={remove.isPending}
                disabled={confirmName !== competition.name}
                onClick={() => remove.mutate()}
              >
                Delete
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink-dim">
            Only a draft can be deleted. This one has left draft, so it may already hold rounds,
            submissions and scores. Set its state to <strong>Archived</strong> instead to retire it
            while keeping its results.
          </p>
        )}
      </div>
    </section>
  );
}
