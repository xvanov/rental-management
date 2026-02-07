/**
 * Room Rental Agreement Template Fields
 *
 * This file defines all template variables used in the room-rental-agreement.md template.
 * Use these interfaces when generating lease documents programmatically.
 */

export interface LeaseParties {
  /** Full legal name of the property owner/lessor */
  LESSOR_NAME: string;
  /** Full legal name of the tenant */
  TENANT_NAME: string;
}

export interface PropertyDetails {
  /** Full property address including city, state, zip */
  PROPERTY_ADDRESS: string;
  /** State where property is located (for governing law) */
  STATE_NAME: string;
  /** County where property is located (for venue) */
  COUNTY_NAME: string;
  /** Room number or identifier assigned to tenant */
  ROOM_NUMBER: string;
  /** List of authorized common areas (e.g., "kitchen, dining area, laundry room, back porch, hallways, first floor bathroom") */
  AUTHORIZED_AREAS: string;
  /** List of common areas for cleaning (e.g., "kitchen/dining/hallways/stairs/laundry/foyer/shared baths") */
  COMMON_AREAS_LIST: string;
}

export interface LeaseTerm {
  /** Lease start date (format: MM/DD/YYYY) */
  LEASE_START_DATE: string;
  /** Lease end date (format: MM/DD/YYYY) */
  LEASE_END_DATE: string;
}

export interface PaymentTerms {
  /** Monthly rent amount (e.g., "$800") */
  MONTHLY_RENT: string;
  /** Security deposit amount (e.g., "$800") */
  SECURITY_DEPOSIT: string;
  /** Day of month rent is due (e.g., "1st") */
  RENT_DUE_DAY: string;
  /** Last day of grace period (e.g., "5th") */
  GRACE_PERIOD_END_DAY: string;
  /** Day after which unpaid rent is material breach (e.g., "10th") */
  MATERIAL_BREACH_DAY: string;
  /** Late fee as percentage of rent */
  LATE_FEE_PERCENT: number;
  /** Fee for returned/bounced payments (e.g., "$35") */
  RETURNED_PAYMENT_FEE: string;
}

export interface UtilityTerms {
  /** List of shared utilities (e.g., "water, garbage, gas, electricity, internet") */
  SHARED_UTILITIES_LIST: string;
  /** Days tenant has to pay utility share after notice */
  UTILITY_PAYMENT_DAYS: number;
}

export interface NoticePeriods {
  /** Days notice required for early termination by tenant */
  EARLY_TERMINATION_NOTICE_DAYS: number;
  /** Days notice required for lessor to terminate for breach */
  TERMINATION_NOTICE_DAYS: number;
  /** Hours notice required before entering private room */
  ENTRY_NOTICE_HOURS: number;
  /** Days notice before periodic inspections */
  INSPECTION_NOTICE_DAYS: number;
  /** How often inspections occur (e.g., "Quarterly") */
  INSPECTION_FREQUENCY: string;
  /** Days after mailing when notice is deemed received */
  MAILED_NOTICE_DAYS: number;
  /** Days notice before house rules amendments take effect */
  HOUSE_RULES_AMENDMENT_NOTICE_DAYS: number;
  /** Days notice before addendum updates take effect */
  ADDENDUM_UPDATE_NOTICE_DAYS: number;
}

export interface TimeframeLimits {
  /** Days before possession must be delivered or tenant can cancel */
  POSSESSION_DELAY_LIMIT_DAYS: number;
  /** Days absence considered extended (requires notice) */
  EXTENDED_ABSENCE_DAYS: number;
  /** Days rent past due for abandonment determination */
  ABANDONMENT_RENT_DAYS: number;
  /** Hours after move-in to submit condition report */
  MOVE_IN_REPORT_HOURS: number;
  /** Days to terminate after casualty */
  CASUALTY_TERMINATION_DAYS: number;
  /** Days for HOA fine payment */
  HOA_FINE_PAYMENT_DAYS: number;
  /** Initial period (days) where lessor pays for bed bug treatment */
  BED_BUG_INITIAL_PERIOD_DAYS: number;
}

export interface Fees {
  /** Maximum fee for lost/unreturned key (e.g., "$150") */
  LOST_KEY_FEE: string;
  /** Fee per lockout incident (e.g., "$50") */
  LOCKOUT_FEE: string;
  /** Service fee for access/lock issues (e.g., "$50") */
  ACCESS_SERVICE_FEE: string;
}

export interface PropertyRules {
  /** Quiet hours start time (e.g., "10:00 p.m.") */
  QUIET_HOURS_START: string;
  /** Quiet hours end time (e.g., "8:00 a.m.") */
  QUIET_HOURS_END: string;
  /** Holdover rent as percentage of monthly rent */
  HOLDOVER_RENT_PERCENT: number;
  /** Minimum distance (feet) for fire safety (grills, candles) */
  FIRE_SAFETY_DISTANCE_FEET: number;
  /** Minimum distance (feet) for grills from structures */
  GRILL_DISTANCE_FEET: number;
  /** Maximum aquarium size (gallons) without approval */
  MAX_AQUARIUM_GALLONS: number;
  /** Maximum weight (lbs) for wall hangings without approval */
  MAX_HANGING_WEIGHT_LBS: number;
  /** Months between HVAC filter replacements */
  HVAC_FILTER_MONTHS: number;
  /** Day trash is picked up (e.g., "Monday") */
  TRASH_PICKUP_DAY: string;
  /** Instructions for power outages */
  POWER_OUTAGE_INSTRUCTIONS: string;
  /** Any additional hygiene rules (or empty string) */
  ADDITIONAL_HYGIENE_RULES: string;
}

export interface InsuranceRequirements {
  /** Minimum liability coverage (e.g., "$100,000") */
  MIN_LIABILITY_COVERAGE: string;
}

export interface ConditionalSections {
  /** Whether property has HOA */
  IF_HOA: boolean;
  /** Whether property was built before 1978 (lead paint disclosure) */
  IF_PRE_1978_PROPERTY: boolean;
}

/**
 * Complete lease template data structure
 */
export interface LeaseTemplateData extends
  LeaseParties,
  PropertyDetails,
  LeaseTerm,
  PaymentTerms,
  UtilityTerms,
  NoticePeriods,
  TimeframeLimits,
  Fees,
  PropertyRules,
  InsuranceRequirements,
  ConditionalSections {}

/**
 * Default values for a standard room rental agreement
 * Customize per property/tenant as needed
 */
export const DEFAULT_LEASE_VALUES: Omit<LeaseTemplateData, 'LESSOR_NAME' | 'TENANT_NAME' | 'PROPERTY_ADDRESS' | 'STATE_NAME' | 'COUNTY_NAME' | 'ROOM_NUMBER' | 'LEASE_START_DATE' | 'LEASE_END_DATE' | 'MONTHLY_RENT' | 'SECURITY_DEPOSIT'> = {
  // Authorized areas (customize per property)
  AUTHORIZED_AREAS: 'kitchen, dining area, laundry room, back porch, hallways, first floor bathroom',
  COMMON_AREAS_LIST: 'kitchen/dining/hallways/stairs/laundry/foyer/shared baths',

  // Payment terms
  RENT_DUE_DAY: '1st',
  GRACE_PERIOD_END_DAY: '5th',
  MATERIAL_BREACH_DAY: '10th',
  LATE_FEE_PERCENT: 5,
  RETURNED_PAYMENT_FEE: '$35',

  // Utilities
  SHARED_UTILITIES_LIST: 'water, garbage, gas, electricity, internet',
  UTILITY_PAYMENT_DAYS: 5,

  // Notice periods
  EARLY_TERMINATION_NOTICE_DAYS: 30,
  TERMINATION_NOTICE_DAYS: 30,
  ENTRY_NOTICE_HOURS: 24,
  INSPECTION_NOTICE_DAYS: 7,
  INSPECTION_FREQUENCY: 'Quarterly',
  MAILED_NOTICE_DAYS: 3,
  HOUSE_RULES_AMENDMENT_NOTICE_DAYS: 30,
  ADDENDUM_UPDATE_NOTICE_DAYS: 30,

  // Timeframe limits
  POSSESSION_DELAY_LIMIT_DAYS: 14,
  EXTENDED_ABSENCE_DAYS: 15,
  ABANDONMENT_RENT_DAYS: 14,
  MOVE_IN_REPORT_HOURS: 72,
  CASUALTY_TERMINATION_DAYS: 15,
  HOA_FINE_PAYMENT_DAYS: 5,
  BED_BUG_INITIAL_PERIOD_DAYS: 30,

  // Fees
  LOST_KEY_FEE: '$150',
  LOCKOUT_FEE: '$50',
  ACCESS_SERVICE_FEE: '$50',

  // Property rules
  QUIET_HOURS_START: '10:00 p.m.',
  QUIET_HOURS_END: '8:00 a.m.',
  HOLDOVER_RENT_PERCENT: 150,
  FIRE_SAFETY_DISTANCE_FEET: 15,
  GRILL_DISTANCE_FEET: 10,
  MAX_AQUARIUM_GALLONS: 20,
  MAX_HANGING_WEIGHT_LBS: 20,
  HVAC_FILTER_MONTHS: 3,
  TRASH_PICKUP_DAY: 'Monday',
  POWER_OUTAGE_INSTRUCTIONS: 'Check breaker panel; reset tripped breakers OFF then ON. If unsure, contact Lessor.',
  ADDITIONAL_HYGIENE_RULES: 'Shoes off when entering the house.',

  // Insurance
  MIN_LIABILITY_COVERAGE: '$100,000',

  // Conditional sections
  IF_HOA: true,
  IF_PRE_1978_PROPERTY: false,
};

/**
 * Required fields that must be provided for each lease
 */
export type RequiredLeaseFields = Pick<LeaseTemplateData,
  | 'LESSOR_NAME'
  | 'TENANT_NAME'
  | 'PROPERTY_ADDRESS'
  | 'STATE_NAME'
  | 'COUNTY_NAME'
  | 'ROOM_NUMBER'
  | 'LEASE_START_DATE'
  | 'LEASE_END_DATE'
  | 'MONTHLY_RENT'
  | 'SECURITY_DEPOSIT'
>;

/**
 * Example property configurations for quick setup
 */
export const PROPERTY_PRESETS: Record<string, Partial<LeaseTemplateData>> = {
  // Add property presets here as properties are added to the system
  // Example:
  // 'king-arthur': {
  //   PROPERTY_ADDRESS: '118 King Arthur Ct, Morrisville NC, 27560',
  //   STATE_NAME: 'North Carolina',
  //   COUNTY_NAME: 'Wake',
  //   AUTHORIZED_AREAS: 'kitchen, dining area, laundry room, back porch, hallways, first floor bathroom',
  //   IF_HOA: true,
  // },
};
