'use client';

import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import { useMemo } from 'react';
import type { Language } from '@/lib/types';

export function CodeEditor({
  value,
  language,
  onChange,
  readOnly,
}: {
  value: string;
  language: Language;
  onChange: (next: string) => void;
  readOnly?: boolean;
}) {
  const extensions = useMemo(
    () => [language === 'PYTHON' ? python() : javascript()],
    [language],
  );

  return (
    // Height lives on the wrapper, not the editor, so it can be responsive.
    //
    // A fixed 440px was most of a phone's viewport, leaving no room to see the
    // problem statement and the editor together, and it ignored a large desktop
    // screen entirely. `dvh` rather than `vh` because mobile browser chrome
    // shows and hides as you scroll, and `vh` would leave the editor overlapping
    // the address bar.
    <div className="h-[52dvh] min-h-[280px] overflow-hidden rounded-xl border border-line lg:h-[520px]">
      <CodeMirror
        value={value}
        height="100%"
        theme={tokyoNight}
        extensions={extensions}
        editable={!readOnly}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          // Tab moves focus out of the editor rather than inserting a tab, so a
          // keyboard user is never trapped inside the code area.
          tabSize: 4,
        }}
        aria-label="Code editor"
        // Phone keyboards capitalise sentences, autocorrect words and
        // spellcheck — all actively wrong in a code editor, where they silently
        // change `const` to `Const` and underline every identifier. CodeMirror
        // writes into a contenteditable, so these are set on that element
        // directly rather than passed as props.
        onCreateEditor={(view) => {
          view.contentDOM.setAttribute('autocapitalize', 'none');
          view.contentDOM.setAttribute('autocorrect', 'off');
          view.contentDOM.setAttribute('spellcheck', 'false');
          view.contentDOM.setAttribute('autocomplete', 'off');
        }}
      />
    </div>
  );
}
