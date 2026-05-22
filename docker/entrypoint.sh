#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  if [ -f "packages/backend/package.json" ]; then
    pnpm --filter @pic/backend prisma:deploy
  else
    pnpm prisma:deploy
  fi
fi

if [ -f "packages/backend/dist/main.js" ]; then
  exec node packages/backend/dist/main.js
fi

exec node dist/main.js
