/**
 * Feature Registry Tests
 */

import {
  FEATURES,
  getFeaturesByRole,
  getFeaturesByCategory,
  searchFeatures,
  getFeatureById,
  getFeatureByRoute,
  getCategorizedFeatures,
  featureRequiresDependency,
  CATEGORY_INFO,
} from '@/lib/featureRegistry';

describe('Feature Registry', () => {
  describe('FEATURES constant', () => {
    it('should have at least 10 features defined', () => {
      expect(FEATURES.length).toBeGreaterThanOrEqual(10);
    });

    it('should have unique IDs for all features', () => {
      const ids = FEATURES.map((f) => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid categories for all features', () => {
      const validCategories = Object.keys(CATEGORY_INFO);
      for (const feature of FEATURES) {
        expect(validCategories).toContain(feature.category);
      }
    });

    it('should have at least one role for each feature', () => {
      for (const feature of FEATURES) {
        expect(feature.roles.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('getFeaturesByRole', () => {
    it('should return public features for public role', () => {
      const features = getFeaturesByRole('public');
      expect(features.length).toBeGreaterThan(0);
      for (const feature of features) {
        expect(feature.roles).toContain('public');
      }
    });

    it('should return coordinator features for coordinator role', () => {
      const features = getFeaturesByRole('coordinator');
      expect(features.length).toBeGreaterThan(0);
      for (const feature of features) {
        expect(feature.roles).toContain('coordinator');
      }
    });

    it('should return admin features for admin role', () => {
      const features = getFeaturesByRole('admin');
      expect(features.length).toBeGreaterThan(0);
      // Admin should have access to coordinator features
      const hasCoordinatorFeatures = features.some((f) => f.category === 'coordinator');
      expect(hasCoordinatorFeatures).toBe(true);
    });

    it('should include ops dashboard for admin', () => {
      const features = getFeaturesByRole('admin');
      const opsDashboard = features.find((f) => f.id === 'ops-dashboard');
      expect(opsDashboard).toBeDefined();
    });

    it('should not include ops dashboard for coordinator', () => {
      const features = getFeaturesByRole('coordinator');
      const opsDashboard = features.find((f) => f.id === 'ops-dashboard');
      expect(opsDashboard).toBeUndefined();
    });
  });

  describe('getFeaturesByCategory', () => {
    it('should return features by category', () => {
      const coordinatorFeatures = getFeaturesByCategory('coordinator');
      expect(coordinatorFeatures.length).toBeGreaterThan(0);
      for (const feature of coordinatorFeatures) {
        expect(feature.category).toBe('coordinator');
      }
    });

    it('should return demo features', () => {
      const demoFeatures = getFeaturesByCategory('demo');
      expect(demoFeatures.length).toBeGreaterThan(0);
    });

    it('should return operations features', () => {
      const opsFeatures = getFeaturesByCategory('operations');
      expect(opsFeatures.length).toBeGreaterThan(0);
    });
  });

  describe('searchFeatures', () => {
    it('should return all features for empty query', () => {
      const results = searchFeatures('');
      expect(results.length).toBe(FEATURES.length);
    });

    it('should filter by name', () => {
      const results = searchFeatures('coordinator');
      expect(results.length).toBeGreaterThan(0);
      for (const feature of results) {
        const text = `${feature.name} ${feature.description} ${feature.route}`.toLowerCase();
        expect(text).toContain('coordinator');
      }
    });

    it('should filter by route', () => {
      const results = searchFeatures('/ops');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter by keywords', () => {
      const results = searchFeatures('scheduling');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should be case insensitive', () => {
      const resultsLower = searchFeatures('demo');
      const resultsUpper = searchFeatures('DEMO');
      expect(resultsLower.length).toBe(resultsUpper.length);
    });

    it('should respect role filter', () => {
      const allResults = searchFeatures('dashboard');
      const coordinatorResults = searchFeatures('dashboard', 'coordinator');

      // Coordinator shouldn't see ops dashboard
      const allHasOps = allResults.some((f) => f.id === 'ops-dashboard');
      const coordHasOps = coordinatorResults.some((f) => f.id === 'ops-dashboard');

      expect(allHasOps).toBe(true);
      expect(coordHasOps).toBe(false);
    });

    it('should return empty array for no matches', () => {
      const results = searchFeatures('xyznonexistent123');
      expect(results).toEqual([]);
    });
  });

  describe('getFeatureById', () => {
    it('should return feature by ID', () => {
      const feature = getFeatureById('coordinator-dashboard');
      expect(feature).toBeDefined();
      expect(feature?.id).toBe('coordinator-dashboard');
    });

    it('should return undefined for non-existent ID', () => {
      const feature = getFeatureById('non-existent-id');
      expect(feature).toBeUndefined();
    });
  });

  describe('getFeatureByRoute', () => {
    it('should return feature by exact route', () => {
      const feature = getFeatureByRoute('/coordinator');
      expect(feature).toBeDefined();
      expect(feature?.route).toBe('/coordinator');
    });

    it('should return feature by dynamic route pattern', () => {
      const feature = getFeatureByRoute('/coordinator/abc123');
      expect(feature).toBeDefined();
      expect(feature?.route).toBe('/coordinator/[id]');
    });

    it('should return undefined for non-existent route', () => {
      const feature = getFeatureByRoute('/non/existent/route');
      expect(feature).toBeUndefined();
    });
  });

  describe('getCategorizedFeatures', () => {
    it('should return features organized by category', () => {
      const categorized = getCategorizedFeatures('admin');

      expect(categorized.coordinator).toBeDefined();
      expect(categorized.operations).toBeDefined();
      expect(categorized.demo).toBeDefined();
      expect(categorized.settings).toBeDefined();
    });

    it('should filter by role', () => {
      const adminCategorized = getCategorizedFeatures('admin');
      const coordCategorized = getCategorizedFeatures('coordinator');

      // Admin should have operations features
      expect(adminCategorized.operations.length).toBeGreaterThan(0);
      // Coordinator should not
      expect(coordCategorized.operations.length).toBe(0);
    });
  });

  describe('featureRequiresDependency', () => {
    it('should return true if feature requires dependency', () => {
      const requiresGraph = featureRequiresDependency('coordinator-request-detail', 'graph');
      expect(requiresGraph).toBe(true);
    });

    it('should return false if feature does not require dependency', () => {
      const requiresGraph = featureRequiresDependency('demo-booking', 'graph');
      expect(requiresGraph).toBe(false);
    });

    it('should return false for non-existent feature', () => {
      const result = featureRequiresDependency('non-existent', 'graph');
      expect(result).toBe(false);
    });
  });

  describe('CATEGORY_INFO', () => {
    it('should have info for all categories', () => {
      const categories = ['coordinator', 'candidate', 'operations', 'integrations', 'settings', 'demo'];
      for (const category of categories) {
        expect(CATEGORY_INFO[category as keyof typeof CATEGORY_INFO]).toBeDefined();
        expect(CATEGORY_INFO[category as keyof typeof CATEGORY_INFO].name).toBeTruthy();
        expect(CATEGORY_INFO[category as keyof typeof CATEGORY_INFO].icon).toBeTruthy();
      }
    });
  });
});
