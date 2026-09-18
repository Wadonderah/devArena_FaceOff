import { Injectable, Logger } from '@nestjs/common';
import { extractText } from './document-text';
import { parseQuestions, type DraftQuestion } from './question-parser';

export interface ImportPreview {
  kind: 'pdf' | 'docx';
  questions: DraftQuestion[];
  /// Counts the review UI uses to summarise the import at a glance.
  summary: {
    found: number;
    withAnswerKey: number;
    needingAttention: number;
    skippedLines: number;
  };
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  /// Reads a document and returns drafts for review.
  ///
  /// Deliberately creates nothing. The organizer confirms each question, and the
  /// existing POST /challenges/mcq does the writing — so an imported question is
  /// validated exactly like a hand-authored one, and a bad parse can never reach
  /// the library on its own.
  async preview(buffer: Buffer): Promise<ImportPreview> {
    const { text, kind } = await extractText(buffer);
    const { questions, skippedLineCount } = parseQuestions(text);

    this.logger.log(
      `Parsed ${questions.length} question(s) from a ${kind} (${skippedLineCount} lines unattributed)`,
    );

    return {
      kind,
      questions,
      summary: {
        found: questions.length,
        withAnswerKey: questions.filter((q) => q.correctIndex !== null).length,
        needingAttention: questions.filter((q) => q.warnings.length > 0).length,
        skippedLines: skippedLineCount,
      },
    };
  }
}
