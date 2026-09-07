'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: Tone;
  message: string;
  detail?: string;
}

interface ToastContextValue {
  toast: (tone: Tone, message: string, detail?: string) => void;
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Errors stay longer: a failure usually carries a message worth reading, and the
// reader did not choose to be interrupted by it.
const DURATION: Record<Tone, number> = {
  success: 3200,
  info: 3800,
  error: 6000,
};

const TONE_STYLES: Record<Tone, string> = {
  success: 'border-success/45 bg-success/12 text-success',
  error: 'border-danger/45 bg-danger/12 text-danger',
  info: 'border-line-bright bg-surface-2 text-ink',
};

const ICON: Record<Tone, string> = { success: '✓', error: '✕', info: 'i' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const reduceMotion = useReducedMotion();

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (tone: Tone, message: string, detail?: string) => {
      const id = (nextId.current += 1);
      setToasts((current) => [...current, { id, tone, message, detail }]);
      setTimeout(() => dismiss(id), DURATION[tone]);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message, detail) => toast('success', message, detail),
      error: (message, detail) => toast('error', message, detail),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        aria-live on the container, not the individual toast: the region must
        already exist in the DOM when a message is inserted, or assistive tech
        has nothing to observe and the announcement is missed.
      */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4 sm:p-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => (
            <motion.div
              key={item.id}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              role={item.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3',
                'shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)] backdrop-blur-sm',
                TONE_STYLES[item.tone],
              )}
            >
              <span
                aria-hidden
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-current text-[11px]"
              >
                {ICON[item.tone]}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{item.message}</p>
                {item.detail && (
                  <p className="mt-0.5 text-[13px] opacity-80">{item.detail}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss"
                className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-current opacity-60 transition-opacity hover:opacity-100"
              >
                <span aria-hidden>×</span>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
