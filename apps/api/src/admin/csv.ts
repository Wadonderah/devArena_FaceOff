/// Minimal RFC 4180 writer. A field is quoted when it contains a delimiter,
/// quote or newline, and embedded quotes are doubled — without this a display
/// name containing a comma would silently shift every later column.
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(escape).join(',')];

  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }

  return lines.join('\r\n');
}

function escape(value: string | number | null): string {
  if (value === null || value === undefined) return '';

  const text = String(value);

  // A leading =, +, - or @ is treated as a formula by spreadsheet software.
  // Prefixing with a quote neutralises it, so an exported display name cannot
  // execute when the organizer opens the results in Excel.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }

  return guarded;
}
