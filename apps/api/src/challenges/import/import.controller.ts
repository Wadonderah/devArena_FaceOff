import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators';
import { ImportService } from './import.service';
import { MAX_DOCUMENT_BYTES } from './document-text';

@Controller('challenges/import')
@Roles(Role.ORGANIZER)
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  /// Returns drafts for review. Writes nothing — creation happens through the
  /// existing POST /challenges/mcq once the organizer confirms.
  @Post('document')
  // Parsing a large document costs real CPU, so this is rate limited well below
  // the default even though it is organizer-only.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      // Held in memory rather than written to disk: nothing here needs to
      // outlive the request, and not writing untrusted uploads to the filesystem
      // removes a whole category of problem.
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer) {
      throw new BadRequestException('No file was uploaded.');
    }

    return this.imports.preview(file.buffer);
  }
}
