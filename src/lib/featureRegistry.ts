/**
 * Feature Registry - Centralized source of truth for all app features
 *
 * This registry enumerates all features in the application including:
 * - Pages and routes
 * - API endpoints (grouped)
 * - Required roles for access
 * - Dependencies on external services
 */

// ============================================
// Types
// ============================================

export type UserRole = 'public' | 'candidate' | 'coordinator' | 'admin' | 'superadmin';

export type FeatureCategory =
  | 'coordinator'
  | 'candidate'
  | 'operations'
  | 'integrations'
  | 'settings'
  | 'demo';

export type FeatureDependency = 'graph' | 'icims' | 'email' | 'supabase' | 'auth';

export interface Feature {
  id: string;
  name: string;
  description: string;
  route: string;
  category: FeatureCategory;
  roles: UserRole[];
  dependencies: FeatureDependency[];
  isPublicToken?: boolean; // Uses token-based auth instead of session
  icon?: string; // Emoji or icon name
  keywords?: string[]; // For search
}

// ============================================
// Feature Registry
// ============================================

export const FEATURES: Feature[] = [
  // ============================================
  // Coordinator Features
  // ============================================
  {
    id: 'coordinator-dashboard',
    name: 'Coordinator Dashboard',
    description: 'View and manage self-schedule interview requests',
    route: '/coordinator',
    category: 'coordinator',
    roles: ['coordinator', 'admin', 'superadmin'],
    dependencies: ['auth', 'supabase'],
    icon: '📊',
    keywords: ['requests', 'scheduling', 'interviews', 'dashboard'],
  },
  {
    id: 'coordinator-request-detail',
    name: 'Request Detail',
    description: 'View request details, booking, timeline, and sync status',
    route: '/coordinator/[id]',
    category: 'coordinator',
    roles: ['coordinator', 'admin', 'superadmin'],
    dependencies: ['auth', 'supabase', 'graph'],
    icon: '📋',
    keywords: ['request', 'detail', 'booking', 'timeline'],
  },
  {
    id: 'coordinator-availability-dashboard',
    name: 'Availability Dashboard',
    description: 'Manage candidate-provided availability requests',
    route: '/coordinator/availability',
    category: 'coordinator',
    roles: ['coordinator', 'admin', 'superadmin'],
    dependencies: ['auth', 'supabase'],
    icon: '📅',
    keywords: ['availability', 'candidate', 'scheduling'],
  },
  {
    id: 'coordinator-availability-detail',
    name: 'Availability Detail',
    description: 'View candidate availability and book matching times',
    route: '/coordinator/availability/[id]',
    category: 'coordinator',
    roles: ['coordinator', 'admin', 'superadmin'],
    dependencies: ['auth', 'supabase', 'graph'],
    icon: '🗓️',
    keywords: ['availability', 'suggestions', 'booking'],
  },

  // ============================================
  // Candidate Features (Public Token)
  // ============================================
  {
    id: 'candidate-booking',
    name: 'Candidate Booking',
    description: 'Book an interview slot from available times',
    route: '/book/[token]',
    category: 'candidate',
    roles: ['public', 'candidate'],
    dependencies: ['supabase', 'graph'],
    isPublicToken: true,
    icon: '🎯',
    keywords: ['book', 'schedule', 'interview', 'slots'],
  },
  {
    id: 'candidate-availability',
    name: 'Candidate Availability',
    description: 'Submit availability for interview scheduling',
    route: '/availability/[token]',
    category: 'candidate',
    roles: ['public', 'candidate'],
    dependencies: ['supabase'],
    isPublicToken: true,
    icon: '⏰',
    keywords: ['availability', 'times', 'calendar'],
  },

  // ============================================
  // Demo Features
  // ============================================
  {
    id: 'demo-dashboard',
    name: 'Demo Dashboard',
    description: 'Try the scheduling flow with demo data',
    route: '/demo',
    category: 'demo',
    roles: ['public'],
    dependencies: ['supabase'],
    icon: '🎮',
    keywords: ['demo', 'try', 'test'],
  },
  {
    id: 'demo-booking',
    name: 'Demo Booking',
    description: 'Preview the candidate booking experience',
    route: '/book/demo',
    category: 'demo',
    roles: ['public'],
    dependencies: [],
    icon: '🎪',
    keywords: ['demo', 'preview', 'booking'],
  },

  // ============================================
  // Operations Features
  // ============================================
  {
    id: 'ops-dashboard',
    name: 'Ops Dashboard',
    description: 'Monitor system health, webhooks, and reconciliation',
    route: '/ops',
    category: 'operations',
    roles: ['admin', 'superadmin'],
    dependencies: ['auth', 'supabase'],
    icon: '🔧',
    keywords: ['ops', 'health', 'monitoring', 'webhooks', 'reconciliation'],
  },

  // ============================================
  // Settings & Integrations
  // ============================================
  {
    id: 'settings',
    name: 'Settings',
    description: 'Manage account and calendar connections',
    route: '/settings',
    category: 'settings',
    roles: ['coordinator', 'admin', 'superadmin'],
    dependencies: ['auth', 'graph'],
    icon: '⚙️',
    keywords: ['settings', 'account', 'calendar', 'connections'],
  },

  // ============================================
  // Auth
  // ============================================
  {
    id: 'signin',
    name: 'Sign In',
    description: 'Sign in with Google or Microsoft',
    route: '/signin',
    category: 'settings',
    roles: ['public'],
    dependencies: ['auth'],
    icon: '🔐',
    keywords: ['login', 'signin', 'auth'],
  },

  // ============================================
  // Hub
  // ============================================
  {
    id: 'hub',
    name: 'Navigation Hub',
    description: 'Central navigation and system status',
    route: '/hub',
    category: 'settings',
    roles: ['coordinator', 'admin', 'superadmin'],
    dependencies: ['auth'],
    icon: '🏠',
    keywords: ['hub', 'home', 'navigation', 'status'],
  },
];

// ============================================
// Helper Functions
// ============================================

/**
 * Get all features accessible by a given role
 */
export function getFeaturesByRole(role: UserRole): Feature[] {
  return FEATURES.filter((feature) => feature.roles.includes(role));
}

/**
 * Get features by category
 */
export function getFeaturesByCategory(category: FeatureCategory): Feature[] {
  return FEATURES.filter((feature) => feature.category === category);
}

/**
 * Search features by query string
 */
export function searchFeatures(query: string, role?: UserRole): Feature[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) {
    return role ? getFeaturesByRole(role) : FEATURES;
  }

  let features = role ? getFeaturesByRole(role) : FEATURES;

  return features.filter((feature) => {
    const searchableText = [
      feature.name,
      feature.description,
      feature.route,
      ...(feature.keywords || []),
    ]
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

/**
 * Get a feature by its ID
 */
export function getFeatureById(id: string): Feature | undefined {
  return FEATURES.find((feature) => feature.id === id);
}

/**
 * Get a feature by its route (supports dynamic routes)
 */
export function getFeatureByRoute(route: string): Feature | undefined {
  // First try exact match
  const exact = FEATURES.find((feature) => feature.route === route);
  if (exact) return exact;

  // Then try pattern matching for dynamic routes
  return FEATURES.find((feature) => {
    const pattern = feature.route.replace(/\[.*?\]/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(route);
  });
}

/**
 * Get all categories with their features, filtered by role
 */
export function getCategorizedFeatures(role: UserRole): Record<FeatureCategory, Feature[]> {
  const features = getFeaturesByRole(role);
  const result: Record<FeatureCategory, Feature[]> = {
    coordinator: [],
    candidate: [],
    operations: [],
    integrations: [],
    settings: [],
    demo: [],
  };

  for (const feature of features) {
    result[feature.category].push(feature);
  }

  return result;
}

/**
 * Check if a feature requires a specific dependency
 */
export function featureRequiresDependency(
  featureId: string,
  dependency: FeatureDependency
): boolean {
  const feature = getFeatureById(featureId);
  return feature?.dependencies.includes(dependency) ?? false;
}

// ============================================
// Category Metadata
// ============================================

export const CATEGORY_INFO: Record<
  FeatureCategory,
  { name: string; description: string; icon: string }
> = {
  coordinator: {
    name: 'Coordinator',
    description: 'Manage interview scheduling requests',
    icon: '📊',
  },
  candidate: {
    name: 'Candidate',
    description: 'Candidate-facing booking and availability',
    icon: '👤',
  },
  operations: {
    name: 'Operations',
    description: 'System health and monitoring',
    icon: '🔧',
  },
  integrations: {
    name: 'Integrations',
    description: 'External service connections',
    icon: '🔗',
  },
  settings: {
    name: 'Settings',
    description: 'Account and app settings',
    icon: '⚙️',
  },
  demo: {
    name: 'Demo',
    description: 'Try features with demo data',
    icon: '🎮',
  },
};
