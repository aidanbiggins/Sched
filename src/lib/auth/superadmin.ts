/**
 * Superadmin Utilities
 *
 * Superadmin status is determined by SUPERADMIN_EMAILS environment variable.
 * Default includes aidanbiggins@gmail.com.
 */

const DEFAULT_SUPERADMINS = ['aidanbiggins@gmail.com'];

/**
 * Get the list of superadmin emails from environment
 */
export function getSuperadminEmails(): string[] {
  const envEmails = process.env.SUPERADMIN_EMAILS;
  if (!envEmails) {
    return DEFAULT_SUPERADMINS;
  }
  return envEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Check if an email is a superadmin
 */
export function isSuperadmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const superadmins = getSuperadminEmails();
  return superadmins.includes(email.toLowerCase());
}
