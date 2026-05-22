#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  pnpm --filter @pic/backend prisma:deploy
fi

exec node packages/backend/dist/main.js
