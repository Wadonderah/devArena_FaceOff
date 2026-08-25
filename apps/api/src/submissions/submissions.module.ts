import { Module } from '@nestjs/common';
import { RoundsModule } from '../rounds/rounds.module';
import { ScoringModule } from '../scoring/scoring.module';
import { ExecutionModule } from '../execution/execution.module';
import { SubmissionsController } from './submissions.controller';
import { McqService } from './mcq.service';
import { CodeService } from './code.service';

@Module({
  imports: [RoundsModule, ScoringModule, ExecutionModule],
  controllers: [SubmissionsController],
  providers: [McqService, CodeService],
  exports: [McqService, CodeService],
})
export class SubmissionsModule {}
