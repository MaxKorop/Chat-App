import { Global, Module } from '@nestjs/common';

import { GRACE_MS, PRESENCE_GRACE_MS, PresenceService } from './presence.service';

@Global()
@Module({
  providers: [{ provide: PRESENCE_GRACE_MS, useValue: GRACE_MS }, PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
