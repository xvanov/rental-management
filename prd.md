# AI Rental Ops Platform - Product Requirements Document

## Overview
A centralized, AI-assisted rental operations system for a single property manager doing room-by-room subleasing. The platform automates the full sublease lifecycle from Facebook Marketplace lead intake through move-out and deposit reconciliation, preserving immutable legal records and minimizing human-in-the-loop effort to only legally required actions.

## Target Audience
**Primary User:** Single property manager operating long-term room-by-room subleases in Durham County, NC.

**Key Pain Points:**
- Fragmented communication across Facebook, SMS, email
- Manual tracking of payments, late fees, and ledger balances
- Time-consuming court packet assembly
- Missed enforcement deadlines
- No audit trail for disputes

**Tenants** interact via forms, SMS, and email only — no platform login required.

## Core Features (Priority Order)
1. **Immutable Event System** — Every action generates an auditable, court-ready event record
2. **Unified Communications** — Facebook Messenger, SMS (Twilio), Email (SendGrid) in one inbox
3. **Tenant Lifecycle Management** — Lead → Application → Lease → Active → Move-out
4. **Payment Ledger** — Track rent, deposits, late fees, utilities with automatic proration and late fee logic
5. **Automated Enforcement** — Rule-based reminders, notices, and violation packets on schedule
6. **Lease Management** — Template-based lease generation with marker fields, e-signature via Xodo Sign (free tier)
7. **Showing Scheduler** — Calendar-based booking with no-show detection
8. **Cleaning Enforcement** — Rotating schedule, photo submission, AI-assisted validation
9. **Court Packet Export** — Generate PDF bundles of lease, ledger, notices, communications
10. **Move-Out & Deposit** — Inspection documentation, deduction calculation, disposition notice

## Tech Stack
- **Frontend**: Next.js 15 (App Router) + React 19
- **Backend**: Next.js API Routes + Server Actions
- **Database**: PostgreSQL (managed via Railway)
- **ORM**: Prisma 6
- **Styling**: Tailwind CSS + Shadcn/ui
- **Authentication**: NextAuth.js with Google OAuth
- **AI**: Vercel AI SDK 5 (OpenAI + Anthropic)
- **Job Queue**: BullMQ + Redis (managed via Railway)
- **SMS**: Twilio
- **Email**: SendGrid
- **Calendar**: Google Calendar API
- **E-Signature**: Xodo Sign (free tier)
- **PDF Generation**: Puppeteer
- **Hosting**: Railway (app + PostgreSQL + Redis)

## Architecture
Full-stack monolith deployed as a single Next.js application on Railway with managed PostgreSQL and Redis services.

```
┌─────────────────────────────────────────────────┐
│                  Next.js App                      │
├─────────────────────────────────────────────────┤
│  /dashboard/*        Operator UI (auth required) │
│  /apply/[token]      Tenant application form     │
│  /book/[propertyId]  Showing booking form        │
│  /api/webhooks/*     Twilio, SendGrid, Xodo Sign │
│  /api/cron/*         Scheduled job triggers      │
├─────────────────────────────────────────────────┤
│  /lib/events         Immutable event logging     │
│  /lib/ai             AI SDK wrappers             │
│  /lib/integrations   External service clients    │
│  /lib/jobs           BullMQ job definitions      │
│  /lib/pdf            Court document generation   │
├─────────────────────────────────────────────────┤
│         Prisma ORM          │   BullMQ Workers   │
└──────────┬──────────────────┴────────┬──────────┘
           │                           │
    ┌──────▼──────┐            ┌───────▼───────┐
    │  PostgreSQL  │            │     Redis      │
    └─────────────┘            └───────────────┘
```

## Data Model
### Key Entities
- **Property** — Physical house with address, jurisdiction, associated units
- **Unit** — Room or whole-house within a property, rental mode (sublease/Airbnb-future)
- **Tenant** — Personal info, linked communication channels, one active lease max
- **Lease** — Free-form text with markers, versioned, links to unit and tenant
- **LeaseClause** — Parsed clauses governing rent, utilities, cleaning, enforcement rules
- **Event** — Immutable append-only record of every system action (messages, payments, notices, uploads, violations)
- **Payment** — Amount, method, date, linked to tenant ledger
- **LedgerEntry** — Monthly balance tracking per tenant (rent, fees, utilities, credits)
- **Message** — Unified inbox record (channel, direction, content, tenant link)
- **Notice** — Generated enforcement document (type, sent date, proof of service)
- **Showing** — Scheduled viewing with confirmation status
- **Application** — Tenant application data, uploads, screening status
- **CleaningAssignment** — Weekly rotation, photo submissions, validation status

## UI/UX Requirements
### Operator Dashboard (Shadcn/ui + Tailwind)
- Responsive layout with sidebar navigation
- Dashboard home with action items, upcoming deadlines, recent events
- Property/unit management views
- Tenant detail pages with full timeline
- Unified inbox with channel indicators
- Payment ledger with filtering and export
- Enforcement status board
- Calendar view for showings

### Tenant-Facing Pages (Public, no auth)
- Application form (multi-step, file upload)
- Showing booking page (available slots)
- Cleaning photo submission form

### Design Principles
- Mobile-first for tenant forms
- Desktop-optimized for operator dashboard
- Dark mode support via Tailwind

## Security Considerations
- Google OAuth for operator authentication (single user)
- Token-validated public URLs for tenant forms (no guessable paths)
- PII encryption at rest in PostgreSQL
- Immutable event records (append-only, no UPDATE/DELETE on events table)
- HTTPS enforced via Railway
- Environment variables for all API keys and secrets
- Tenant deletion requests supported (soft-delete with PII redaction)

## Third-Party Integrations
| Service | Purpose | SDK/Method |
|---------|---------|-----------|
| Twilio | SMS send/receive | `twilio` Node.js SDK |
| SendGrid | Email send/receive | `@sendgrid/mail` |
| Meta Graph API | Facebook Marketplace posting & Messenger | REST API |
| Google Calendar | Showing availability | `googleapis` |
| Xodo Sign | Lease e-signatures (free tier) | Xodo Sign REST API |
| OpenAI / Anthropic | Message drafting, photo validation | Vercel AI SDK |

## Constraints & Assumptions
- **Single operator**: No multi-user roles for MVP
- **Jurisdiction**: Durham County, NC templates only (Sacramento optional)
- **Payments**: Reconciliation only (Zelle, Venmo, Cash App, PayPal, Cash, Check) — no payment processing
- **Background checks**: Manual with Forewarn placeholder
- **Facebook automation**: Meta API preferred, fallback to manual
- **Hosting budget**: Railway free tier to start, ~$20-30/month at scale

## Success Criteria
- All tenant communications captured in a single timeline
- Payment ledger accurate with automatic late fee application
- Court packet generation in under 60 seconds
- Zero lost records in disputes
- Lease violation notices auto-generated on schedule
- Showing no-shows auto-detected and logged
- Cleaning violations auto-escalated with fee application

---

## Task List

```json
[
  {
    "category": "setup",
    "description": "Initialize Next.js 15 project with TypeScript, Tailwind CSS, and Shadcn/ui",
    "steps": [
      "Run create-next-app with TypeScript and Tailwind",
      "Install and configure Shadcn/ui (New York style, neutral theme)",
      "Configure path aliases and project structure (/lib, /components, /app)",
      "Verify dev server starts and renders default page"
    ],
    "passes": true
  },
  {
    "category": "setup",
    "description": "Set up Prisma with PostgreSQL and define core schema",
    "steps": [
      "Install Prisma and initialize with PostgreSQL provider",
      "Define schema: Property, Unit, Tenant, Lease, Event, Payment, LedgerEntry, Message, Notice, Showing, Application, CleaningAssignment",
      "Add immutable Event model with JSONB payload field",
      "Configure Prisma client generation and add to .gitignore",
      "Run initial migration (prisma migrate dev)",
      "Create a seed script with sample property and unit data"
    ],
    "passes": true
  },
  {
    "category": "setup",
    "description": "Configure NextAuth.js with Google OAuth",
    "steps": [
      "Install next-auth and @auth/prisma-adapter",
      "Create auth configuration with Google provider",
      "Add session provider to root layout",
      "Create sign-in page at /login",
      "Add middleware to protect /dashboard routes",
      "Verify login flow works with Google account"
    ],
    "passes": true
  },
  {
    "category": "setup",
    "description": "Set up BullMQ with Redis for background job processing",
    "steps": [
      "Install bullmq and ioredis",
      "Create Redis connection utility in /lib/redis.ts",
      "Create base queue and worker setup in /lib/jobs/",
      "Create a test job that logs to console",
      "Add BullMQ dashboard route (bull-board) at /dashboard/jobs",
      "Verify job enqueue and processing works"
    ],
    "passes": true
  },
  {
    "category": "setup",
    "description": "Create the immutable event logging system",
    "steps": [
      "Create /lib/events/index.ts with createEvent function",
      "Enforce append-only pattern (no update/delete on Event model)",
      "Support event types: message, payment, notice, upload, violation, inspection, system",
      "Add JSONB payload with TypeScript type unions per event type",
      "Create event query helpers (by tenant, by property, by date range)",
      "Add event creation to a test API route and verify immutability"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Build the operator dashboard shell with sidebar navigation",
    "steps": [
      "Create dashboard layout with Shadcn sidebar component",
      "Add navigation items: Dashboard, Properties, Tenants, Inbox, Payments, Enforcement, Calendar, Settings",
      "Create placeholder pages for each navigation item",
      "Add user avatar and sign-out button in sidebar footer",
      "Make layout responsive (collapsible sidebar on mobile)",
      "Add breadcrumb navigation"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Build property and unit management pages",
    "steps": [
      "Create /dashboard/properties page with property list (card grid)",
      "Add create property form (address, jurisdiction, unit count)",
      "Create /dashboard/properties/[id] detail page",
      "Add unit management within property (add/edit rooms)",
      "Show unit status (vacant, occupied, maintenance)",
      "Add property-level stats (occupancy rate, total revenue)"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Build tenant management and detail pages",
    "steps": [
      "Create /dashboard/tenants page with tenant list (table with search/filter)",
      "Add tenant detail page at /dashboard/tenants/[id]",
      "Show tenant timeline (all events in chronological order)",
      "Display active lease information and unit assignment",
      "Show payment history and current balance",
      "Add communication history tab",
      "Add manual tenant creation form"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Build the unified communications inbox",
    "steps": [
      "Create /dashboard/inbox page with conversation list",
      "Show channel indicator (SMS, Email, Facebook) per conversation",
      "Create conversation detail view with message thread",
      "Add message compose with channel selector",
      "Implement channel switching rule (once phone provided, SMS only)",
      "Store all messages as immutable events",
      "Add unread count badge in sidebar"
    ],
    "passes": true
  },
  {
    "category": "integration",
    "description": "Integrate Twilio for SMS send and receive",
    "steps": [
      "Install twilio SDK",
      "Create Twilio client wrapper in /lib/integrations/twilio.ts",
      "Create SMS send function with event logging",
      "Set up webhook endpoint at /api/webhooks/twilio for incoming SMS",
      "Parse incoming messages and create Message + Event records",
      "Link incoming messages to tenant by phone number",
      "Add SMS group chat support (send to all tenants in a property)"
    ],
    "passes": true
  },
  {
    "category": "integration",
    "description": "Integrate SendGrid for email send and receive",
    "steps": [
      "Install @sendgrid/mail",
      "Create SendGrid client wrapper in /lib/integrations/sendgrid.ts",
      "Create email send function with event logging",
      "Set up inbound parse webhook at /api/webhooks/sendgrid",
      "Parse incoming emails and create Message + Event records",
      "Support HTML and plain text email templates",
      "Link incoming emails to tenant by email address"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Build the showing scheduler with Google Calendar integration",
    "steps": [
      "Install googleapis and configure Calendar API access via OAuth",
      "Create /dashboard/calendar page showing weekly/monthly view",
      "Add showing slot creation (property, date, time, max attendees)",
      "Pull availability from property manager Google Calendar",
      "Create public booking page at /book/[propertyId]",
      "Implement 1-hour pre-show SMS confirmation flow",
      "Add no-show detection: auto-cancel if no confirmation, log event",
      "Create reminder job in BullMQ for showing notifications"
    ],
    "passes": false
  },
  {
    "category": "feature",
    "description": "Build tenant application form and review workflow",
    "steps": [
      "Create /apply/[token] public multi-step form",
      "Form fields: identity, rental history, eviction history, employment, background check consent",
      "Add file upload for pay stubs and bank statements (store in /uploads or S3)",
      "Generate unique application token when PM triggers application",
      "Send application link via SMS/email to prospect",
      "Create /dashboard/applications review page",
      "Show application details with uploaded documents",
      "Add approve/reject actions with event logging"
    ],
    "passes": false
  },
  {
    "category": "feature",
    "description": "Build lease management with template markers and e-signature",
    "steps": [
      "Create lease template editor in /dashboard/leases/templates",
      "Support marker syntax for dynamic fields ({{tenant_name}}, {{rent_amount}}, {{start_date}}, etc.)",
      "Create lease generation from template + tenant + unit data",
      "Parse lease clauses for enforcement rules (rent due date, late fee amount, grace period)",
      "Integrate Xodo Sign for e-signature (free tier, REST API)",
      "Create webhook at /api/webhooks/xodo-sign for signature status",
      "Store signed lease with version metadata",
      "Display lease history and versions on tenant detail page"
    ],
    "passes": false
  },
  {
    "category": "feature",
    "description": "Build payment ledger and tracking system",
    "steps": [
      "Create /dashboard/payments page with ledger view",
      "Add manual payment entry form (amount, method, date, tenant)",
      "Support payment methods: Zelle, Venmo, Cash App, PayPal, Cash, Check",
      "Implement automatic late fee calculation based on lease clauses",
      "Handle first-month proration based on move-in date",
      "Create monthly ledger entries per tenant (rent due, fees, credits, balance)",
      "Add partial payment application to current balance",
      "Show payment history on tenant detail page",
      "Add ledger export (CSV and PDF)"
    ],
    "passes": false
  },
  {
    "category": "feature",
    "description": "Build automated enforcement workflow",
    "steps": [
      "Create enforcement rules engine based on lease clauses",
      "Schedule rent reminder jobs (3 days before, 1 day before due date)",
      "Implement grace period handling per lease terms",
      "Auto-generate late fee notices after grace period",
      "Create lease violation packet generator (formal notice with payment plan)",
      "Send violation notices via SMS + email with event logging",
      "Generate printable PDF copy for physical service",
      "Add proof of service upload (manual photo/scan)",
      "Create /dashboard/enforcement status board showing active violations",
      "Schedule escalation jobs for unresolved violations"
    ],
    "passes": false
  },
  {
    "category": "feature",
    "description": "Build utilities tracking and allocation",
    "steps": [
      "Create utilities management page in dashboard",
      "Add manual utility bill entry (provider, amount, billing period)",
      "Implement allocation rules from lease (equal split for MVP)",
      "Add utility charges to tenant ledger entries",
      "Show utility history per property and per tenant",
      "Create monthly utility summary"
    ],
    "passes": false
  },
  {
    "category": "feature",
    "description": "Build cleaning enforcement workflow with AI photo validation",
    "steps": [
      "Create weekly cleaning rotation schedule based on lease/tenants",
      "Schedule Sunday reminder jobs via SMS",
      "Create public cleaning submission form at /clean/[token]",
      "Require minimum 5 photos covering all common areas",
      "Integrate AI (Vercel AI SDK) for photo validation (coverage check, quantity, cleanliness signals)",
      "Handle failure: Monday violation if Sunday missed",
      "Auto-schedule professional clean and apply fee to tenant ledger",
      "Log cleaning violations as events",
      "Show cleaning status on dashboard"
    ],
    "passes": false
  },
  {
    "category": "feature",
    "description": "Build welcome flow and move-in process",
    "steps": [
      "Trigger welcome flow after deposit + first rent received",
      "Send welcome message via SMS with move-in instructions",
      "Add tenant to property SMS group chat",
      "Create move-in checklist (keys, parking, wifi, house rules)",
      "Log welcome event and group chat addition",
      "Update unit status to occupied"
    ],
    "passes": false
  },
  {
    "category": "feature",
    "description": "Build move-out and security deposit reconciliation",
    "steps": [
      "Create move-out initiation workflow (30-day notice tracking)",
      "Build move-out inspection form with photo/video upload",
      "Calculate automatic deposit deductions (cleaning, damages, unpaid balances)",
      "Allow PM to adjust deductions manually with notes",
      "Enforce state-specific deposit return deadlines (NC: 30 days)",
      "Generate deposit disposition notice PDF",
      "Send disposition notice via email with event logging",
      "Update unit status to vacant",
      "Remove tenant from SMS group chat"
    ],
    "passes": false
  },
  {
    "category": "feature",
    "description": "Build court packet export system",
    "steps": [
      "Create /dashboard/tenants/[id]/court-packet page",
      "Compile: signed lease, full ledger, all notices, proof of service, communication logs",
      "Generate combined PDF with table of contents and page numbers",
      "Use Puppeteer for HTML-to-PDF rendering with legal document formatting",
      "Add date range filter for communication logs",
      "Include event timeline as appendix",
      "Download as single PDF bundle",
      "Log court packet generation as event"
    ],
    "passes": false
  },
  {
    "category": "integration",
    "description": "Integrate AI for message drafting and classification",
    "steps": [
      "Install ai, @ai-sdk/openai, @ai-sdk/anthropic packages",
      "Create AI wrapper in /lib/ai/ with provider configuration",
      "Build message draft generation (context-aware responses based on conversation history)",
      "Add message classification (inquiry, complaint, payment confirmation, maintenance request)",
      "Create 'suggest reply' button in inbox with streaming response",
      "Add PM approval step before sending AI-drafted messages",
      "Log AI-assisted actions in event system"
    ],
    "passes": false
  },
  {
    "category": "integration",
    "description": "Set up Facebook Marketplace integration (Meta Graph API)",
    "steps": [
      "Configure Meta Graph API credentials",
      "Create listing post function (title, description, photos, price)",
      "Set up Messenger webhook for incoming messages",
      "Route Facebook messages to unified inbox",
      "Auto-respond to initial inquiries with AI-drafted messages",
      "Detect phone number in conversation to trigger SMS channel switch",
      "Store all Facebook conversations as immutable events"
    ],
    "passes": false
  },
  {
    "category": "feature",
    "description": "Build the dashboard home page with action items and stats",
    "steps": [
      "Create dashboard home with key metrics (occupancy, revenue, outstanding balances)",
      "Add action items list (pending applications, overdue payments, upcoming showings, unread messages)",
      "Show recent event feed",
      "Add quick action buttons (send message, log payment, create showing)",
      "Display upcoming enforcement deadlines",
      "Add property-level summary cards"
    ],
    "passes": false
  },
  {
    "category": "setup",
    "description": "Configure Railway deployment with PostgreSQL and Redis",
    "steps": [
      "Create railway.toml configuration file",
      "Configure environment variables for production",
      "Set up PostgreSQL service on Railway",
      "Set up Redis service on Railway",
      "Configure Prisma for production database URL",
      "Add health check endpoint at /api/health",
      "Configure build command and start command",
      "Verify deployment works with all services connected"
    ],
    "passes": false
  }
]
```

---

## Agent Instructions

1. Read `activity.md` first to understand current state
2. Find next task with `"passes": false`
3. Complete all steps for that task
4. Verify in browser using agent-browser
5. Update task to `"passes": true`
6. Log completion in `activity.md`
7. Repeat until all tasks pass

**Important:** Only modify the `passes` field. Do not remove or rewrite tasks.

---

## Completion Criteria
All tasks marked with `"passes": true`
