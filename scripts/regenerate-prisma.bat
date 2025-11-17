@echo off
REM Script to regenerate Prisma Client for Windows
REM This should be run before building for deployment

echo Regenerating Prisma Client...
call npx prisma generate --schema=./src/prisma/schema.prisma

if %ERRORLEVEL% EQU 0 (
  echo ✅ Prisma Client regenerated successfully
) else (
  echo ❌ Failed to regenerate Prisma Client
  exit /b 1
)

