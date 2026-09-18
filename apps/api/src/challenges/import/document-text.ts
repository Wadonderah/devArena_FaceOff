import { BadRequestException } from '@nestjs/common';

/// Extracts plain text from an uploaded question paper.
///
/// Kept separate from parsing so the two concerns stay independent: this module
/// knows about file formats and nothing about questions, and question-parser.ts
/// knows about questions and nothing about files.

export type DocumentKind = 'pdf' | 'docx';

// Magic bytes, checked instead of trusting the declared content type or the
// filename — both are supplied by the client and neither is evidence.
const SIGNATURES: Record<DocumentKind, number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  docx: [0x50, 0x4b, 0x03, 0x04], // PK.. — docx is a zip container
};

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function detectKind(buffer: Buffer): DocumentKind {
  for (const [kind, signature] of Object.entries(SIGNATURES) as [DocumentKind, number[]][]) {
    if (signature.every((byte, i) => buffer[i] === byte)) return kind;
  }

  throw new BadRequestException(
    'That file is not a PDF or a .docx. Legacy .doc files are not supported — re-save as .docx or PDF.',
  );
}

export async function extractText(buffer: Buffer): Promise<{ text: string; kind: DocumentKind }> {
  if (buffer.length === 0) {
    throw new BadRequestException('That file is empty.');
  }

  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new BadRequestException('That file is larger than 10 MB.');
  }

  const kind = detectKind(buffer);

  try {
    const text = kind === 'pdf' ? await fromPdf(buffer) : await fromDocx(buffer);

    // A PDF of scanned pages parses successfully and yields nothing, which is
    // indistinguishable from a broken file unless we say so explicitly.
    if (text.trim().length === 0) {
      throw new BadRequestException(
        kind === 'pdf'
          ? 'No text found. If this is a scan, the page is an image and contains no text to read.'
          : 'No text found in that document.',
      );
    }

    return { text, kind };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;

    // A corrupt or password-protected file throws from deep inside the library;
    // the organizer needs an explanation, not a stack trace.
    throw new BadRequestException(
      'That file could not be read. It may be corrupt or password-protected.',
    );
  }
}

async function fromPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2 is a class, not the single default function v1 exported. The
  // parser holds a worker open, so destroy() must run even when getText throws.
  const { PDFParse } = await import('pdf-parse');

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function fromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');

  // extractRawText, never convertToHtml: this text is untrusted and is only ever
  // parsed and rendered as text. Taking HTML from an uploaded file would hand an
  // organizer's browser markup written by whoever produced the document.
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
