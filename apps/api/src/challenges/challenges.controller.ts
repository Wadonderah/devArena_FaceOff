import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChallengeType, Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { ChallengesService } from './challenges.service';
import {
  CreateCodingChallengeDto,
  CreateDebuggingChallengeDto,
  CreateMCQChallengeDto,
  PublishChallengeDto,
} from './dto/challenge.dto';

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Get()
  @Roles(Role.ORGANIZER)
  list(
    @Query('type', new ParseEnumPipe(ChallengeType, { optional: true }))
    type?: ChallengeType,
  ) {
    return this.challenges.listForOrganizer(type);
  }

  @Get(':id')
  @Roles(Role.ORGANIZER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.challenges.findOneForOrganizer(id);
  }

  // Participants reach challenge content only through a round, never directly,
  // so enrolment and round timing are always part of the authorization check.
  @Get(':id/in-round/:roundId')
  @UseGuards(VerifiedEmailGuard)
  findOneInRound(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.challenges.findOneForParticipant(id, roundId, userId);
  }

  @Post('mcq')
  @Roles(Role.ORGANIZER)
  createMCQ(@Body() dto: CreateMCQChallengeDto) {
    return this.challenges.createMCQ(dto);
  }

  @Post('coding')
  @Roles(Role.ORGANIZER)
  createCoding(@Body() dto: CreateCodingChallengeDto) {
    return this.challenges.createCoding(dto);
  }

  @Post('debugging')
  @Roles(Role.ORGANIZER)
  createDebugging(@Body() dto: CreateDebuggingChallengeDto) {
    return this.challenges.createDebugging(dto);
  }

  @Patch(':id/publish')
  @Roles(Role.ORGANIZER)
  setPublished(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishChallengeDto,
  ) {
    return this.challenges.setPublished(id, dto);
  }
}
