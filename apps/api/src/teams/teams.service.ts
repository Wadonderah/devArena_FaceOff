import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common'
import { CompetitionState, Prisma, TeamJoinRequestStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import {
    teamJoinRequested,
    teamJoined,
    teamRequestApproved,
    teamRequestDeclined,
} from '../notifications/notification-templates'
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
    private readonly logger = new Logger(TeamsService.name)

    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationsService
    ) {}

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
            select: { id: true, competitionId: true, name: true, captainId: true },
        })

        if (!team) throw new NotFoundException('No team found with that code')

        await this.addMember(team, userId)
        await this.settleJoin(team, userId)

        return this.findOne(team.id, userId)
    }

    /// The only way anyone becomes a team member. Shared by `joinByCode` and by
    /// an approved request, so the two doors cannot drift apart.
    private async addMember(
        team: { id: string; competitionId: string; name: string; captainId: string },
        userId: string
    ): Promise<void> {
        this.assertCanJoin(
            await this.loadJoinContext(team.competitionId, userId, team.id),
            true
        )

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

    }

    /// Side effects of a join, run together. Only reached once the membership
    /// row exists, so the captain is never told about a rejected join.
    private async settleJoin(
        team: { id: string; competitionId: string; name: string; captainId: string },
        userId: string
    ): Promise<void> {
        await Promise.all([
            // Their requests to other teams in this competition can no longer
            // succeed, so captains are not left answering them.
            this.prisma.teamJoinRequest.updateMany({
                where: {
                    competitionId: team.competitionId,
                    userId,
                    status: TeamJoinRequestStatus.PENDING,
                    teamId: { not: team.id },
                },
                data: { status: TeamJoinRequestStatus.WITHDRAWN, respondedAt: new Date() },
            }),
            this.notifyCaptainOfJoin(team, userId),
        ])
    }

    /// Tells the captain that someone joined.
    ///
    /// Joining by code is the one team change that happens without the captain
    /// doing anything, so it is the one they would otherwise only discover by
    /// reloading the team page.
    private async notifyCaptainOfJoin(
        team: { id: string; name: string; captainId: string },
        userId: string
    ): Promise<void> {
        // The captain joining their own team is not news. Unreachable through
        // this path today, since a captain is already a member, but the guard
        // costs nothing and the alternative is a confusing row if that changes.
        if (team.captainId === userId) return

        // Wrapped, lookup included. The join itself has already committed; a
        // failure to look up a display name must not turn a successful join
        // into an error response, which would leave the participant believing
        // they are not on the team they just joined.
        try {
            const profile = await this.prisma.profile.findUnique({
                where: { userId },
                select: { displayName: true },
            })

            // Falls back to a generic phrase rather than the email address. A
            // profile is optional, and the team payload deliberately does not
            // carry member emails, so putting one in a notification would leak
            // more than the page it links to shows.
            const label = profile?.displayName ?? 'A new member'

            await this.notifications.notifyUser(
                team.captainId,
                teamJoined(team, { id: userId, label })
            )
        } catch (error) {
            this.logger.error(
                `${userId} joined team ${team.id} but the captain was not notified: ${
                    (error as Error).message
                }`
            )
        }
    }

    async leave(teamId: string, userId: string) {
        const team = await this.prisma.team.findUnique({
            where: { id: teamId },
            select: { id: true, captainId: true, _count: { select: { members: true } } },
        })

        if (!team) throw new NotFoundException('Team not found')

        await this.assertMembershipMutable(teamId)


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
        await this.assertMembershipMutable(teamId)

        const memberCount = await this.prisma.teamMember.count({ where: { teamId } })


        await this.prisma.team.delete({ where: { id: team.id } })

        return { disbanded: true, membersRemoved: memberCount }
    }

    async removeMember(teamId: string, captainId: string, targetUserId: string) {
        const team = await this.requireCaptain(teamId, captainId)
        await this.assertMembershipMutable(teamId)

        if (targetUserId === team.captainId) {
            throw new ForbiddenException('Transfer captaincy before removing yourself')
        }

        const membership = await this.prisma.teamMember.findUnique({
            where: { teamId_userId: { teamId, userId: targetUserId } },
            select: { id: true },
        })

        if (!membership) throw new NotFoundException('That participant is not in this team')

        await this.prisma.teamMember.delete({ where: { id: membership.id } })
        return this.findOne(teamId, captainId)
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

        return this.findOne(teamId, captainId)
    }

    /// A team as seen by `viewerId`.
    ///
    /// The join code is a bearer credential: anyone holding it can join. It used
    /// to be returned to every authenticated caller, and team ids are listable,
    /// so a rival could read any team's code and fill a capped team with their
    /// own people. Members (and staff, who reach this through other paths) still
    /// see it; everyone else gets the team without it.
    async findOne(teamId: string, viewerId: string) {
        const team = await this.prisma.team.findUnique({
            where: { id: teamId },
            select: TEAM_SELECT,
        })

        if (!team) throw new NotFoundException('Team not found')

        const isMember = team.members.some((m) => m.userId === viewerId)
        if (isMember) return team

        // Omit the key rather than null it, so a client cannot tell "no code"
        // from "code withheld" — and cannot accidentally render an empty badge.
        const { code: _withheld, ...withoutCode } = team
        void _withheld
        return withoutCode
    }

    /// Teams in a competition, with this viewer's own request state. Never
    /// includes the join code — it is a bearer credential.
    async listForCompetition(competitionId: string, viewerId: string) {
        const teams = await this.prisma.team.findMany({
            where: { competitionId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                name: true,
                avatarUrl: true,
                captainId: true,
                captain: { select: { profile: { select: { displayName: true } } } },
                _count: { select: { members: true } },
            },
        })

        const pending = await this.prisma.teamJoinRequest.findMany({
            where: {
                competitionId,
                userId: viewerId,
                status: TeamJoinRequestStatus.PENDING,
            },
            select: { teamId: true },
        })

        const requested = new Set(pending.map((r) => r.teamId))

        return teams.map(({ captain, ...team }) => ({
            ...team,
            captainName: captain?.profile?.displayName ?? null,
            pendingRequest: requested.has(team.id),
        }))
    }

    /// Every team this participant belongs to, most relevant first, so a caller
    /// never has to guess which competition to ask about.
    async myTeams(userId: string) {
        const memberships = await this.prisma.teamMember.findMany({
            where: {
                userId,
                team: { competition: { state: { not: CompetitionState.ARCHIVED } } },
            },
            orderBy: { joinedAt: 'desc' },
            select: {
                team: {
                    select: {
                        id: true,
                        name: true,
                        avatarUrl: true,
                        competitionId: true,
                        competition: { select: { name: true, state: true } },
                    },
                },
            },
        })

        const rank: Partial<Record<CompetitionState, number>> = {
            [CompetitionState.LIVE]: 0,
            [CompetitionState.REGISTRATION]: 1,
        }

        return memberships
            .map(({ team }) => ({
                id: team.id,
                name: team.name,
                avatarUrl: team.avatarUrl,
                competitionId: team.competitionId,
                competitionName: team.competition.name,
                competitionState: team.competition.state,
            }))
            .sort((a, b) => (rank[a.competitionState] ?? 9) - (rank[b.competitionState] ?? 9))
    }

    /// The requesting participant's team for a competition, or null. Used by the UI
    /// to decide between "join a team" and "your team".
    async myTeam(competitionId: string, userId: string) {
        const membership = await this.prisma.teamMember.findUnique({
            where: { competitionId_userId: { competitionId, userId } },
            select: { teamId: true },
        })

        return membership ? this.findOne(membership.teamId, userId) : null
    }

    // ── Join requests ───────────────────────────────────────────────────────

    /// Runs the same checks as joining, so a request that could never be
    /// approved is refused at the point of asking.
    async requestToJoin(teamId: string, userId: string, message?: string) {
        const team = await this.prisma.team.findUnique({
            where: { id: teamId },
            select: { id: true, competitionId: true, name: true, captainId: true },
        })

        if (!team) throw new NotFoundException('Team not found')

        const [context, existing] = await Promise.all([
            this.loadJoinContext(team.competitionId, userId, team.id),
            this.prisma.teamJoinRequest.findUnique({
                where: { teamId_userId: { teamId, userId } },
                select: { status: true },
            }),
        ])

        this.assertCanJoin(context, true)

        if (existing?.status === TeamJoinRequestStatus.PENDING) {
            throw new ConflictException('You have already asked to join this team')
        }

        // Upsert rather than insert: the unique is on (teamId, userId), so
        // asking again after a decline moves that row back to PENDING.
        const request = await this.prisma.teamJoinRequest.upsert({
            where: { teamId_userId: { teamId, userId } },
            create: {
                teamId,
                userId,
                competitionId: team.competitionId,
                message: message?.trim() || null,
            },
            update: {
                status: TeamJoinRequestStatus.PENDING,
                message: message?.trim() || null,
                createdAt: new Date(),
                respondedAt: null,
                respondedById: null,
            },
            select: { id: true, status: true, createdAt: true },
        })

        await this.notifyCaptainOfRequest(team, userId)

        return request
    }

    /// Take back your own request. Only PENDING ones, and only your own.
    async withdrawRequest(teamId: string, userId: string) {
        const { count } = await this.prisma.teamJoinRequest.updateMany({
            where: { teamId, userId, status: TeamJoinRequestStatus.PENDING },
            data: { status: TeamJoinRequestStatus.WITHDRAWN, respondedAt: new Date() },
        })

        if (count === 0) throw new NotFoundException('No pending request to withdraw')

        return { withdrawn: true }
    }

    /// Pending requests for a team. Captain only.
    async listRequests(teamId: string, captainId: string) {
        await this.requireCaptain(teamId, captainId)

        return this.prisma.teamJoinRequest.findMany({
            where: { teamId, status: TeamJoinRequestStatus.PENDING },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                createdAt: true,
                message: true,
                user: {
                    select: {
                        id: true,
                        profile: { select: { displayName: true, avatarUrl: true, country: true } },
                    },
                },
            },
        })
    }

    /// Checks run at approval, not at request time: a team can fill up or the
    /// requester can join elsewhere in between.
    async approveRequest(requestId: string, captainId: string) {
        const request = await this.requireAnswerableRequest(requestId, captainId)

        await this.addMember(request.team, request.userId)

        // Independent of each other, so one round trip instead of four.
        await Promise.all([
            this.prisma.teamJoinRequest.update({
                where: { id: requestId },
                data: {
                    status: TeamJoinRequestStatus.APPROVED,
                    respondedAt: new Date(),
                    respondedById: captainId,
                },
            }),
            this.settleJoin(request.team, request.userId),
            this.notifyRequester(request.userId, request.team, true),
        ])

        // Not the full team: the caller refetches it anyway.
        return { approved: true, teamId: request.team.id, userId: request.userId }
    }

    async declineRequest(requestId: string, captainId: string) {
        const request = await this.requireAnswerableRequest(requestId, captainId)

        // Guarded on PENDING so two captains — or a double-click — cannot both
        // answer the same request.
        const { count } = await this.prisma.teamJoinRequest.updateMany({
            where: { id: requestId, status: TeamJoinRequestStatus.PENDING },
            data: {
                status: TeamJoinRequestStatus.DECLINED,
                respondedAt: new Date(),
                respondedById: captainId,
            },
        })

        if (count === 0) throw new ConflictException('That request has already been answered')

        await this.notifyRequester(request.userId, request.team, false)

        return { declined: true, userId: request.userId }
    }

    /// Captaincy is checked against the request's OWN team, so captaining one
    /// team is not authority over another's requests.
    private async requireAnswerableRequest(requestId: string, captainId: string) {
        const request = await this.prisma.teamJoinRequest.findUnique({
            where: { id: requestId },
            select: {
                id: true,
                userId: true,
                status: true,
                team: {
                    select: { id: true, competitionId: true, name: true, captainId: true },
                },
            },
        })

        // 404 rather than 403 for someone else's request: a 403 would confirm
        // the id exists.
        if (!request || request.team.captainId !== captainId) {
            throw new NotFoundException('Join request not found')
        }

        if (request.status !== TeamJoinRequestStatus.PENDING) {
            throw new ConflictException('That request has already been answered')
        }

        return request
    }

    private async notifyCaptainOfRequest(
        team: { id: string; name: string; captainId: string },
        userId: string
    ): Promise<void> {
        try {
            const profile = await this.prisma.profile.findUnique({
                where: { userId },
                select: { displayName: true },
            })

            await this.notifications.notifyUser(
                team.captainId,
                teamJoinRequested(team, { id: userId, label: profile?.displayName ?? 'Someone' })
            )
        } catch (error) {
            this.logger.error(
                `${userId} asked to join team ${team.id} but the captain was not notified: ${
                    (error as Error).message
                }`
            )
        }
    }

    private async notifyRequester(
        userId: string,
        team: { id: string; name: string; competitionId: string },
        approved: boolean
    ): Promise<void> {
        try {
            await this.notifications.notifyUser(
                userId,
                approved ? teamRequestApproved(team) : teamRequestDeclined(team)
            )
        } catch (error) {
            this.logger.error(
                `Request for team ${team.id} was answered but ${userId} was not notified: ${
                    (error as Error).message
                }`
            )
        }
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

    /// Leaving, disbanding and removing are refused once the competition is live.
    ///
    /// Deleting a team sets `ScoreEvent.teamId` to null, so a disband mid-round
    /// silently erases the team from the standings — points the members earned
    /// together simply vanish from the team board. Joining is still allowed (a
    /// latecomer does no harm), and captaincy can still be transferred, which is
    /// what an organizer needs when a captain goes missing mid-event.
    private async assertMembershipMutable(teamId: string): Promise<void> {
        const team = await this.prisma.team.findUnique({
            where: { id: teamId },
            select: { competition: { select: { state: true } } },
        })

        if (team?.competition.state === CompetitionState.LIVE) {
            throw new ForbiddenException(
                'Team membership is locked while the competition is live'
            )
        }
    }

    /// Everything the join rules need, in one round trip. Read in parallel and
    /// asserted in memory — the database is ~370ms away, so five sequential
    /// queries here was most of the wait on every join.
    private async loadJoinContext(competitionId: string, userId: string, teamId?: string) {
        const [competition, enrolled, existing, memberCount] = await Promise.all([
            this.prisma.competition.findUnique({
                where: { id: competitionId },
                select: { id: true, state: true, maxTeamSize: true },
            }),
            this.prisma.competitionParticipant.findUnique({
                where: { competitionId_userId: { competitionId, userId } },
                select: { id: true },
            }),
            this.prisma.teamMember.findUnique({
                where: { competitionId_userId: { competitionId, userId } },
                select: { teamId: true },
            }),
            teamId ? this.prisma.teamMember.count({ where: { teamId } }) : Promise.resolve(0),
        ])

        return { competition, enrolled: Boolean(enrolled), existing, memberCount }
    }

    /// Pure, so the checks keep one readable order however the data was read.
    private assertCanJoin(
        ctx: Awaited<ReturnType<TeamsService['loadJoinContext']>>,
        checkCapacity: boolean
    ): void {
        const { competition } = ctx

        if (!competition || competition.state === CompetitionState.DRAFT) {
            throw new NotFoundException('Competition not found')
        }

        if (
            competition.state === CompetitionState.COMPLETED ||
            competition.state === CompetitionState.ARCHIVED
        ) {
            throw new ForbiddenException('This competition has already finished')
        }

        if (!ctx.enrolled) {
            throw new ForbiddenException('Join the competition before joining a team')
        }

        if (ctx.existing) {
            throw new ConflictException('You are already in a team for this competition')
        }

        if (checkCapacity && competition.maxTeamSize && ctx.memberCount >= competition.maxTeamSize) {
            throw new ForbiddenException(`This team is full (${competition.maxTeamSize} members)`)
        }
    }

    private async assertJoinable(competitionId: string, userId: string): Promise<void> {
        this.assertCanJoin(await this.loadJoinContext(competitionId, userId), false)
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
