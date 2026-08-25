import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { ScoringModule } from '../scoring/scoring.module';
import { EXECUTION_QUEUE } from './execution.constants';
import { ExecutionProcessor } from './execution.processor';
import { ExecutionQueue } from './execution.queue';
import { Judge0Client } from './judge0.client';

@Module({
  imports: [
    ScoringModule,
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: { url: config.get('REDIS_URL') },
      }),
    }),
    BullModule.registerQueue({ name: EXECUTION_QUEUE }),
  ],
  providers: [Judge0Client, ExecutionQueue, ExecutionProcessor],
  exports: [Judge0Client, ExecutionQueue],
})
export class ExecutionModule {}
