# Property-Centric Listing Management Plan

## Goal
Make the Property the central hub for everything — current status, tenant history, listings, showings, ads, rules, utilities. All managed from the dashboard, no scripts required.

---

## Phase 1: Schema — Extend Listing, Add ListingPlatform + PropertyProfile

### 1a. Extend `Listing` model
Add fields to track multi-platform posting and ad campaigns:
```
unitId          String?         — optional, for per-room listings
facebookAdId    String?         — Marketing API ad ID
adBudget        Float?          — daily budget in dollars
adDurationDays  Int?            — how many days the ad runs
adStatus        String?         — PAUSED/ACTIVE/COMPLETED
platforms       Json?           — ["FACEBOOK", "ZILLOW", ...] where posted
```
Add relation: `unit Unit? @relation(fields: [unitId], references: [id])`
Add `listings Listing[]` to Unit model.

### 1b. Add `PropertyProfile` model
Stores the "marketing profile" for a property — reusable across listings:
```
model PropertyProfile {
  id              String   @id @default(cuid())
  propertyId      String   @unique
  headline        String?          — default listing title
  description     String?          — default listing description
  amenities       Json?            — ["washer/dryer", "parking", "fenced yard"]
  rules           Json?            — { pets: "cats only, dogs <50lb", smoking: "no", ... }
  photos          Json?            — ["/uploads/prop-xxx/1.jpg", ...]
  availableDate   DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  property Property @relation(fields: [propertyId], references: [id])
}
```
Add `profile PropertyProfile?` relation to Property.

### 1c. Run `prisma db push`

**Files:** `prisma/schema.prisma`

---

## Phase 2: API Routes

### 2a. `GET/POST/PATCH /api/listings`
Full CRUD for listings, org-scoped:
- **GET**: List all listings (filter by propertyId, status, platform). Include property address, unit name, conversation count, showing count.
- **POST**: Create listing from property/unit data. Auto-populates from PropertyProfile if exists. Accepts: propertyId, unitId?, title, description, price, photos, platforms, metadata.
- **PATCH**: Update listing fields. Support status transitions (DRAFT→POSTED, POSTED→FILLED/EXPIRED/REMOVED).

### 2b. `POST /api/listings/[id]/post`
Action endpoint — posts a DRAFT listing to selected platforms:
1. Sets status to POSTED, postedAt to now
2. For FACEBOOK platform: calls `createListingPost()` → stores facebookPostId
3. If adBudget provided: calls `createListingAd()` → stores facebookAdId, adStatus
4. Logs SYSTEM event
5. Returns updated listing with platform post IDs

### 2c. `GET/PUT /api/properties/[id]/profile`
- **GET**: Returns PropertyProfile for property (or empty defaults)
- **PUT**: Upsert profile (headline, description, amenities, rules, photos, availableDate)

### 2d. Extend `GET /api/properties`
Include in response:
- Active listings count per property
- Active showings count
- PropertyProfile (if exists)
- Tenant history: list of current + past tenants per unit (from Tenant model's moveInDate/moveOutDate)

**Files:**
- `src/app/api/listings/route.ts` (new)
- `src/app/api/listings/[id]/post/route.ts` (new)
- `src/app/api/properties/[id]/profile/route.ts` (new)
- `src/app/api/properties/route.ts` (extend GET)

---

## Phase 3: Property Detail Page — Tabbed Layout

Redesign `src/app/dashboard/properties/[id]/page.tsx` from a single-section page into a tabbed layout:

### Tab: Overview (existing content, enhanced)
- Stat cards: Units, Occupancy, Revenue, Maintenance (existing)
- Add: Active Listings count, Upcoming Showings count
- Units grid (existing)

### Tab: Listings
- List of all listings for this property (table: title, unit, price, status badge, platform badges, posted date, conversations count, actions)
- "Create Listing" button → opens dialog:
  - Pre-fills from PropertyProfile if exists
  - Select unit (or "Entire property")
  - Title, description, price, photos (file upload placeholder for now, text URLs)
  - Platform checkboxes: Facebook (enabled), Zillow (coming soon), Roomies (coming soon)
  - Ad options: budget ($/day), duration (days), start paused checkbox
  - Save as Draft / Post Now buttons
- Listing row actions: Post (if draft), Mark Filled, Remove, View conversations

### Tab: Showings
- Table of showings for this property (date, attendee, status badge, source, actions)
- Existing showings data, filtered to this property
- Status update buttons (Confirm, Complete, No-show, Cancel)

### Tab: Tenants (History)
- Per-unit sections showing:
  - Current tenant (name, move-in date, lease status, rent)
  - Past tenants (name, move-in/move-out dates, duration)
- Data from Tenant model (moveInDate, moveOutDate, active flag) + Lease model

### Tab: Profile
- Editable property marketing profile (PropertyProfile)
- Form: headline, description, amenities (tag input), rules (key-value pairs), photos (URL list), available date
- Save button → PUT /api/properties/[id]/profile
- "These defaults pre-fill new listings" helper text

**Files:**
- `src/app/dashboard/properties/[id]/page.tsx` (rewrite with Tabs)

---

## Phase 4: Sidebar + Breadcrumbs

### 4a. Add "Listings" to sidebar nav
Between "Leases" and "Inbox":
```
{ title: "Listings", href: "/dashboard/listings", icon: Megaphone }
```

### 4b. Add listings page title to breadcrumbs
```
"/dashboard/listings": "Listings"
```

**Files:**
- `src/components/app-sidebar.tsx`
- `src/components/dashboard-header.tsx`

---

## Phase 5: Listings List Page

`src/app/dashboard/listings/page.tsx` — top-level view across all properties:
- Stat cards: Total, Active, Draft, Expired
- Filter by property, status
- Table: property address, title, unit, price, status, platform badges, conversations, posted date
- Click row → navigates to property detail page Listings tab
- "Create Listing" button → property selector first, then listing form

**Files:**
- `src/app/dashboard/listings/page.tsx` (new)

---

## Phase 6: Wire Up Conversation Engine

Update `src/lib/facebook-conversation.ts`:
- When matching a listing, prefer listings for the property that the Facebook post belongs to (use facebookPostId on Listing to trace back)
- Load PropertyProfile data to give the AI richer context (amenities, rules, etc.)
- Include rules in AI system prompt so it can answer "are pets allowed?" accurately

**Files:**
- `src/lib/facebook-conversation.ts` (update)

---

## Implementation Order
1. **Phase 1** — Schema changes (everything depends on it)
2. **Phase 2a-2c** — API routes (backend before UI)
3. **Phase 2d** — Extend properties API
4. **Phase 4** — Sidebar + breadcrumbs (quick)
5. **Phase 3** — Property detail page rewrite (biggest piece, uses APIs from Phase 2)
6. **Phase 5** — Listings list page
7. **Phase 6** — Conversation engine improvements

## What This Does NOT Include (Future)
- Photo upload to cloud storage (S3/Cloudflare R2) — currently uses URLs
- Zillow/Roomies/Craigslist platform integrations — marked "coming soon" in UI
- Listing expiry cron — can reuse stale-conversations pattern later
- Public-facing listing page — could add later for sharing links
