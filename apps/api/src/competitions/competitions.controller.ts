import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { ROLE_RANK } from '../auth/guards/roles.guard';
import { VerifiedEmailGuard } from '../auth/guards/verified-email.guard';
import { CompetitionsService } from './competitions.service';
import { CreateCompetitionDto, UpdateCompetitionDto } from './dto/competition.dto';

@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly competitions: CompetitionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.isStaff(user)
      ? this.competitions.listForOrganizers()
      : this.competitions.listForParticipants();
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Two distinct read models rather than one filtered afterwards: an organizer
    // sees draft rounds, a participant must not learn they exist.
    return this.isStaff(user)
      ? this.competitions.findOneForOrganizer(id)
      : this.competitions.findOneForParticipant(id, user.id);
  }

  @Post()
  @Roles(Role.ORGANIZER)
  create(@Body() dto: CreateCompetitionDto) {
    return this.competitions.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ORGANIZER)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompetitionDto) {
    return this.competitions.update(id, dto);
  }

  @Post(':id/join')
  @UseGuards(VerifiedEmailGuard)
  join(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.competitions.join(id, userId);
  }

  private isStaff(user: AuthenticatedUser): boolean {
    return ROLE_RANK[user.role] >= ROLE_RANK[Role.ORGANIZER];
  }
}
