#!/bin/bash
# Script to regenerate Prisma Client
# This should be run before building for deployment

echo "Regenerating Prisma Client..."
npx prisma generate --schema=./src/prisma/schema.prisma

if [ $? -eq 0 ]; then
  echo "✅ Prisma Client regenerated successfully"
else
  echo "❌ Failed to regenerate Prisma Client"
  exit 1
fi

