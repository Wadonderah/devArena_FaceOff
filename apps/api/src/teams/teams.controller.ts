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
import { RequestToJoinDto } from './dto/join-request.dto';

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
  list(
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @CurrentUser('id') viewerId: string,
  ) {
    return this.teams.listForCompetition(competitionId, viewerId);
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

  /// Declared before `teams/:id`, which is the same shape — without this,
  /// `mine` is parsed as an id and fails the UUID pipe with a 400.
  @Get('teams/mine')
  myTeams(@CurrentUser('id') userId: string) {
    return this.teams.myTeams(userId);
  }

  // Declared before `teams/:id/...` so `join-requests` cannot be captured as an
  // id. Different segment counts make that safe either way, but the ordering
  // stops a future two-segment route from breaking it.
  @Post('teams/join-requests/:id/approve')
  approveRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') captainId: string,
  ) {
    return this.teams.approveRequest(id, captainId);
  }

  @Post('teams/join-requests/:id/decline')
  declineRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') captainId: string,
  ) {
    return this.teams.declineRequest(id, captainId);
  }

  @Post('teams/:id/join-requests')
  requestToJoin(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RequestToJoinDto,
  ) {
    return this.teams.requestToJoin(id, userId, dto.message);
  }

  /// Captain only — enforced in the service, not here.
  @Get('teams/:id/join-requests')
  listRequests(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') captainId: string) {
    return this.teams.listRequests(id, captainId);
  }

  @Delete('teams/:id/join-requests/mine')
  withdrawRequest(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.teams.withdrawRequest(id, userId);
  }

  @Get('teams/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.teams.findOne(id, userId);
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
