/**
 * Recent Visits Tests
 */

import {
  getRecentVisits,
  addRecentVisit,
  clearRecentVisits,
  formatTimeAgo,
} from '@/lib/recentVisits';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('Recent Visits', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe('getRecentVisits', () => {
    it('should return empty array when no visits stored', () => {
      const visits = getRecentVisits();
      expect(visits).toEqual([]);
    });

    it('should return stored visits', () => {
      const storedVisits = [
        { route: '/coordinator', title: 'Dashboard', timestamp: Date.now() },
      ];
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(storedVisits));

      const visits = getRecentVisits();
      expect(visits).toEqual(storedVisits);
    });

    it('should handle invalid JSON gracefully', () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid json');
      const visits = getRecentVisits();
      expect(visits).toEqual([]);
    });
  });

  describe('addRecentVisit', () => {
    it('should add a new visit', () => {
      addRecentVisit('/coordinator', 'Coordinator Dashboard');

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedData = JSON.parse(
        localStorageMock.setItem.mock.calls[0][1]
      );
      expect(savedData[0].route).toBe('/coordinator');
      expect(savedData[0].title).toBe('Coordinator Dashboard');
    });

    it('should skip signin route', () => {
      addRecentVisit('/signin', 'Sign In');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should skip hub route', () => {
      addRecentVisit('/hub', 'Hub');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should skip API routes', () => {
      addRecentVisit('/api/ops/health', 'Health API');
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should limit to 5 recent visits', () => {
      // Add 6 visits
      for (let i = 0; i < 6; i++) {
        localStorageMock.getItem.mockReturnValueOnce(
          JSON.stringify(
            Array.from({ length: i }, (_, j) => ({
              route: `/page${j}`,
              title: `Page ${j}`,
              timestamp: Date.now() - j * 1000,
            }))
          )
        );
        addRecentVisit(`/page${i}`, `Page ${i}`);
      }

      // Check the last save only has 5 items
      const lastCall = localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1];
      const savedData = JSON.parse(lastCall[1]);
      expect(savedData.length).toBeLessThanOrEqual(5);
    });

    it('should move existing route to top', () => {
      const existing = [
        { route: '/page1', title: 'Page 1', timestamp: Date.now() - 1000 },
        { route: '/page2', title: 'Page 2', timestamp: Date.now() - 2000 },
      ];
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(existing));

      addRecentVisit('/page2', 'Page 2 Updated');

      const savedData = JSON.parse(
        localStorageMock.setItem.mock.calls[0][1]
      );
      expect(savedData[0].route).toBe('/page2');
      expect(savedData[0].title).toBe('Page 2 Updated');
      expect(savedData.length).toBe(2);
    });
  });

  describe('clearRecentVisits', () => {
    it('should remove recent visits from storage', () => {
      clearRecentVisits();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('sched_recent_visits');
    });
  });

  describe('formatTimeAgo', () => {
    it('should format just now', () => {
      const result = formatTimeAgo(Date.now() - 30 * 1000);
      expect(result).toBe('Just now');
    });

    it('should format minutes ago', () => {
      const result = formatTimeAgo(Date.now() - 5 * 60 * 1000);
      expect(result).toBe('5m ago');
    });

    it('should format hours ago', () => {
      const result = formatTimeAgo(Date.now() - 3 * 60 * 60 * 1000);
      expect(result).toBe('3h ago');
    });

    it('should format days ago', () => {
      const result = formatTimeAgo(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(result).toBe('2d ago');
    });

    it('should format older dates as date string', () => {
      const oldDate = Date.now() - 10 * 24 * 60 * 60 * 1000;
      const result = formatTimeAgo(oldDate);
      expect(result).toMatch(/\d+\/\d+\/\d+/); // Date format
    });
  });
});
