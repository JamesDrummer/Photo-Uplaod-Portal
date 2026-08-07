import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-turnstile', () => ({
  default: ({ onError, onVerify, onExpire }: { onError: () => void; onVerify: (token: string) => void; onExpire: () => void }) => <>
    <button type="button" onClick={onError}>Fail security check</button>
    <button type="button" onClick={() => onVerify('test-token')}>Pass security check</button>
    <button type="button" onClick={onExpire}>Expire security check</button>
  </>,
}));
vi.mock('../utils/sessionStorage', () => ({ saveSession: vi.fn(), getSession: vi.fn().mockResolvedValue(null) }));

beforeEach(() => vi.stubEnv('VITE_APP_EVENT_PASSWORD', 'wedding-secret'));
afterEach(() => vi.useRealTimers());

describe('PasswordScreen Turnstile fallback', () => {
  it('allows password-only entry after a widget error and explains the fallback', async () => {
    const { PasswordScreen } = await import('./PasswordScreen');
    const onSuccess = vi.fn();
    render(<PasswordScreen onSuccess={onSuccess} />);

    expect(screen.getByRole('button', { name: 'Enter' })).toBeDisabled();
    expect(screen.getByTestId('turnstile-container')).not.toHaveClass('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Fail security check' }));
    expect(screen.getByText(/security check is unavailable/i)).toBeInTheDocument();
    expect(screen.getByTestId('turnstile-container')).toHaveClass('hidden');
    expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alex' } });
    fireEvent.change(screen.getByLabelText('Event Password'), { target: { value: 'wedding-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('Alex'));
  });

  it('allows password-only entry when the widget does not respond in time', async () => {
    vi.useFakeTimers();
    const { PasswordScreen } = await import('./PasswordScreen');
    render(<PasswordScreen onSuccess={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Enter' })).toBeDisabled();
    await act(async () => vi.advanceTimersByTimeAsync(8_000));
    expect(screen.getByText(/security check is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled();
  });

  it('clears a stale fallback notice after verification and disables entry again on expiry', async () => {
    const { PasswordScreen } = await import('./PasswordScreen');
    render(<PasswordScreen onSuccess={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fail security check' }));
    expect(screen.getByText(/security check is unavailable/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pass security check' }));
    expect(screen.queryByText(/security check is unavailable/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Expire security check' }));
    expect(screen.getByRole('button', { name: 'Enter' })).toBeDisabled();
  });
});
