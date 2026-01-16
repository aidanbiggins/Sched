/**
 * Recent Visits - Track recently visited pages in localStorage
 */

const STORAGE_KEY = 'sched_recent_visits';
const MAX_VISITS = 5;

export interface RecentVisit {
  route: string;
  title: string;
  timestamp: number;
}

/**
 * Get all recent visits from localStorage
 */
export function getRecentVisits(): RecentVisit[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as RecentVisit[];
  } catch {
    return [];
  }
}

/**
 * Add a visit to the recent visits list
 */
export function addRecentVisit(route: string, title: string): void {
  if (typeof window === 'undefined') return;

  // Skip certain routes
  const skipRoutes = ['/signin', '/hub', '/api/', '/_next/'];
  if (skipRoutes.some((skip) => route.includes(skip))) return;

  try {
    const visits = getRecentVisits();

    // Remove existing entry for this route
    const filtered = visits.filter((v) => v.route !== route);

    // Add new entry at the beginning
    const newVisit: RecentVisit = {
      route,
      title,
      timestamp: Date.now(),
    };

    const updated = [newVisit, ...filtered].slice(0, MAX_VISITS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Clear all recent visits
 */
export function clearRecentVisits(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Format time ago string
 */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
