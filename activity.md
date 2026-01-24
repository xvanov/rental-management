# AI Rental Ops Platform - Activity Log

## Current Status
**Last Updated:** 2026-01-23
**Tasks Completed:** 2
**Current Task:** Task 2 complete - Set up Prisma with PostgreSQL and define core schema

---

## Session Log

<!--
The Ralph Wiggum loop will append dated entries here.
Each entry should include:
- Date and time
- Task worked on
- Changes made
- Commands run
- Screenshot filename (if applicable)
- Any issues and resolutions
-->

### 2026-01-23 - Task 1: Initialize Next.js 15 project with TypeScript, Tailwind CSS, and Shadcn/ui

**Changes Made:**
- Created Next.js 15.5.9 project manually (create-next-app couldn't run due to existing files in directory)
- Configured TypeScript with strict mode and path aliases (@/*)
- Set up Tailwind CSS v4 with PostCSS
- Initialized Shadcn/ui with New York style, neutral base color, CSS variables
- Created src/app directory structure with layout.tsx, page.tsx, globals.css
- Created src/lib/utils.ts (cn utility from Shadcn)
- Created src/components directory
- Added Shadcn Button component to verify integration
- Configured ESLint with Next.js rules (flat config)
- Removed --turbopack flag from dev script due to temp file write errors in this environment

**Commands Run:**
- `npm install` - installed all dependencies
- `npx shadcn@latest init -d` - initialized Shadcn/ui
- `npx shadcn@latest add button -y` - added Button component
- `npm run lint` - passed with no warnings or errors
- `npx tsc --noEmit` - passed type checking
- `npm run build` - successful production build
- `npx next dev -p 3001` - dev server started successfully
- `agent-browser open http://localhost:3001` - verified page renders

**Browser Verification:**
- Page renders with heading "AI Rental Ops Platform" and description text
- No console errors in production build
- Snapshot confirmed correct DOM structure

**Issues & Resolutions:**
- `create-next-app` failed due to existing .cache/.claude directories - resolved by manually creating project structure
- Turbopack dev server had ENOENT errors for _buildManifest.js.tmp files - resolved by removing --turbopack flag from dev script
- `agent-browser screenshot` command has a validation error bug - used snapshot instead for verification

### 2026-01-23 - Task 2: Set up Prisma with PostgreSQL and define core schema

**Changes Made:**
- Installed Prisma 6 (CLI + client) - latest v7 requires Node 20+, v6 matches PRD spec
- Initialized Prisma with PostgreSQL provider (prisma.config.ts + schema.prisma)
- Defined complete schema with 12 models: Property, Unit, Tenant, Lease, LeaseClause, Event, Payment, LedgerEntry, Message, Notice, Showing, Application, CleaningAssignment
- Added 13 enums for type safety: UnitStatus, LeaseStatus, EventType, PaymentMethod, LedgerEntryType, MessageChannel, MessageDirection, NoticeType, NoticeStatus, ShowingStatus, ApplicationStatus, CleaningStatus
- Event model uses JSONB `payload` field and has no `updatedAt` (append-only/immutable)
- Generated initial migration SQL (0001_init) using `prisma migrate diff`
- Created Prisma client singleton utility at src/lib/db.ts
- Created seed script (prisma/seed.ts) with 2 sample properties, 7 units, and 1 tenant
- Added `src/generated/prisma` to .gitignore
- Updated package.json with db:generate, db:migrate, db:seed scripts
- Added `prisma generate` to build and postinstall scripts

**Commands Run:**
- `npm install prisma@^6 --save-dev` - installed Prisma CLI
- `npm install @prisma/client@^6` - installed Prisma client
- `npm install dotenv --save-dev` - required by prisma.config.ts
- `npm install tsx --save-dev` - for running seed script
- `npx prisma init --datasource-provider postgresql` - initialized Prisma
- `npx prisma validate` - schema validated successfully
- `npx prisma generate` - generated client to src/generated/prisma
- `npx prisma migrate diff --from-empty --to-schema-datamodel` - generated migration SQL
- `npm run lint` - passed
- `npx tsc --noEmit` - passed
- `npm run build` - successful production build
- `agent-browser open http://localhost:3001` - verified page renders

**Browser Verification:**
- Page renders correctly with no errors
- Dev server starts successfully with Prisma integrated

**Issues & Resolutions:**
- Prisma 7.x requires Node 20.19+ - resolved by pinning to Prisma 6.x which matches PRD spec
- Prisma 6 generates client to `client.ts` not `index.ts` - fixed imports to use `@/generated/prisma/client`
- No local PostgreSQL available - created migration SQL file without applying; migration will be applied when database is connected
- `agent-browser screenshot` still has validation error bug - used snapshot for verification
