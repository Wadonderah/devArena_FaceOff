import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { CompetitionState, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { generateTeamCode, normalizeTeamCode } from './team-code'
import type { CreateTeamDto, JoinTeamDto } from './dto/team.dto'

const TEAM_SELECT = {
    id: true,
    name: true,
    code: true,
    avatarUrl: true,
    captainId: true,
    competitionId: true,
    createdAt: true,
    members: {
        orderBy: { joinedAt: 'asc' as const },
        select: {
            userId: true,
            joinedAt: true,
            user: {
                select: {
                    id: true,
                    profile: { select: { displayName: true, country: true, avatarUrl: true } },
                },
            },
        },
    },
} satisfies Prisma.TeamSelect

@Injectable()
export class TeamsService {
    constructor(private readonly prisma: PrismaService) {}

    async create(competitionId: string, userId: string, dto: CreateTeamDto) {
        await this.assertJoinable(competitionId, userId)

        const team = await this.withUniqueCode((code) =>
            this.prisma.team.create({
                data: {
                    competitionId,
                    name: dto.name,
                    code,
                    avatarUrl: dto.avatarUrl,
                    captainId: userId,

                    members: { create: { userId, competitionId } },
                },
                select: TEAM_SELECT,
            })
        )

        return team
    }

    async joinByCode(userId: string, dto: JoinTeamDto) {
        const code = normalizeTeamCode(dto.code)

        const team = await this.prisma.team.findUnique({
            where: { code },
            select: { id: true, competitionId: true, name: true },
        })

        if (!team) throw new NotFoundException('No team found with that code')

        await this.assertJoinable(team.competitionId, userId)
        await this.assertCapacity(team.competitionId, team.id)

        try {
            await this.prisma.teamMember.create({
                data: { teamId: team.id, userId, competitionId: team.competitionId },
            })
        } catch (error) {
            // The unique on (competitionId, userId) is what actually prevents a double
            // join under concurrency; assertJoinable only gives a nicer message first.
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new ConflictException('You are already in a team for this competition')
            }
            throw error
        }

        return this.findOne(team.id)
    }

    async leave(teamId: string, userId: string) {
        const team = await this.prisma.team.findUnique({
            where: { id: teamId },
            select: { id: true, captainId: true, _count: { select: { members: true } } },
        })

        if (!team) throw new NotFoundException('Team not found')


        if (team.captainId === userId && team._count.members > 1) {
            throw new ForbiddenException(
                'Transfer captaincy to another member before leaving the team'
            )
        }

        const membership = await this.prisma.teamMember.findUnique({
            where: { teamId_userId: { teamId, userId } },
            select: { id: true },
        })

        if (!membership) throw new NotFoundException('You are not a member of this team')

        if (team._count.members === 1) {
            await this.prisma.team.delete({ where: { id: teamId } })
            return { left: true, disbanded: true }
        }

        await this.prisma.teamMember.delete({ where: { id: membership.id } })
        return { left: true, disbanded: false }
    }


    async disband(teamId: string, captainId: string) {
        const team = await this.requireCaptain(teamId, captainId)

        const memberCount = await this.prisma.teamMember.count({ where: { teamId } })


        await this.prisma.team.delete({ where: { id: team.id } })

        return { disbanded: true, membersRemoved: memberCount }
    }

    async removeMember(teamId: string, captainId: string, targetUserId: string) {
        const team = await this.requireCaptain(teamId, captainId)

        if (targetUserId === team.captainId) {
            throw new ForbiddenException('Transfer captaincy before removing yourself')
        }

        const membership = await this.prisma.teamMember.findUnique({
            where: { teamId_userId: { teamId, userId: targetUserId } },
            select: { id: true },
        })

        if (!membership) throw new NotFoundException('That participant is not in this team')

        await this.prisma.teamMember.delete({ where: { id: membership.id } })
        return this.findOne(teamId)
    }

    async transferCaptaincy(teamId: string, captainId: string, targetUserId: string) {
        await this.requireCaptain(teamId, captainId)

        const membership = await this.prisma.teamMember.findUnique({
            where: { teamId_userId: { teamId, userId: targetUserId } },
            select: { id: true },
        })

        if (!membership) {
            throw new BadRequestException('The new captain must already be a member of the team')
        }

        await this.prisma.team.update({
            where: { id: teamId },
            data: { captainId: targetUserId },
        })

        return this.findOne(teamId)
    }

    async findOne(teamId: string) {
        const team = await this.prisma.team.findUnique({
            where: { id: teamId },
            select: TEAM_SELECT,
        })

        if (!team) throw new NotFoundException('Team not found')
        return team
    }

    async listForCompetition(competitionId: string) {
        return this.prisma.team.findMany({
            where: { competitionId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                name: true,
                avatarUrl: true,
                captainId: true,
                _count: { select: { members: true } },
            },
        })
    }

    /// The requesting participant's team for a competition, or null. Used by the UI
    /// to decide between "join a team" and "your team".
    async myTeam(competitionId: string, userId: string) {
        const membership = await this.prisma.teamMember.findUnique({
            where: { competitionId_userId: { competitionId, userId } },
            select: { teamId: true },
        })

        return membership ? this.findOne(membership.teamId) : null
    }

    private async requireCaptain(teamId: string, userId: string) {
        const team = await this.prisma.team.findUnique({
            where: { id: teamId },
            select: { id: true, captainId: true },
        })

        if (!team) throw new NotFoundException('Team not found')


        if (team.captainId !== userId) {
            throw new ForbiddenException('Only the team captain can do that')
        }

        return team
    }

    private async assertJoinable(competitionId: string, userId: string): Promise<void> {
        const competition = await this.prisma.competition.findUnique({
            where: { id: competitionId },
            select: { id: true, state: true },
        })

        if (!competition || competition.state === CompetitionState.DRAFT) {
            throw new NotFoundException('Competition not found')
        }

        if (
            competition.state === CompetitionState.COMPLETED ||
            competition.state === CompetitionState.ARCHIVED
        ) {
            throw new ForbiddenException('This competition has already finished')
        }

        const enrolled = await this.prisma.competitionParticipant.findUnique({
            where: { competitionId_userId: { competitionId, userId } },
            select: { id: true },
        })

        if (!enrolled) {
            throw new ForbiddenException('Join the competition before joining a team')
        }

        const existing = await this.prisma.teamMember.findUnique({
            where: { competitionId_userId: { competitionId, userId } },
            select: { teamId: true },
        })

        if (existing) {
            throw new ConflictException('You are already in a team for this competition')
        }
    }

    private async assertCapacity(competitionId: string, teamId: string): Promise<void> {
        const competition = await this.prisma.competition.findUnique({
            where: { id: competitionId },
            select: { maxTeamSize: true },
        })

        if (!competition?.maxTeamSize) return

        const members = await this.prisma.teamMember.count({ where: { teamId } })

        if (members >= competition.maxTeamSize) {
            throw new ForbiddenException(`This team is full (${competition.maxTeamSize} members)`)
        }
    }

    /// Retries on a code collision rather than pre-checking, which would still race.
    private async withUniqueCode<T>(create: (code: string) => Promise<T>): Promise<T> {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                return await create(generateTeamCode())
            } catch (error) {
                const isCodeCollision =
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === 'P2002' &&
                    (error.meta?.target as string[] | undefined)?.includes('code')

                if (!isCodeCollision) throw error
            }
        }

        throw new ConflictException('Could not allocate a team code. Please try again.')
    }
}
