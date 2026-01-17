/**
 * UI tests for Coordinator Dashboard
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CoordinatorPage from '@/app/coordinator/page';

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
      },
      expires: '2099-01-01T00:00:00.000Z',
    },
    status: 'authenticated',
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock next/navigation
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => null,
  }),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('CoordinatorDashboard', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockReplace.mockClear();
  });

  it('renders loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<CoordinatorPage />);
    // The Suspense fallback or loading state
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('renders empty state when no requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        requests: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        counts: { all: 0, pending: 0, booked: 0, cancelled: 0, rescheduled: 0 },
      }),
    });

    render(<CoordinatorPage />);

    await waitFor(() => {
      expect(screen.getByText('No scheduling requests yet')).toBeInTheDocument();
    });
  });

  it('renders requests in a table', async () => {
    const mockRequests = {
      requests: [
        {
          requestId: 'req-1',
          candidateName: 'John Doe',
          candidateEmail: 'john@example.com',
          reqTitle: 'Software Engineer',
          interviewType: 'phone_screen',
          interviewerEmails: ['interviewer@company.com'],
          status: 'pending',
          createdAt: new Date().toISOString(),
          ageDays: 0,
          booking: null,
          syncStatus: null,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      counts: { all: 1, pending: 1, booked: 0, cancelled: 0, rescheduled: 0 },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRequests),
    });

    render(<CoordinatorPage />);

    await waitFor(() => {
      // Both mobile and desktop views render
      expect(screen.getAllByText('John Doe').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('john@example.com').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('pending').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows error state when fetch fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
    });

    render(<CoordinatorPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch requests')).toBeInTheDocument();
    });
  });

  it('opens create form when button clicked', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        requests: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        counts: { all: 0, pending: 0, booked: 0, cancelled: 0, rescheduled: 0 },
      }),
    });

    render(<CoordinatorPage />);

    await waitFor(() => {
      expect(screen.getByText('No scheduling requests yet')).toBeInTheDocument();
    });

    // Click the header button
    const headerButton = screen.getByRole('button', { name: '+ New Request' });
    fireEvent.click(headerButton);

    // Form should be visible with input fields
    expect(screen.getByPlaceholderText('John Smith')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('john@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Senior Software Engineer')).toBeInTheDocument();
  });

  it('has correct status badge colors', async () => {
    const mockRequests = {
      requests: [
        {
          requestId: 'req-1',
          candidateName: 'Pending User',
          candidateEmail: 'pending@example.com',
          reqTitle: 'Engineer',
          interviewType: 'phone_screen',
          interviewerEmails: ['int@company.com'],
          status: 'pending',
          createdAt: new Date().toISOString(),
          ageDays: 0,
          booking: null,
          syncStatus: null,
        },
        {
          requestId: 'req-2',
          candidateName: 'Booked User',
          candidateEmail: 'booked@example.com',
          reqTitle: 'Engineer',
          interviewType: 'phone_screen',
          interviewerEmails: ['int@company.com'],
          status: 'booked',
          createdAt: new Date().toISOString(),
          ageDays: 1,
          booking: {
            id: 'book-1',
            scheduledStart: new Date().toISOString(),
            scheduledEnd: new Date().toISOString(),
            status: 'confirmed',
          },
          syncStatus: null,
        },
      ],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      counts: { all: 2, pending: 1, booked: 1, cancelled: 0, rescheduled: 0 },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRequests),
    });

    render(<CoordinatorPage />);

    await waitFor(() => {
      // Both mobile and desktop views render badges
      const pendingBadges = screen.getAllByText('pending');
      const bookedBadges = screen.getAllByText('booked');

      expect(pendingBadges.length).toBeGreaterThanOrEqual(1);
      expect(bookedBadges.length).toBeGreaterThanOrEqual(1);

      // New color classes use amber/emerald instead of yellow/green
      expect(pendingBadges[0]).toHaveClass('bg-amber-100');
      expect(bookedBadges[0]).toHaveClass('bg-emerald-100');
    });
  });

  it('shows view link for all requests', async () => {
    const mockRequests = {
      requests: [
        {
          requestId: 'req-1',
          candidateName: 'John Doe',
          candidateEmail: 'john@example.com',
          reqTitle: 'Software Engineer',
          interviewType: 'phone_screen',
          interviewerEmails: ['interviewer@company.com'],
          status: 'pending',
          createdAt: new Date().toISOString(),
          ageDays: 0,
          booking: null,
          syncStatus: null,
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      counts: { all: 1, pending: 1, booked: 0, cancelled: 0, rescheduled: 0 },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRequests),
    });

    render(<CoordinatorPage />);

    await waitFor(() => {
      // Both mobile and desktop views render "View" links
      const viewLinks = screen.getAllByText('View');
      expect(viewLinks.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays status tabs with counts', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        requests: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        counts: { all: 5, pending: 2, booked: 2, cancelled: 1, rescheduled: 0 },
      }),
    });

    render(<CoordinatorPage />);

    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Booked')).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
      // Check counts are displayed - use getAllByText since "2" appears twice
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getAllByText('2')).toHaveLength(2); // Both pending and booked have 2
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  it('has search input', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        requests: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        counts: { all: 0, pending: 0, booked: 0, cancelled: 0, rescheduled: 0 },
      }),
    });

    render(<CoordinatorPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Email, Application ID, or Request ID')).toBeInTheDocument();
    });
  });
});
