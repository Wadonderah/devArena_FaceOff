import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes a header row followed by data rows', () => {
    expect(toCsv(['rank', 'name'], [[1, 'Alice']])).toBe('rank,name\r\n1,Alice');
  });

  it('quotes a field containing a comma so columns do not shift', () => {
    expect(toCsv(['name'], [['Doe, Jane']])).toBe('name\r\n"Doe, Jane"');
  });

  it('doubles embedded quotes', () => {
    expect(toCsv(['name'], [['She said "hi"']])).toBe('name\r\n"She said ""hi"""');
  });

  it('quotes a field containing a newline', () => {
    expect(toCsv(['bio'], [['line1\nline2']])).toBe('bio\r\n"line1\nline2"');
  });

  it('renders null as an empty field', () => {
    expect(toCsv(['a', 'b'], [[null, 1]])).toBe('a,b\r\n,1');
  });

  it('neutralises a formula so a name cannot execute in a spreadsheet', () => {
    expect(toCsv(['name'], [['=1+1']])).toBe("name\r\n'=1+1");
    expect(toCsv(['name'], [['@SUM(A1)']])).toBe("name\r\n'@SUM(A1)");
    expect(toCsv(['name'], [['-2+3']])).toBe("name\r\n'-2+3");
  });

  it('quotes a neutralised formula that also contains a comma', () => {
    expect(toCsv(['name'], [['=HYPERLINK("a","b")']])).toBe(
      'name\r\n"\'=HYPERLINK(""a"",""b"")"',
    );
  });

  it('handles an empty result set', () => {
    expect(toCsv(['rank', 'name'], [])).toBe('rank,name');
  });
});
