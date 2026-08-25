import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { validateEnv } from './env.validation';
import { AppConfigService } from './config.service';

// Resolves to apps/api/.env from both src/config and dist/config, so the app
// loads the same file whether run via nest start or from the built output.
const envFilePath = join(__dirname, '..', '..', '.env');

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath,
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
