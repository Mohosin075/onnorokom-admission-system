import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { StudentProvider } from '../context/StudentContext';
import { useStudent } from '../context/student-store';
import { api } from '../services/api';
import type { ClassItem, HoldItem } from '../types';

afterEach(() => vi.useRealTimers());

vi.mock('../services/api', () => ({
  api: { getClasses: vi.fn(), getMyHolds: vi.fn(), getHoldById: vi.fn(),
    createHold: vi.fn(), confirmHold: vi.fn(), cancelHold: vi.fn(), createClass: vi.fn() },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

const STUDENT_A = '20260000000000001';
const STUDENT_B = '20260000000000002';
const hold = (id: string, expiresAt = new Date(Date.now() + 600000).toISOString()): HoldItem => ({
  holdId: id, classId: 'c_test', status: 'HELD', expiresAt,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getClasses).mockResolvedValue([{
    id: 'c_test', name: 'Class 6 - Morning', totalSeats: 5,
    heldSeats: 0, confirmedSeats: 0, availableSeats: 5,
  }]);
  vi.mocked(api.getMyHolds).mockResolvedValue([]);
  vi.mocked(api.getHoldById).mockImplementation(async id => hold(id));
  vi.mocked(api.confirmHold).mockResolvedValue({ holdId: 'h_b', status: 'CONFIRMED' });
});

describe('student identity and restoration', () => {
  it('requires an explicit student ID on a fresh browser', async () => {
    render(<App />);
    expect(screen.getByLabelText('Student ID:')).toHaveValue('');
    expect(await screen.findByRole('button', { name: /Apply Now/i })).toBeDisabled();
  });

  it('restores saved state and clears the previous hold when identity changes', () => {
    localStorage.setItem('school_admission_student_id', STUDENT_A);
    localStorage.setItem('school_admission_active_hold_id', 'h_a');
    function Probe() {
      const student = useStudent();
      return <><output>{student.studentId}:{student.activeHoldId || 'none'}</output>
        <button onClick={() => student.setStudentId(STUDENT_B)}>Switch</button></>;
    }
    const view = render(<StudentProvider><Probe /></StudentProvider>);
    expect(screen.getByRole('status')).toHaveTextContent(`${STUDENT_A}:h_a`);
    fireEvent.click(screen.getByText('Switch'));
    expect(screen.getByRole('status')).toHaveTextContent(`${STUDENT_B}:none`);
    expect(localStorage.getItem('school_admission_active_hold_id')).toBeNull();
    view.unmount();
    render(<StudentProvider><Probe /></StudentProvider>);
    expect(screen.getByRole('status')).toHaveTextContent(`${STUDENT_B}:none`);
  });

  it('ignores a previous student response after switching identity', async () => {
    localStorage.setItem('school_admission_student_id', STUDENT_A);
    localStorage.setItem('school_admission_active_hold_id', 'h_a');
    let resolveOld!: (value: HoldItem) => void;
    const oldResponse = new Promise<HoldItem>(resolve => { resolveOld = resolve; });
    vi.mocked(api.getHoldById).mockImplementation(id => id === 'h_a' ? oldResponse : Promise.resolve(hold(id)));
    vi.mocked(api.getMyHolds).mockImplementation(async id => id === STUDENT_B ? [hold('h_b')] : []);
    render(<App />);
    await waitFor(() => expect(api.getHoldById).toHaveBeenCalledWith('h_a'));
    fireEvent.change(screen.getByLabelText('Student ID:'), { target: { value: STUDENT_B } });
    await screen.findByText('ID: h_b');
    await act(async () => resolveOld(hold('h_a')));
    expect(screen.queryByText('ID: h_a')).not.toBeInTheDocument();
    const pay = await screen.findByRole('button', { name: /Pay Admission Fee/i });
    await waitFor(() => expect(pay).toBeEnabled());
    fireEvent.click(pay);
    await waitFor(() => expect(api.confirmHold).toHaveBeenCalledWith('h_b', STUDENT_B));
  });
});

describe('application status and errors', () => {
  it('shows a successful payment even if a subsequent status read would fail', async () => {
    localStorage.setItem('school_admission_student_id', STUDENT_A);
    localStorage.setItem('school_admission_active_hold_id', 'h_paid');
    vi.mocked(api.getHoldById).mockResolvedValueOnce(hold('h_paid')).mockRejectedValue(new Error('Read unavailable'));
    render(<App />);
    const pay = await screen.findByRole('button', { name: /Pay Admission Fee/i });
    fireEvent.click(pay);
    expect(await screen.findByText('Admission Confirmed')).toBeInTheDocument();
  });

  it('displays slow class responses instead of invalidating them on every poll', async () => {
    vi.useFakeTimers();
    let resolveClasses!: (value: ClassItem[]) => void;
    vi.mocked(api.getClasses).mockReturnValue(new Promise(resolve => { resolveClasses = resolve; }));
    render(<App />);
    await act(async () => { await vi.advanceTimersByTimeAsync(6500); });
    expect(api.getClasses).toHaveBeenCalledTimes(1);
    await act(async () => resolveClasses([{
      id: 'c_slow', name: 'Slow class', totalSeats: 1, heldSeats: 0, confirmedSeats: 0, availableSeats: 1,
    }]));
    expect(screen.getByText('Slow class')).toBeInTheDocument();
  });

  it('does not let a closed class submission overwrite a reopened form', async () => {
    vi.useFakeTimers();
    let resolveCreate!: (value: { id: string; name: string; totalSeats: number }) => void;
    vi.mocked(api.createClass).mockReturnValue(new Promise(resolve => { resolveCreate = resolve; }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Create Class/i }));
    fireEvent.change(screen.getByLabelText('Class & Shift Name'), { target: { value: 'Old class' } });
    fireEvent.submit(screen.getByLabelText('Class & Shift Name').closest('form')!);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: /Create Class/i }));
    fireEvent.change(screen.getByLabelText('Class & Shift Name'), { target: { value: 'New class' } });
    await act(async () => resolveCreate({ id: 'c_old', name: 'Old class', totalSeats: 120 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Class & Shift Name')).toHaveValue('New class');
    expect(screen.getByRole('button', { name: 'Create Class' })).toBeEnabled();
  });

  it('allows payment for a new hold after the previous application expired', async () => {
    localStorage.setItem('school_admission_student_id', STUDENT_A);
    localStorage.setItem('school_admission_active_hold_id', 'h_old');
    vi.mocked(api.getHoldById).mockImplementation(async id =>
      id === 'h_old' ? hold(id, new Date(Date.now() - 1000).toISOString()) : hold(id));
    vi.mocked(api.createHold).mockResolvedValue(hold('h_new'));
    render(<App />);
    expect(await screen.findByRole('button', { name: /Expired/i })).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: /Apply Now/i }));
    await screen.findByText('ID: h_new');
    await waitFor(() => expect(screen.getByRole('button', { name: /Pay Admission Fee/i })).toBeEnabled());
  });

  it('disables payment and updates history at expiry without a reload', async () => {
    localStorage.setItem('school_admission_student_id', STUDENT_A);
    localStorage.setItem('school_admission_active_hold_id', 'h_timer');
    const timedHold = hold('h_timer', new Date(Date.now() + 500).toISOString());
    vi.mocked(api.getHoldById).mockResolvedValue(timedHold);
    vi.mocked(api.getMyHolds).mockResolvedValue([timedHold]);
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Pay Admission Fee/i })).toBeEnabled());
    expect(await screen.findByRole('button', { name: /Expired/i }, { timeout: 2000 })).toBeDisabled();
    expect(await screen.findByText('EXPIRED', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('shows a warning when background seat polling loses the server', async () => {
    vi.mocked(api.getClasses).mockResolvedValueOnce([]).mockRejectedValue(new Error('Server unavailable'));
    render(<App />);
    await screen.findByText('No classes found');
    expect(await screen.findByRole('alert', {}, { timeout: 4500 })).toHaveTextContent('Seat counts may be out of date');
  });

  it('opens an accessible class dialog and restores focus on Escape', () => {
    render(<App />);
    const open = screen.getByRole('button', { name: /Create Class/i });
    open.focus();
    fireEvent.click(open);
    expect(screen.getByRole('dialog', { name: 'Create New Class' })).toBeInTheDocument();
    expect(screen.getByLabelText('Class & Shift Name')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });
});
