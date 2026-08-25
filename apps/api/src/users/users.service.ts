import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

// Selecting explicitly rather than excluding: a field added to the model later
// cannot leak by default.
const PROFILE_SELECT = {
  id: true,
  email: true,
  role: true,
  emailVerified: true,
  createdAt: true,
  profile: {
    select: {
      displayName: true,
      bio: true,
      country: true,
      githubUrl: true,
      avatarUrl: true,
    },
  },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    await this.prisma.profile.update({
      where: { userId },
      data: dto,
    });

    return this.findMe(userId);
  }
}
