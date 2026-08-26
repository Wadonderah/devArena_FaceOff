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
    <div className="overflow-hidden rounded-xl border border-line">
      <CodeMirror
        value={value}
        height="440px"
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
      />
    </div>
  );
}
