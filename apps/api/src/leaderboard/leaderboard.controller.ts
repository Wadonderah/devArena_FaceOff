import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  // Deliberately generous. The frontend polls every 3s, which is 20 requests a
  // minute; throttling the primary live-experience endpoint at the default would
  // break the product rather than protect it.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':competitionId')
  forCompetition(@Param('competitionId', ParseUUIDPipe) competitionId: string) {
    return this.leaderboard.forCompetition(competitionId);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':competitionId/teams')
  teams(@Param('competitionId', ParseUUIDPipe) competitionId: string) {
    return this.leaderboard.teamsForCompetition(competitionId);
  }
}
