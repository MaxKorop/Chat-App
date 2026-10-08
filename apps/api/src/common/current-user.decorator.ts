import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** What the JWT guard puts on the request: taken from the verified token, never from the client. */
export type AuthUser = { id: string; username: string };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => context.switchToHttp().getRequest().user,
);
