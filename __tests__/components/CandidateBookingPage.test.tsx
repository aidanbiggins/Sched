/**
 * UI tests for Candidate Booking Page
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Mock the page component with params
jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    use: (promise: Promise<{ token: string }>) => ({ token: 'test-token' }),
  };
});

// Import after mocking
import CandidateBookingPage from '@/app/book/[token]/page';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('CandidateBookingPage', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  const createParams = (token: string): Promise<{ token: string }> => {
    return Promise.resolve({ token });
  };

  it('renders loading skeleton initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<CandidateBookingPage params={createParams('test-token')} />);
    // Should show loading animation (Tailwind animate-pulse)
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders error state when fetch fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Link expired' }),
    });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('Unable to Load')).toBeInTheDocument();
      expect(screen.getByText('Link expired')).toBeInTheDocument();
    });
  });

  it('renders retry button on error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Network error' }),
    });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });
  });

  it('renders available slots grouped by date', async () => {
    const mockData = {
      request: {
        candidateName: 'John Doe',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
      },
      slots: [
        {
          slotId: 'slot-1',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          displayStart: '9:00 AM',
          displayEnd: '10:00 AM',
        },
        {
          slotId: 'slot-2',
          start: '2026-01-15T15:00:00Z',
          end: '2026-01-15T16:00:00Z',
          displayStart: '10:00 AM',
          displayEnd: '11:00 AM',
        },
      ],
      timezone: 'America/New_York',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('Schedule Your Interview')).toBeInTheDocument();
      expect(screen.getByText(/Software Engineer/)).toBeInTheDocument();
    });
  });

  it('shows no slots available message when empty', async () => {
    const mockData = {
      request: {
        candidateName: 'John Doe',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
      },
      slots: [],
      timezone: 'America/New_York',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('No Available Times')).toBeInTheDocument();
      expect(
        screen.getByText(/There are no time slots available/)
      ).toBeInTheDocument();
    });
  });

  it('shows refresh button when no slots', async () => {
    const mockData = {
      request: {
        candidateName: 'John Doe',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
      },
      slots: [],
      timezone: 'America/New_York',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('Refresh Availability')).toBeInTheDocument();
    });
  });

  it('allows selecting a slot and going to confirm step', async () => {
    const mockData = {
      request: {
        candidateName: 'John Doe',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
      },
      slots: [
        {
          slotId: 'slot-1',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          displayStart: '9:00 AM',
          displayEnd: '10:00 AM',
        },
      ],
      timezone: 'America/New_York',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    });

    // Select slot
    const slotButton = screen.getByText('9:00 AM').closest('button');
    fireEvent.click(slotButton!);

    // Check that slot is selected (has Tailwind selected styling)
    expect(slotButton).toHaveClass('bg-blue-600');

    // Click continue to go to confirm step
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    // Should show confirm screen
    await waitFor(() => {
      expect(screen.getByText('Confirm Your Interview')).toBeInTheDocument();
      expect(screen.getByText('Confirm Booking')).toBeInTheDocument();
    });
  });

  it('disables continue button when no slot selected', async () => {
    const mockData = {
      request: {
        candidateName: 'John Doe',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
      },
      slots: [
        {
          slotId: 'slot-1',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          displayStart: '9:00 AM',
          displayEnd: '10:00 AM',
        },
      ],
      timezone: 'America/New_York',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('Continue')).toBeInTheDocument();
    });

    // The button text is wrapped in a span, so we need to find the parent button
    const continueButton = screen.getByText('Continue').closest('button');
    expect(continueButton).toBeDisabled();
  });

  it('shows confirmation after successful booking', async () => {
    const mockData = {
      request: {
        candidateName: 'John Doe',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
      },
      slots: [
        {
          slotId: 'slot-1',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          displayStart: '9:00 AM',
          displayEnd: '10:00 AM',
        },
      ],
      timezone: 'America/New_York',
    };

    const bookingResult = {
      success: true,
      booking: {
        id: 'booking-1',
        scheduledStart: '2026-01-15T14:00:00Z',
        scheduledEnd: '2026-01-15T15:00:00Z',
        conferenceJoinUrl: 'https://teams.microsoft.com/meeting123',
      },
      message: 'Interview booked successfully',
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(bookingResult),
      });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    });

    // Select slot
    const slotButton = screen.getByText('9:00 AM').closest('button');
    fireEvent.click(slotButton!);

    // Click continue
    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    // Wait for confirm screen
    await waitFor(() => {
      expect(screen.getByText('Confirm Booking')).toBeInTheDocument();
    });

    // Click confirm
    const confirmButton = screen.getByText('Confirm Booking');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Interview Confirmed')).toBeInTheDocument();
      expect(screen.getByText('Join Meeting')).toBeInTheDocument();
    });
  });

  it('shows error when booking fails', async () => {
    const mockData = {
      request: {
        candidateName: 'John Doe',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
      },
      slots: [
        {
          slotId: 'slot-1',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          displayStart: '9:00 AM',
          displayEnd: '10:00 AM',
        },
      ],
      timezone: 'America/New_York',
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Slot no longer available' }),
      });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    });

    // Select slot
    const slotButton = screen.getByText('9:00 AM').closest('button');
    fireEvent.click(slotButton!);

    // Click continue
    fireEvent.click(screen.getByText('Continue'));

    // Wait for confirm screen
    await waitFor(() => {
      expect(screen.getByText('Confirm Booking')).toBeInTheDocument();
    });

    // Click confirm
    fireEvent.click(screen.getByText('Confirm Booking'));

    await waitFor(() => {
      expect(screen.getByText('Slot no longer available')).toBeInTheDocument();
    });
  });

  it('allows going back from confirm step', async () => {
    const mockData = {
      request: {
        candidateName: 'John Doe',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
      },
      slots: [
        {
          slotId: 'slot-1',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          displayStart: '9:00 AM',
          displayEnd: '10:00 AM',
        },
      ],
      timezone: 'America/New_York',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    });

    // Select slot and continue
    fireEvent.click(screen.getByText('9:00 AM').closest('button')!);
    fireEvent.click(screen.getByText('Continue'));

    // Wait for confirm screen
    await waitFor(() => {
      expect(screen.getByText('Confirm Your Interview')).toBeInTheDocument();
    });

    // Click back
    fireEvent.click(screen.getByText('Back'));

    // Should be back on select screen
    await waitFor(() => {
      expect(screen.getByText('Continue')).toBeInTheDocument();
    });
  });

  it('shows timezone selector', async () => {
    const mockData = {
      request: {
        candidateName: 'John Doe',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
      },
      slots: [
        {
          slotId: 'slot-1',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          displayStart: '9:00 AM',
          displayEnd: '10:00 AM',
        },
      ],
      timezone: 'America/New_York',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Select your timezone')).toBeInTheDocument();
    });
  });

  it('disables confirm button while booking in progress', async () => {
    const mockData = {
      request: {
        candidateName: 'John Doe',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
      },
      slots: [
        {
          slotId: 'slot-1',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          displayStart: '9:00 AM',
          displayEnd: '10:00 AM',
        },
      ],
      timezone: 'America/New_York',
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })
      .mockImplementationOnce(() => new Promise(() => {})); // Never resolves to simulate loading

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    });

    // Select slot and continue
    fireEvent.click(screen.getByText('9:00 AM').closest('button')!);
    fireEvent.click(screen.getByText('Continue'));

    // Wait for confirm screen and click
    await waitFor(() => {
      expect(screen.getByText('Confirm Booking')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Confirm Booking'));

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText('Confirming...')).toBeInTheDocument();
    });
  });

  it('prevents double-click booking by disabling button', async () => {
    const mockData = {
      request: {
        candidateName: 'John Doe',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
      },
      slots: [
        {
          slotId: 'slot-1',
          start: '2026-01-15T14:00:00Z',
          end: '2026-01-15T15:00:00Z',
          displayStart: '9:00 AM',
          displayEnd: '10:00 AM',
        },
      ],
      timezone: 'America/New_York',
    };

    let bookingCallCount = 0;
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })
      .mockImplementation(() => {
        bookingCallCount++;
        return new Promise(() => {}); // Never resolves
      });

    render(<CandidateBookingPage params={createParams('test-token')} />);

    await waitFor(() => {
      expect(screen.getByText('9:00 AM')).toBeInTheDocument();
    });

    // Select slot and continue
    fireEvent.click(screen.getByText('9:00 AM').closest('button')!);
    fireEvent.click(screen.getByText('Continue'));

    // Wait for confirm screen
    await waitFor(() => {
      expect(screen.getByText('Confirm Booking')).toBeInTheDocument();
    });

    const confirmButton = screen.getByText('Confirm Booking');

    // Click confirm multiple times rapidly
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    // Wait a bit for state updates
    await waitFor(() => {
      expect(screen.getByText('Confirming...')).toBeInTheDocument();
    });

    // Only one booking call should have been made
    expect(bookingCallCount).toBe(1);
  });
});
