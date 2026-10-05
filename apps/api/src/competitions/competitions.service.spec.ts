import { ConflictException, NotFoundException } from '@nestjs/common';
import { CompetitionState } from '@prisma/client';
import { CompetitionsService } from './competitions.service';
import type { PrismaService } from '../prisma/prisma.service';

function makePrisma(stored: { id: string; state: CompetitionState } | null) {
  const competition = {
    findUnique: jest.fn().mockResolvedValue(stored),
    delete: jest.fn().mockResolvedValue({}),
  };
  return { prisma: { competition } as unknown as PrismaService, competition };
}

describe('CompetitionsService.remove', () => {
  it('deletes a competition that is still a draft', async () => {
    const { prisma, competition } = makePrisma({ id: 'c1', state: CompetitionState.DRAFT });

    await new CompetitionsService(prisma).remove('c1');

    expect(competition.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('rejects an unknown competition', async () => {
    const { prisma, competition } = makePrisma(null);

    await expect(new CompetitionsService(prisma).remove('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(competition.delete).not.toHaveBeenCalled();
  });

  // The whole point of the restriction: anything past DRAFT may own rounds,
  // submissions and score events, and deleting it would destroy a participant's
  // recorded work with no undo.
  it.each([
    CompetitionState.REGISTRATION,
    CompetitionState.LIVE,
    CompetitionState.COMPLETED,
    CompetitionState.ARCHIVED,
  ])('refuses to delete a competition in %s and suggests archiving', async (state) => {
    const { prisma, competition } = makePrisma({ id: 'c1', state });
    const service = new CompetitionsService(prisma);

    await expect(service.remove('c1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('c1')).rejects.toThrow(/Archive this one instead/);
    expect(competition.delete).not.toHaveBeenCalled();
  });

  // The guard lives in the service, not the controller or the UI, so a direct
  // API call cannot route around a hidden button.
  it('enforces the rule without consulting the caller', async () => {
    const { prisma } = makePrisma({ id: 'c1', state: CompetitionState.LIVE });

    await expect(new CompetitionsService(prisma).remove('c1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
