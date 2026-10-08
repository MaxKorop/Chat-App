import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * The stock ThrottlerGuard only understands HTTP, but global guards also run for WebSocket
 * handlers. Sockets get their own limiter (see the realtime gateway).
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  override canActivate(context: ExecutionContext): Promise<boolean> {
    return context.getType() === 'http' ? super.canActivate(context) : Promise.resolve(true);
  }
}
