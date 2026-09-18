import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { TeamsService } from './teams.service';
import { CreateTeamDto, JoinTeamDto, TransferCaptaincyDto } from './dto/team.dto';

@Controller()
@UseGuards(VerifiedEmailGuard)
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Post('competitions/:competitionId/teams')
  create(
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teams.create(competitionId, userId, dto);
  }

  @Get('competitions/:competitionId/teams')
  list(@Param('competitionId', ParseUUIDPipe) competitionId: string) {
    return this.teams.listForCompetition(competitionId);
  }

  @Get('competitions/:competitionId/teams/mine')
  mine(
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.teams.myTeam(competitionId, userId);
  }

  @Post('teams/join')
  join(@CurrentUser('id') userId: string, @Body() dto: JoinTeamDto) {
    return this.teams.joinByCode(userId, dto);
  }

  @Get('teams/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.teams.findOne(id);
  }

  @Post('teams/:id/leave')
  leave(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.teams.leave(id, userId);
  }

  @Delete('teams/:id')
  disband(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') captainId: string) {
    return this.teams.disband(id, captainId);
  }

  @Delete('teams/:id/members/:userId')
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('id') captainId: string,
  ) {
    return this.teams.removeMember(id, captainId, targetUserId);
  }

  @Post('teams/:id/captain')
  transferCaptaincy(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') captainId: string,
    @Body() dto: TransferCaptaincyDto,
  ) {
    return this.teams.transferCaptaincy(id, captainId, dto.userId);
  }
}
