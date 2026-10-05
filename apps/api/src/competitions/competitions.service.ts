import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompetitionState, RoundState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCompetitionDto, UpdateCompetitionDto } from './dto/competition.dto';

// Rounds in DRAFT are invisible to participants: a round still being authored
// must not reveal its existence, name or timing before the organizer publishes it.
const PARTICIPANT_ROUND_STATES = [
  RoundState.SCHEDULED,
  RoundState.LIVE,
  RoundState.COMPLETED,
  RoundState.ARCHIVED,
];

@Injectable()
export class CompetitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCompetitionDto) {
    this.assertRegistrationWindow(dto.registrationOpensAt, dto.registrationClosesAt);

    return this.prisma.competition.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        registrationOpensAt: dto.registrationOpensAt
          ? new Date(dto.registrationOpensAt)
          : null,
        registrationClosesAt: dto.registrationClosesAt
          ? new Date(dto.registrationClosesAt)
          : null,
        maxTeamSize: dto.maxTeamSize,
      },
    });
  }

  async update(id: string, dto: UpdateCompetitionDto) {
    const existing = await this.prisma.competition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Competition not found');

    this.assertRegistrationWindow(
      dto.registrationOpensAt ?? existing.registrationOpensAt?.toISOString(),
      dto.registrationClosesAt ?? existing.registrationClosesAt?.toISOString(),
    );

    return this.prisma.competition.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        state: dto.state,
        registrationOpensAt: dto.registrationOpensAt
          ? new Date(dto.registrationOpensAt)
          : undefined,
        registrationClosesAt: dto.registrationClosesAt
          ? new Date(dto.registrationClosesAt)
          : undefined,
        maxTeamSize: dto.maxTeamSize,
      },
    });
  }

  /// Permanently remove a competition, and only while it is still a draft.
  ///
  /// A competition that has left DRAFT may already own rounds, submissions,
  /// score events and leaderboard standings, and deleting it would take a
  /// participant's recorded work with it. There is no undo, so the state check
  /// is the guard rail: ARCHIVED remains the way to retire a competition that
  /// actually ran. The restriction is enforced here rather than in the UI,
  /// because a hidden button is not an authorisation check.
  async remove(id: string) {
    const existing = await this.prisma.competition.findUnique({
      where: { id },
      select: { id: true, state: true },
    });

    if (!existing) throw new NotFoundException('Competition not found');

    if (existing.state !== CompetitionState.DRAFT) {
      throw new ConflictException(
        'Only a draft competition can be deleted. Archive this one instead to keep its results.',
      );
    }

    // Rounds, challenges links and participants cascade from the schema's
    // relations; a draft has no submissions or score events by definition.
    await this.prisma.competition.delete({ where: { id } });
  }

  /// Participants see only competitions that have left DRAFT.
  async listForParticipants() {
    return this.prisma.competition.findMany({
      where: { state: { not: CompetitionState.DRAFT } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        state: true,
        registrationOpensAt: true,
        registrationClosesAt: true,
        _count: { select: { participants: true } },
      },
    });
  }

  async listForOrganizers() {
    return this.prisma.competition.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { participants: true, rounds: true } } },
    });
  }

  async findOneForParticipant(id: string, userId: string) {
    const competition = await this.prisma.competition.findFirst({
      where: { id, state: { not: CompetitionState.DRAFT } },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        state: true,
        registrationOpensAt: true,
        registrationClosesAt: true,
        // Not sensitive, and the team panel needs it to show "n of N members"
        // and to tell someone a team is full before they try to join it.
        maxTeamSize: true,
        rounds: {
          where: { state: { in: PARTICIPANT_ROUND_STATES } },
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            type: true,
            state: true,
            orderIndex: true,
            startsAt: true,
            endsAt: true,
            allowedLanguages: true,
            // A participant needs to know a round scores through their team
            // before it starts, not when their submission is refused.
            participationMode: true,
            _count: { select: { challenges: true } },
          },
        },
      },
    });

    if (!competition) throw new NotFoundException('Competition not found');

    const participation = await this.prisma.competitionParticipant.findUnique({
      where: { competitionId_userId: { competitionId: id, userId } },
      select: { joinedAt: true },
    });

    return { ...competition, joined: participation !== null, joinedAt: participation?.joinedAt ?? null };
  }

  async findOneForOrganizer(id: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
      include: {
        rounds: {
          orderBy: { orderIndex: 'asc' },
          include: { _count: { select: { challenges: true } } },
        },
        _count: { select: { participants: true } },
      },
    });

    if (!competition) throw new NotFoundException('Competition not found');
    return competition;
  }

  async join(competitionId: string, userId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      select: {
        id: true,
        state: true,
        registrationOpensAt: true,
        registrationClosesAt: true,
      },
    });

    if (!competition || competition.state === CompetitionState.DRAFT) {
      throw new NotFoundException('Competition not found');
    }

    if (
      competition.state === CompetitionState.COMPLETED ||
      competition.state === CompetitionState.ARCHIVED
    ) {
      throw new ForbiddenException('This competition has already finished');
    }

    const now = new Date();

    if (competition.registrationOpensAt && now < competition.registrationOpensAt) {
      throw new ForbiddenException('Registration has not opened yet');
    }

    if (competition.registrationClosesAt && now > competition.registrationClosesAt) {
      throw new ForbiddenException('Registration has closed');
    }

    await this.prisma.competitionParticipant.upsert({
      where: { competitionId_userId: { competitionId, userId } },
      create: { competitionId, userId },
      update: {},
    });

    return { joined: true };
  }

  private assertRegistrationWindow(opensAt?: string | null, closesAt?: string | null): void {
    if (opensAt && closesAt && new Date(closesAt) <= new Date(opensAt)) {
      throw new BadRequestException('Registration must close after it opens');
    }
  }
}
