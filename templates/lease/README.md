# Room Rental Agreement Template

This directory contains a reusable room rental/co-living agreement template with configurable fields.

## Files

- `room-rental-agreement.md` - The markdown template with `{{PLACEHOLDER}}` variables
- `lease-template.types.ts` - TypeScript interfaces and default values
- `generate-lease.ts` - Utility functions to generate lease documents
- `index.ts` - Module exports

## Template Variables

### Required Fields (Must be provided for each lease)

| Variable | Description | Example |
|----------|-------------|---------|
| `LESSOR_NAME` | Full legal name of property owner | "John Smith" |
| `TENANT_NAME` | Full legal name of tenant | "Jane Doe" |
| `PROPERTY_ADDRESS` | Full address with city, state, zip | "123 Main St, Raleigh NC, 27601" |
| `STATE_NAME` | State for governing law | "North Carolina" |
| `COUNTY_NAME` | County for legal venue | "Wake" |
| `ROOM_NUMBER` | Assigned room identifier | "3" |
| `LEASE_START_DATE` | Start date (MM/DD/YYYY) | "01/01/2026" |
| `LEASE_END_DATE` | End date (MM/DD/YYYY) | "12/31/2026" |
| `MONTHLY_RENT` | Monthly rent amount | "$800" |
| `SECURITY_DEPOSIT` | Security deposit amount | "$800" |

### Property Configuration (Has defaults, customize as needed)

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTHORIZED_AREAS` | "kitchen, dining area, laundry room, back porch, hallways, first floor bathroom" | Common areas tenant can use |
| `COMMON_AREAS_LIST` | "kitchen/dining/hallways/stairs/laundry/foyer/shared baths" | Areas for cleaning rotation |
| `SHARED_UTILITIES_LIST` | "water, garbage, gas, electricity, internet" | Utilities split among tenants |

### Payment Terms (Has defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `RENT_DUE_DAY` | "1st" | Day of month rent is due |
| `GRACE_PERIOD_END_DAY` | "5th" | Last day of grace period |
| `MATERIAL_BREACH_DAY` | "10th" | Day unpaid rent becomes breach |
| `LATE_FEE_PERCENT` | 5 | Late fee as % of rent |
| `RETURNED_PAYMENT_FEE` | "$35" | Fee for bounced payments |
| `UTILITY_PAYMENT_DAYS` | 5 | Days to pay utility share |

### Notice Periods (Has defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `EARLY_TERMINATION_NOTICE_DAYS` | 30 | Days notice for early termination |
| `TERMINATION_NOTICE_DAYS` | 30 | Days notice for breach termination |
| `ENTRY_NOTICE_HOURS` | 24 | Hours notice before entering room |
| `INSPECTION_NOTICE_DAYS` | 7 | Days notice before inspection |
| `INSPECTION_FREQUENCY` | "Quarterly" | How often inspections occur |
| `MAILED_NOTICE_DAYS` | 3 | Business days for mailed notices |
| `HOUSE_RULES_AMENDMENT_NOTICE_DAYS` | 30 | Days before rule changes take effect |
| `ADDENDUM_UPDATE_NOTICE_DAYS` | 30 | Days before addendum updates |

### Timeframe Limits (Has defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `POSSESSION_DELAY_LIMIT_DAYS` | 14 | Max days delayed possession |
| `EXTENDED_ABSENCE_DAYS` | 15 | Days absence requiring notice |
| `ABANDONMENT_RENT_DAYS` | 14 | Days rent overdue for abandonment |
| `MOVE_IN_REPORT_HOURS` | 72 | Hours to submit condition report |
| `CASUALTY_TERMINATION_DAYS` | 15 | Days to terminate after casualty |
| `HOA_FINE_PAYMENT_DAYS` | 5 | Days to pay HOA fines |
| `BED_BUG_INITIAL_PERIOD_DAYS` | 30 | Days lessor covers bed bug treatment |

### Fees (Has defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `LOST_KEY_FEE` | "$150" | Max fee per lost key |
| `LOCKOUT_FEE` | "$50" | Fee per lockout incident |
| `ACCESS_SERVICE_FEE` | "$50" | Service fee for access issues |

### Property Rules (Has defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `QUIET_HOURS_START` | "10:00 p.m." | Start of quiet hours |
| `QUIET_HOURS_END` | "8:00 a.m." | End of quiet hours |
| `HOLDOVER_RENT_PERCENT` | 150 | % of rent for holdover period |
| `FIRE_SAFETY_DISTANCE_FEET` | 15 | Min feet from building for fire |
| `GRILL_DISTANCE_FEET` | 10 | Min feet for grills |
| `MAX_AQUARIUM_GALLONS` | 20 | Max aquarium size without approval |
| `MAX_HANGING_WEIGHT_LBS` | 20 | Max wall hanging weight |
| `HVAC_FILTER_MONTHS` | 3 | Months between filter changes |
| `TRASH_PICKUP_DAY` | "Monday" | Day for trash pickup |
| `POWER_OUTAGE_INSTRUCTIONS` | See types file | Instructions for power issues |
| `ADDITIONAL_HYGIENE_RULES` | "Shoes off when entering the house." | Extra hygiene rules |

### Insurance (Has defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `MIN_LIABILITY_COVERAGE` | "$100,000" | Minimum renter's insurance |

### Conditional Sections

| Variable | Default | Description |
|----------|---------|-------------|
| `IF_HOA` | true | Include HOA section |
| `IF_PRE_1978_PROPERTY` | false | Include lead paint disclosure |

## Usage

### Programmatic Generation

```typescript
import { generateLease, RequiredLeaseFields } from './templates/lease';

const leaseData: RequiredLeaseFields = {
  LESSOR_NAME: 'Kalin Ivanov',
  TENANT_NAME: 'John Doe',
  PROPERTY_ADDRESS: '118 King Arthur Ct, Morrisville NC, 27560',
  STATE_NAME: 'North Carolina',
  COUNTY_NAME: 'Wake',
  ROOM_NUMBER: '6',
  LEASE_START_DATE: '10/01/2025',
  LEASE_END_DATE: '09/30/2026',
  MONTHLY_RENT: '$800',
  SECURITY_DEPOSIT: '$800',
};

// Generate with defaults
const lease = generateLease(leaseData);

// Generate with custom overrides
const customLease = generateLease(leaseData, {
  LATE_FEE_PERCENT: 10,
  IF_HOA: false,
});
```

### CLI Generation

```bash
npx ts-node templates/lease/generate-lease.ts
```

## Adding Property Presets

Edit `lease-template.types.ts` and add entries to `PROPERTY_PRESETS`:

```typescript
export const PROPERTY_PRESETS: Record<string, Partial<LeaseTemplateData>> = {
  'king-arthur': {
    PROPERTY_ADDRESS: '118 King Arthur Ct, Morrisville NC, 27560',
    STATE_NAME: 'North Carolina',
    COUNTY_NAME: 'Wake',
    AUTHORIZED_AREAS: 'kitchen, dining area, laundry room, back porch, hallways, first floor bathroom',
    IF_HOA: true,
  },
  'sacramento-house': {
    PROPERTY_ADDRESS: '456 Oak Ave, Sacramento CA, 95814',
    STATE_NAME: 'California',
    COUNTY_NAME: 'Sacramento',
    IF_HOA: false,
  },
};
```

Then use with:

```typescript
const lease = generateLease(requiredFields, undefined, 'king-arthur');
```
