import { Arena } from '@/components/arena';
import { Sky } from '@/components/sky';

/// The stage, behind the sign-in and create-account forms.
///
/// These two pages are still a brand moment rather than a work surface — the
/// last thing someone sees before they are inside, and the first if they are
/// deciding whether to bother. The app's own pages deliberately do not get this:
/// a dashboard or a code editor needs a quiet ground, and a backdrop behind a
/// table is just noise.
///
/// Quieter than the landing page's: further down, and with the scrim doing more
/// of the work, because a form is small and centred and has nowhere to hide
/// from a busy ring passing behind an input.
export function AuthBackdrop() {
  return (
    <>
      <Sky />

      <div
        aria-hidden
        className="arena-backdrop pointer-events-none absolute bottom-0 left-1/2 z-0 w-[240%] max-w-none -translate-x-1/2 translate-y-[46%] sm:w-[180%] lg:w-[132%]"
      >
        {/* Nested so it multiplies with the theme's backdrop opacity rather
            than replacing it — a form has helper text at 13px sitting directly
            over these rings, and it has nowhere else to go. */}
        <div className="opacity-[0.62]">
          <Arena backdrop />
        </div>
      </div>

      <div aria-hidden className="hero-scrim pointer-events-none absolute inset-0 z-0" />
    </>
  );
}
