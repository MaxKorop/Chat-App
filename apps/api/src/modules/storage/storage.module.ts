import { Global, Module } from '@nestjs/common';

import { env } from '../../config/env';
import { STORAGE_CONFIG, storageConfigFromEnv } from './storage.config';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [
    { provide: STORAGE_CONFIG, useFactory: () => storageConfigFromEnv(env) },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
