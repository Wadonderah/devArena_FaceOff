import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { McqService } from './mcq.service';
import { CodeService } from './code.service';
import { SubmitMcqAnswerDto } from './dto/mcq-answer.dto';
import { SubmitCodeDto } from './dto/code-submission.dto';

@Controller('submissions')
@UseGuards(VerifiedEmailGuard)
export class SubmissionsController {
  constructor(
    private readonly mcq: McqService,
    private readonly code: CodeService,
  ) {}

  @Post('mcq')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  submitMcq(@CurrentUser('id') userId: string, @Body() dto: SubmitMcqAnswerDto) {
    return this.mcq.submitAnswer(userId, dto);
  }

  @Get('mcq/rounds/:roundId/progress')
  progress(
    @CurrentUser('id') userId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
  ) {
    return this.mcq.progress(userId, roundId);
  }

  @Get('mcq/rounds/:roundId/results')
  results(
    @CurrentUser('id') userId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
  ) {
    return this.mcq.results(userId, roundId);
  }

  // Two limits together: a burst cap and a hard floor between submissions, so a
  // participant cannot use the judge as a brute-force oracle against hidden tests.
  @Post('code')
  @Throttle({
    burst: { limit: 10, ttl: 60_000 },
    sustained: { limit: 1, ttl: 10_000 },
  })
  @HttpCode(HttpStatus.ACCEPTED)
  submitCode(@CurrentUser('id') userId: string, @Body() dto: SubmitCodeDto) {
    return this.code.submit(userId, dto);
  }

  // Run is the debugging loop, not a scored action: it executes against the
  // sample cases the participant can already see, so it is not an oracle for
  // the hidden ones the way `submit` would be.
  //
  // It was 1 per 15 seconds, which punishes exactly the behaviour the feature
  // exists for — fix a typo, press Run, fix another, press Run. Six per minute
  // keeps the same average load on Judge0 while letting a short burst through,
  // which is how people actually iterate.
  @Post('code/run')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  runCode(@CurrentUser('id') userId: string, @Body() dto: SubmitCodeDto) {
    return this.code.run(userId, dto);
  }

  @Get('code/rounds/:roundId/mine')
  listMine(
    @CurrentUser('id') userId: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
  ) {
    return this.code.listMine(userId, roundId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.code.findOne(id, userId);
  }
}
