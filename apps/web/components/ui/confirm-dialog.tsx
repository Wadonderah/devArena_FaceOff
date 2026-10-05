'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /// Say what will actually happen and to whom. "Are you sure?" tells the reader
  /// nothing they did not already know.
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  // Focus lands on Cancel, not Confirm: a stray Enter on a destructive dialog
  // should do nothing.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel();
        return;
      }

      if (event.key !== 'Tab') return;

      // Keep focus inside the dialog — tabbing out to the page behind a modal
      // leaves keyboard users somewhere they cannot see.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-surface-0/75 backdrop-blur-sm"
            onClick={onCancel}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-description"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md rounded-xl border border-line bg-surface-1 p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
          >
            <h2 id="confirm-title" className="font-display text-xl tracking-[-0.02em]">
              {title}
            </h2>
            <p id="confirm-description" className="mt-2.5 text-[15px] leading-relaxed text-ink-dim">
              {description}
            </p>

            <div className="mt-6 flex justify-end gap-2.5">
              <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={loading}>
                {cancelLabel}
              </Button>
              <Button
                variant={destructive ? 'danger' : 'primary'}
                loading={loading}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
