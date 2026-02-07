import * as fs from 'fs';
import * as path from 'path';
import {
  LeaseTemplateData,
  RequiredLeaseFields,
  DEFAULT_LEASE_VALUES,
  PROPERTY_PRESETS,
} from './lease-template.types';

/**
 * Generates a lease document from the template with provided data
 */
export function generateLease(
  requiredFields: RequiredLeaseFields,
  customFields?: Partial<LeaseTemplateData>,
  propertyPreset?: string
): string {
  // Start with defaults
  let data: LeaseTemplateData = {
    ...DEFAULT_LEASE_VALUES,
    ...requiredFields,
  } as LeaseTemplateData;

  // Apply property preset if provided
  if (propertyPreset && PROPERTY_PRESETS[propertyPreset]) {
    data = {
      ...data,
      ...PROPERTY_PRESETS[propertyPreset],
    };
  }

  // Apply custom fields
  if (customFields) {
    data = {
      ...data,
      ...customFields,
    };
  }

  // Read template
  const templatePath = path.join(__dirname, 'room-rental-agreement.md');
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Replace all template variables
  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`;

    if (typeof value === 'boolean') {
      // Handle conditional sections
      const startTag = `{{#${key}}}`;
      const endTag = `{{/${key}}}`;
      const regex = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`, 'g');

      if (value) {
        // Keep content, remove tags
        template = template.replace(regex, '$1');
      } else {
        // Remove entire section including tags
        template = template.replace(regex, '');
      }
    } else {
      // Replace simple placeholders
      template = template.replace(new RegExp(placeholder, 'g'), String(value));
    }
  }

  // Clean up any remaining empty conditional blocks or unreplaced placeholders
  template = template.replace(/\{\{#\w+\}\}[\s\S]*?\{\{\/\w+\}\}/g, '');

  return template;
}

/**
 * Generates and saves a lease document to a file
 */
export function generateLeaseToFile(
  outputPath: string,
  requiredFields: RequiredLeaseFields,
  customFields?: Partial<LeaseTemplateData>,
  propertyPreset?: string
): void {
  const lease = generateLease(requiredFields, customFields, propertyPreset);
  fs.writeFileSync(outputPath, lease, 'utf-8');
}

/**
 * Validates that all required fields are provided
 */
export function validateRequiredFields(
  fields: Partial<RequiredLeaseFields>
): { valid: boolean; missing: string[] } {
  const requiredKeys: (keyof RequiredLeaseFields)[] = [
    'LESSOR_NAME',
    'TENANT_NAME',
    'PROPERTY_ADDRESS',
    'STATE_NAME',
    'COUNTY_NAME',
    'ROOM_NUMBER',
    'LEASE_START_DATE',
    'LEASE_END_DATE',
    'MONTHLY_RENT',
    'SECURITY_DEPOSIT',
  ];

  const missing = requiredKeys.filter(
    (key) => !fields[key] || fields[key]?.trim() === ''
  );

  return {
    valid: missing.length === 0,
    missing,
  };
}

// CLI usage example
if (require.main === module) {
  // Example: Generate a sample lease
  const sampleData: RequiredLeaseFields = {
    LESSOR_NAME: 'John Smith',
    TENANT_NAME: 'Jane Doe',
    PROPERTY_ADDRESS: '123 Example St, Anytown NC, 12345',
    STATE_NAME: 'North Carolina',
    COUNTY_NAME: 'Wake',
    ROOM_NUMBER: '1',
    LEASE_START_DATE: '01/01/2026',
    LEASE_END_DATE: '12/31/2026',
    MONTHLY_RENT: '$750',
    SECURITY_DEPOSIT: '$750',
  };

  const lease = generateLease(sampleData);
  console.log('Generated lease preview (first 2000 chars):');
  console.log(lease.substring(0, 2000));
  console.log('\n... (truncated)');
}
