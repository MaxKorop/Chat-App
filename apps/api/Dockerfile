# Build the whole workspace, then ship only what the api needs at runtime.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
# prisma.config.ts requires DATABASE_URL even for `prisma generate`; a dummy value is enough at build time
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY . .
RUN pnpm install --frozen-lockfile
# builds @chat/shared first, then the api (the postinstall step already generated the Prisma client)
RUN pnpm --filter "@chat/api..." build
# a self-contained folder: dist, prisma/ (migrations), prisma.config.ts and production dependencies only
RUN pnpm --filter @chat/api deploy --prod /out

FROM node:24-alpine
# the Prisma migration engine needs OpenSSL
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out .
USER node
EXPOSE 3000
# migrations run on every start; they are idempotent, and a failed one stops the container
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
