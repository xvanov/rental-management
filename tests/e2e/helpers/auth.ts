/**
 * Create the X-Test-Auth header value for authenticated API calls.
 * Format: userId:organizationId:orgRole
 * Only works in non-production environments.
 */
export function createTestAuthHeader(
  userId: string,
  organizationId: string,
  orgRole: string = "ADMIN"
): string {
  return `${userId}:${organizationId}:${orgRole}`;
}
