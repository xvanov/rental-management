Product Requirements Document (PRD)

Product Name (working): AI Rental Ops Platform
Owner: Property Manager (single operator)
Primary Use Case: Long-term room-by-room subleasing
Secondary (future): Whole-unit rentals, Airbnb
Jurisdiction (MVP): Durham County, NC (Sacramento County optional)

1. Problem Statement

Managing subleased properties requires continuous coordination across:

marketing (Facebook Marketplace),

communications (FB, SMS, email),

scheduling,

tenant screening,

leasing,

payments,

enforcement,

documentation for court,

utilities,

cleaning enforcement,

move-out & deposit reconciliation.

Today this work is fragmented, manual, error-prone, and legally risky.

Goal:
Build a centralized, AI-assisted rental operations system that automates repetitive workflows, preserves legal records immutably, and minimizes human-in-the-loop effort to only legally required actions.

2. Goals & Non-Goals
Goals (MVP)

End-to-end automation of the sublease lifecycle

Facebook Marketplace → tenant onboarding → lease → payments → enforcement → exit

Unified communications with immutable records

Deterministic workflows with AI assistance (not AI judgment)

Court-ready documentation export

Explicit Non-Goals (MVP)

Airbnb automation

Multi-user property manager roles

AI-based legal decision-making

Perfect payment verification (reconciliation is sufficient)

Deep utility provider integrations

3. User Roles
Property Manager (Primary / Only Operator)

Full system access

Owns all workflows, data, decisions

Tenant

No platform access

Interacts via:

forms

SMS

email

Facebook Messenger (pre-SMS only)

4. Core Domain Model
Entities
Property

Physical house

Address

Jurisdiction (state, county)

Associated units (rooms or whole-house)

Unit

Either:

entire house, or

single room within a house

Rental mode (immutable):

long-term sublease

Airbnb (future)

Tenant

Personal info (PII)

One active lease max

Linked communication channels

Lease

Free-form text authored by property manager

Marker-based fields (names, dates, rent, etc.)

Converted to signable document

Versioned with notes/issues

Lease clauses govern:

rent

utilities

cleaning

enforcement rules

proration

Event (Core Abstraction)

Every action generates an immutable event:

messages

payments

notices

uploads

violations

inspections

This enables:

auditability

court packets

replayable timelines

5. End-to-End Workflow (MVP)
5.1 Marketing & Lead Intake

Property manager creates a Post

System posts to Facebook Marketplace (Meta API first)

Incoming FB messages:

auto-read

AI-assisted responses

Conversation stored immutably

5.2 Prospect Communication

Unified inbox:

Facebook Messenger (initial)

SMS

Email

Channel rule:

Once phone number is provided → switch to SMS permanently

Full conversation history preserved for court

5.3 Showings & Scheduling

Calendly-like booking flow

Availability pulled from property manager Google Calendar

Multiple prospects per showing slot allowed

Showings typically once per day per property

No-Show Logic

1-hour pre-show confirmation required via SMS

Reminder sent if unconfirmed

Auto-cancel + logged event if no confirmation

5.4 Tenant Application

Property manager triggers application

Prospect receives link via SMS/email

Form includes:

identity info

rental history

eviction history

consent to background check

financial uploads (pay stubs, bank statements)

PDFs stored centrally

Human-in-the-loop background check

Integration placeholder for Forewarn

5.5 Lease Generation & Signing

Property manager selects or authors lease version

Free-form text with markers

Converted to signable document

Tenant signs electronically

Signed lease stored with version metadata

5.6 Payments & Ledger

Supported methods:

Zelle, Venmo, Cash App, PayPal

Cash / Check (manual entry)

Payments reconciled (not strictly verified)

Partial payments apply to current balance

Automatic late fee application

Monthly ledger per tenant

Proration rules:

First month: prorated

Last month: not prorated (unless lease says otherwise)

5.7 Welcome & Group Chat

After deposit + first rent received:

Welcome message sent

Move-in instructions sent

Tenant added to mandatory SMS group chat for the house

5.8 Monthly Enforcement

Automated reminders before due date

Grace period handling

Late fee notifications

Lease violation triggered after lease-defined date (e.g., 10th)

Lease Violation Packet

Formal notice generated

Sent via SMS + email

Printable copy for physical service

Payment plan included

Proof of service uploaded manually

5.9 Utilities Tracking

Manual or scraped utility ingestion

Allocation governed by lease (equal split today)

Costs logged per month

Included in tenant ledger if applicable

5.10 Cleaning Workflow

Weekly rotating responsibility (lease-based)

Sunday reminder

Tenant must post:

≥5 photos

covering all common areas

AI-assisted validation:

coverage

quantity

basic cleanliness signals

Failure Handling

Sunday night missed → Monday violation

Auto-clean scheduled

Cleaning fee applied

Logged lease violation

5.11 Move-Out & Security Deposit

Move-out inspection:

photos/videos uploaded

Automatic deposit deduction calculation:

cleaning

damages

unpaid balances

Property manager can adjust deductions manually

State-specific deposit return deadlines enforced

Deposit disposition notice generated

6. AI Responsibilities (Explicitly Bounded)

AI may:

Draft messages

Classify messages

Validate photos against rules

Populate documents

Flag anomalies

AI may not:

Decide enforcement actions

Apply charges autonomously

Interpret law beyond templates

Initiate eviction

All enforcement is rule-based.

7. Legal & Compliance

Immutable message + document storage

Jurisdiction-specific notice templates:

Durham County (MVP)

Sacramento County (optional)

PII retention per law

Tenant deletion requests supported

Court-ready packet export:

lease

ledger

notices

proof of service

communication logs

8. Integrations (MVP)

Facebook Marketplace (Meta API preferred)

SMS provider (Twilio or equivalent)

Email (SendGrid or equivalent)

Google Calendar

E-signature (DocuSign / similar)

9. Risks & Mitigations
Risk	Mitigation
Facebook automation limits	Meta API first, fallback automation
SMS group chat issues	Clear opt-in, message throttling
Payment ambiguity	Ledger-based reconciliation
Legal exposure	Deterministic rules + audit trail
AI overreach	Strict autonomy boundaries
10. Success Metrics (MVP)

% of leads handled without manual messaging

Time saved per property per month

Reduction in missed payments

Time to generate court packet

Zero lost records in disputes

11. Future Extensions (Not MVP)

Airbnb workflow

Multi-property managers

Automated background checks

Utility API integrations

Accounting exports

Multi-jurisdiction expansion
