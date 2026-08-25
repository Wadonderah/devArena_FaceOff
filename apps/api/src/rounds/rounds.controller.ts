import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role, RoundState } from '@prisma/client';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { RoundsService } from './rounds.service';
import { CreateRoundDto, SetRoundChallengesDto, UpdateRoundDto } from './dto/round.dto';

@Controller()
export class RoundsController {
  constructor(private readonly rounds: RoundsService) {}

  @Post('competitions/:competitionId/rounds')
  @Roles(Role.ORGANIZER)
  create(
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @Body() dto: CreateRoundDto,
  ) {
    return this.rounds.create(competitionId, dto);
  }

  @Get('rounds/:id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return user.role === Role.ORGANIZER || user.role === Role.ADMIN
      ? this.rounds.findOneForOrganizer(id)
      : this.rounds.findOneForParticipant(id, user.id);
  }

  @Patch('rounds/:id')
  @Roles(Role.ORGANIZER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoundDto) {
    return this.rounds.update(id, dto);
  }

  @Post('rounds/:id/challenges')
  @Roles(Role.ORGANIZER)
  setChallenges(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoundChallengesDto,
  ) {
    return this.rounds.setChallenges(id, dto);
  }

  @Post('rounds/:id/schedule')
  @Roles(Role.ORGANIZER)
  schedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.transition(id, RoundState.SCHEDULED);
  }

  @Post('rounds/:id/start')
  @Roles(Role.ORGANIZER)
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.transition(id, RoundState.LIVE);
  }

  @Post('rounds/:id/end')
  @Roles(Role.ORGANIZER)
  end(@Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.transition(id, RoundState.COMPLETED);
  }

  @Post('rounds/:id/archive')
  @Roles(Role.ORGANIZER)
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.transition(id, RoundState.ARCHIVED);
  }
}
