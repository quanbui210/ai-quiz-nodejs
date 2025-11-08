# Changelog

All notable changes to this project are documented in this file.

## [Unreleased] - 2025-11-08

### Added

#### Authentication System
- **Google OAuth Integration**
  - Configured Google OAuth provider in `supabase/config.toml`
  - Created authentication module with Google login support
  - Added auth routes: `/api/auth/google`, `/api/auth/callback`, `/api/auth/session`, `/api/auth/me`, `/api/auth/signout`
  - Created `src/modules/auth/auth.controller.ts` - Authentication controller with Google OAuth handlers
  - Created `src/modules/auth/auth.routes.ts` - Express routes for authentication endpoints
  - Created `src/utils/supabase.ts` - Supabase client utility for authentication

#### Configuration
- **Environment Configuration**
  - Created `.env` file with:
    - `DATABASE_URL` - PostgreSQL connection string
    - `SUPABASE_URL` - Local Supabase API URL
    - `SUPABASE_ANON_KEY` - Supabase anonymous key
    - `SUPABASE_SECRET_KEY` - Supabase secret key
    - `GOOGLE_CLIENT_ID` - Google OAuth client ID (placeholder)
    - `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (placeholder)
    - `PORT` - Server port (default: 3000)
    - `NODE_ENV` - Environment mode

#### Documentation
- Created `LOCAL_GOOGLE_OAUTH_SETUP.md` - Step-by-step guide for getting Google OAuth credentials for local development
- Created `CHANGELOG.md` - This file documenting all project changes

### Changed

#### Supabase Configuration
- **Port Configuration** (`supabase/config.toml`)
  - Changed API port from `54321` to `55321` to avoid conflicts
  - Changed database port from `54322` to `55322` to avoid conflicts
  - Changed Studio port from `54323` to `55323`
  - Changed Inbucket port from `54324` to `55324`
  - Changed Analytics port from `54327` to `55327`
  - Changed Pooler port from `54329` to `55329`
  - Changed shadow database port from `54320` to `55320`
  - **Reason**: Port 54322 was already allocated, causing Docker container startup failures

- **Google OAuth Configuration** (`supabase/config.toml`)
  - Added `[auth.external.google]` section
  - Enabled Google OAuth provider
  - Configured redirect URI: `http://127.0.0.1:55321/auth/v1/callback`
  - Set `skip_nonce_check = true` (required for local development)
  - Configured environment variable references for credentials

#### TypeScript Configuration
- **Created `tsconfig.json`**
  - Configured TypeScript compiler options for Node.js
  - Set module system to `commonjs`
  - Configured module resolution to `node`
  - Set target to `ES2020`
  - Enabled strict type checking
  - Configured output directory: `./dist`
  - Configured source directory: `./src`
  - Added `ts-node` configuration for development
  - **Reason**: Missing TypeScript configuration was causing compilation errors

#### Prisma Schema
- **Fixed Relation Fields** (`src/prisma/schema.prisma`)
  - Added `answers Answer[]` relation to `User` model
  - Added `progress Progress[]` relation to `Topic` model
  - **Reason**: Missing opposite relation fields were causing Prisma validation errors

#### Package Configuration
- **Updated `package.json`**
  - Fixed `start` script: Changed from `nodemon src/app.ts` to `nodemon --exec ts-node src/app.ts`
  - Added `ts-node-dev` to devDependencies
  - **Reason**: Node.js cannot run TypeScript files directly; needs transpiler

#### Express Application
- **Updated `src/app.ts`**
  - Added `dotenv` import and configuration
  - Added authentication routes integration
  - Added `express.urlencoded` middleware
  - Enhanced root endpoint with API documentation
  - Added startup logging with Supabase URL information
  - **Reason**: Integration of authentication system and better developer experience

### Fixed

#### Development Server
- **Fixed nodemon TypeScript execution**
  - Issue: `nodemon src/app.ts` was failing with "Unknown file extension .ts"
  - Solution: Updated to `nodemon --exec ts-node src/app.ts`
  - **Files**: `package.json`

#### TypeScript Compilation
- **Fixed module resolution errors**
  - Issue: `error TS5109: Option 'moduleResolution' must be set to 'NodeNext'`
  - Solution: Created proper `tsconfig.json` with correct module resolution
  - **Files**: `tsconfig.json` (new file)

#### Prisma Client Generation
- **Fixed missing environment variables**
  - Issue: `PrismaConfigEnvError: Missing required environment variable: DATABASE_URL`
  - Solution: Created `.env` file with required variables
  - **Files**: `.env` (new file)

- **Fixed Prisma schema validation errors**
  - Issue: Missing opposite relation fields in User and Topic models
  - Solution: Added missing relation fields
  - **Files**: `src/prisma/schema.prisma`

#### Supabase Services
- **Fixed port conflicts**
  - Issue: Docker container failed to start due to port 54322 being already allocated
  - Solution: Changed all Supabase ports from 54xxx to 55xxx range
  - **Files**: `supabase/config.toml`

#### Code Quality
- **Fixed TypeScript linting errors**
  - Issue: "Not all code paths return a value" warnings
  - Solution: Added explicit `return` statements to all response handlers
  - **Files**: `src/modules/auth/auth.controller.ts`

### Technical Details

#### Files Created
1. `tsconfig.json` - TypeScript configuration
2. `.env` - Environment variables (gitignored)
3. `src/utils/supabase.ts` - Supabase client utility
4. `src/modules/auth/auth.controller.ts` - Authentication controller
5. `src/modules/auth/auth.routes.ts` - Authentication routes
6. `GOOGLE_AUTH_SETUP.md` - Google OAuth setup guide
7. `CHANGELOG.md` - This changelog file

#### Files Modified
1. `package.json` - Fixed scripts, added dependencies
2. `supabase/config.toml` - Port changes, Google OAuth configuration
3. `src/prisma/schema.prisma` - Fixed relation fields
4. `src/app.ts` - Integrated authentication, added middleware

#### Dependencies Added
- `ts-node-dev@^2.0.0` - Development dependency for TypeScript hot reload

#### Database Changes
- All Prisma models synced to database via `prisma db push`
- Tables created: User, Topic, Quiz, Question, Answer, Explanation, Progress, Suggestion

### Migration Notes

#### Breaking Changes
- **Port Changes**: All Supabase service ports changed from 54xxx to 55xxx range
  - Update any hardcoded URLs or connection strings
  - Update `.env` file with new ports

#### Upgrade Instructions
1. Stop Supabase: `npx supabase stop`
2. Pull latest changes
3. Update `.env` file with new port configurations
4. Start Supabase: `npx supabase start`
5. Install dependencies: `npm install`
6. Generate Prisma client: `npm run prisma:generate`
7. Start development server: `npm run dev`

### Known Issues
- None at this time

### Future Improvements
- [ ] Add authentication middleware for protected routes
- [ ] Implement JWT token refresh mechanism
- [ ] Add rate limiting for authentication endpoints
- [ ] Add request validation middleware
- [ ] Implement user profile management endpoints
- [ ] Add email/password authentication endpoints
- [ ] Add magic link authentication
- [ ] Add OTP (One-Time Password) authentication

---

## Notes

### Google Cloud Project Setup
**Question**: Do I need to create a separate Google Cloud project? Do I need Supabase Cloud?

**Answer**: 
- **For local development**: You do NOT need Supabase Cloud at all! Everything works locally.
- **You ONLY need**: Google Cloud Console (free) to get OAuth credentials
- **Steps**:
  1. Go to [Google Cloud Console](https://console.cloud.google.com/)
  2. Create a new project (or select existing)
  3. Configure OAuth consent screen (External, add test users)
  4. Create OAuth 2.0 Client ID (Web application)
  5. Add authorized redirect URI: `http://127.0.0.1:55321/auth/v1/callback`
  6. Copy Client ID and Secret to `.env` file
  7. Restart Supabase: `npx supabase stop && npx supabase start`
  
**See `LOCAL_GOOGLE_OAUTH_SETUP.md` for detailed step-by-step instructions.**

### Port Configuration Rationale
All Supabase ports were moved from 54xxx to 55xxx range to avoid conflicts with other services that might be using the default PostgreSQL port range.

### Authentication Flow
1. Client requests `/api/auth/google`
2. Server returns Google OAuth URL
3. User redirects to Google for authentication
4. Google redirects back to `/api/auth/callback` with authorization code
5. Server exchanges code for session token
6. User is authenticated

---

*This changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.*

