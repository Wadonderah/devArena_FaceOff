import { ConflictException, NotFoundException } from '@nestjs/common';
import { RoundState } from '@prisma/client';
import { RoundsService } from './rounds.service';
import type { PrismaService } from '../prisma/prisma.service';

function makePrisma(stored: { id: string; state: RoundState } | null) {
  const round = {
    findUnique: jest.fn().mockResolvedValue(stored),
    delete: jest.fn().mockResolvedValue({}),
  };
  return { prisma: { round } as unknown as PrismaService, round };
}

describe('RoundsService.remove', () => {
  // These two cannot have accepted a submission, so nothing a participant
  // produced is destroyed.
  it.each([RoundState.DRAFT, RoundState.SCHEDULED])('deletes a round in %s', async (state) => {
    const { prisma, round } = makePrisma({ id: 'r1', state });

    await new RoundsService(prisma).remove('r1');

    expect(round.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('rejects an unknown round', async () => {
    const { prisma, round } = makePrisma(null);

    await expect(new RoundsService(prisma).remove('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(round.delete).not.toHaveBeenCalled();
  });

  // From LIVE onward a round may own submissions, MCQ attempts and score
  // events, all of which cascade. Deleting one would silently take a
  // participant's recorded work and their standing with it.
  it.each([
    RoundState.LIVE,
    RoundState.PAUSED,
    RoundState.COMPLETED,
    RoundState.FINALIZED,
    RoundState.ARCHIVED,
  ])('refuses to delete a round in %s and suggests archiving', async (state) => {
    const { prisma, round } = makePrisma({ id: 'r1', state });
    const service = new RoundsService(prisma);

    await expect(service.remove('r1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('r1')).rejects.toThrow(/Archive it instead/);
    expect(round.delete).not.toHaveBeenCalled();
  });
});
