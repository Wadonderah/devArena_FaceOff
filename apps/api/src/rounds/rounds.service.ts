import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { ChallengeType, Prisma, RoundState, RoundType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { seededShuffle } from '../common/shuffle'
import { canTransition } from './round-state'
import type { CreateRoundDto, SetRoundChallengesDto, UpdateRoundDto } from './dto/round.dto'

const CHALLENGE_TYPE_FOR: Record<RoundType, ChallengeType> = {
    [RoundType.MCQ]: ChallengeType.MCQ,
    [RoundType.CODING]: ChallengeType.CODING,
    [RoundType.DEBUGGING]: ChallengeType.DEBUGGING,
}

@Injectable()
export class RoundsService {
    constructor(private readonly prisma: PrismaService) {}

    async create(competitionId: string, dto: CreateRoundDto) {
        const competition = await this.prisma.competition.findUnique({
            where: { id: competitionId },
            select: { id: true },
        })
        if (!competition) throw new NotFoundException('Competition not found')

        this.assertWindow(dto.startsAt, dto.endsAt)
        await this.assertWeightBudget(competitionId, null, dto.weight)

        return this.prisma.round.create({
            data: {
                competitionId,
                name: dto.name,
                description: dto.description,
                type: dto.type,
                orderIndex: dto.orderIndex,
                weight: new Prisma.Decimal(dto.weight),
                startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
                endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
                allowedLanguages: dto.type === RoundType.MCQ ? [] : (dto.allowedLanguages ?? []),
                revealMode: dto.revealMode,
                participationMode: dto.participationMode,
                attemptLimit: dto.attemptLimit,
                negativeMarking: dto.negativeMarking,
            },
        })
    }

    async update(roundId: string, dto: UpdateRoundDto) {
        const round = await this.requireRound(roundId)
        if (round.state !== RoundState.DRAFT && round.state !== RoundState.SCHEDULED) {
            throw new ForbiddenException('A round can only be edited before it goes live')
        }

        this.assertWindow(
            dto.startsAt ?? round.startsAt?.toISOString(),
            dto.endsAt ?? round.endsAt?.toISOString()
        )

        if (dto.weight !== undefined) {
            await this.assertWeightBudget(round.competitionId, roundId, dto.weight)
        }

        return this.prisma.round.update({
            where: { id: roundId },
            data: {
                name: dto.name,
                description: dto.description,
                weight: dto.weight !== undefined ? new Prisma.Decimal(dto.weight) : undefined,
                startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
                endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
                allowedLanguages:
                    dto.allowedLanguages !== undefined && round.type !== RoundType.MCQ
                        ? dto.allowedLanguages
                        : undefined,
                revealMode: dto.revealMode,
                participationMode: dto.participationMode,
                attemptLimit: dto.attemptLimit,
                negativeMarking: dto.negativeMarking,
            },
        })
    }

    async transition(roundId: string, to: RoundState) {
        const round = await this.requireRound(roundId)

        if (!canTransition(round.state, to)) {
            throw new ConflictException(`A round in ${round.state} cannot move to ${to}`)
        }

        if (to === RoundState.LIVE) {
            const challengeCount = await this.prisma.roundChallenge.count({
                where: { roundId },
            })
            if (challengeCount === 0) {
                throw new BadRequestException(
                    'Add at least one challenge before starting the round'
                )
            }


            // await this.prisma.warm()
        }

        const now = new Date()

        return this.prisma.round.update({
            where: { id: roundId },
            data: {
                state: to,
                startsAt: to === RoundState.LIVE && !round.startsAt ? now : undefined,
                endsAt: to === RoundState.COMPLETED ? now : undefined,
            },
        })
    }

    async setChallenges(roundId: string, dto: SetRoundChallengesDto) {
        const round = await this.requireRound(roundId)

        if (round.state !== RoundState.DRAFT && round.state !== RoundState.SCHEDULED) {
            throw new ForbiddenException('The challenge set is fixed once a round goes live')
        }

        const expectedType = CHALLENGE_TYPE_FOR[round.type]

        const challenges = await this.prisma.challenge.findMany({
            where: { id: { in: dto.challengeIds } },
            select: { id: true, type: true, isPublished: true },
        })

        if (challenges.length !== dto.challengeIds.length) {
            throw new BadRequestException('One or more challenges do not exist')
        }

        const wrongType = challenges.filter((c) => c.type !== expectedType)
        if (wrongType.length > 0) {
            throw new BadRequestException(
                `A ${round.type} round accepts only ${expectedType} challenges`
            )
        }

        const unpublished = challenges.filter((c) => !c.isPublished)
        if (unpublished.length > 0) {
            throw new BadRequestException(
                'Every challenge must be published before it is used in a round'
            )
        }

        await this.prisma.$transaction([
            this.prisma.roundChallenge.deleteMany({ where: { roundId } }),
            this.prisma.roundChallenge.createMany({
                data: dto.challengeIds.map((challengeId, orderIndex) => ({
                    roundId,
                    challengeId,
                    orderIndex,
                })),
            }),
        ])

        return { roundId, challengeCount: dto.challengeIds.length }
    }

    async findOneForOrganizer(roundId: string) {
        const round = await this.prisma.round.findUnique({
            where: { id: roundId },
            include: {
                challenges: {
                    orderBy: { orderIndex: 'asc' },
                    include: {
                        challenge: {
                            select: {
                                id: true,
                                title: true,
                                type: true,
                                category: true,
                                difficulty: true,
                                points: true,
                                version: true,
                            },
                        },
                    },
                },
            },
        })

        if (!round) throw new NotFoundException('Round not found')
        return round
    }


    async findOneForParticipant(roundId: string, userId: string) {
        const round = await this.prisma.round.findFirst({
            where: { id: roundId, state: { not: RoundState.DRAFT } },
            select: {
                id: true,
                competitionId: true,
                name: true,
                description: true,
                type: true,
                state: true,
                startsAt: true,
                endsAt: true,
                allowedLanguages: true,
                attemptLimit: true,
                negativeMarking: true,
                _count: { select: { challenges: true } },
            },
        })

        if (!round) throw new NotFoundException('Round not found')

        const enrolled = await this.prisma.competitionParticipant.findUnique({
            where: {
                competitionId_userId: { competitionId: round.competitionId, userId },
            },
            select: { id: true },
        })

        return { ...round, enrolled: enrolled !== null }
    }

    /// The ordered challenge ids in a round, without any challenge content. A
    /// participant needs this to know what to fetch; the content itself still goes
    /// through the per-challenge authorization in ChallengesService.
    async challengeIdsForParticipant(roundId: string, userId: string) {
        const round = await this.requireLiveRound(roundId)

        const enrolled = await this.prisma.competitionParticipant.findUnique({
            where: {
                competitionId_userId: { competitionId: round.competitionId, userId },
            },
            select: { id: true },
        })

        if (!enrolled) {
            throw new ForbiddenException('Join the competition to view its challenges')
        }

        const links = await this.prisma.roundChallenge.findMany({
            where: { roundId },
            orderBy: { orderIndex: 'asc' },
            select: { challengeId: true },
        })

        // Per-participant question order, seeded so a refresh does not reshuffle
        // mid-round. Combined with the per-participant option order already in
        // ChallengesService, two people sitting together share neither a question
        // number nor an option letter — so "number 4 is B" carries no information.
        const ordered = seededShuffle(
            links.map((l) => l.challengeId),
            `${userId}:${roundId}`
        )

        return { challengeIds: ordered }
    }

    async requireLiveRound(roundId: string) {
        const round = await this.prisma.round.findUnique({
            where: { id: roundId },
            select: {
                id: true,
                competitionId: true,
                type: true,
                state: true,
                startsAt: true,
                endsAt: true,
                weight: true,
                allowedLanguages: true,
                revealMode: true,
                participationMode: true,
                negativeMarking: true,
                attemptLimit: true,
            },
        })

        if (!round) throw new NotFoundException('Round not found')

        if (round.state === RoundState.PAUSED) {
            throw new ForbiddenException(
                'This round is paused. Hold on — the organizer will resume it shortly.'
            )
        }

        if (round.state !== RoundState.LIVE) {
            throw new ForbiddenException('This round is not currently accepting entries')
        }

        const now = new Date()

        if (round.startsAt && now < round.startsAt) {
            throw new ForbiddenException('This round has not started yet')
        }

        if (round.endsAt && now > round.endsAt) {
            throw new ForbiddenException('This round has closed')
        }

        return round
    }

    private async requireRound(roundId: string) {
        const round = await this.prisma.round.findUnique({ where: { id: roundId } })
        if (!round) throw new NotFoundException('Round not found')
        return round
    }

    private assertWindow(startsAt?: string | null, endsAt?: string | null): void {
        if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
            throw new BadRequestException('A round must end after it starts')
        }
    }

    /// Round weights are fractions of the final score, so they cannot sum past 1.
    private async assertWeightBudget(
        competitionId: string,
        excludeRoundId: string | null,
        weight: number
    ): Promise<void> {
        const siblings = await this.prisma.round.findMany({
            where: {
                competitionId,
                ...(excludeRoundId ? { id: { not: excludeRoundId } } : {}),
            },
            select: { weight: true },
        })

        const total = siblings.reduce((sum, r) => sum + r.weight.toNumber(), weight)

        if (total > 1.0001) {
            throw new BadRequestException(
                `Round weights would total ${total.toFixed(4)}; they cannot exceed 1`
            )
        }
    }
}
