import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { CallBar } from '../../src/components/CallBar'
import { useVoice } from '../../src/hooks/useVoice'
import { useDevice } from '../../src/hooks/useDevice'
import { useCallActions } from '../../src/hooks/useCallActions'

vi.mock('../../src/hooks/useVoice', () => ({ useVoice: vi.fn() }))
vi.mock('../../src/hooks/useDevice', () => ({ useDevice: vi.fn() }))
vi.mock('../../src/hooks/useCallActions', () => ({ useCallActions: vi.fn() }))

const mockUseVoice = useVoice as ReturnType<typeof vi.fn>
const mockUseDevice = useDevice as ReturnType<typeof vi.fn>
const mockUseCallActions = useCallActions as ReturnType<typeof vi.fn>

function setupMocks(overrides: {
  callState?: string
  callInfo?: Record<string, unknown> | null
  deviceReady?: boolean
  isOnHold?: boolean
} = {}) {
  const toggleMute = vi.fn()
  const disconnect = vi.fn()
  const hold = vi.fn()
  const unhold = vi.fn()

  mockUseVoice.mockReturnValue({
    connect: vi.fn(),
    disconnect,
    sendDigits: vi.fn(),
    mute: vi.fn(),
    toggleMute,
    acceptIncoming: vi.fn(),
    rejectIncoming: vi.fn(),
    callInfo: overrides.callInfo ?? null,
    callState: overrides.callState ?? 'idle',
    deviceReady: overrides.deviceReady ?? true,
    error: null,
  })

  mockUseDevice.mockReturnValue({
    state: 'registered',
    deviceReady: overrides.deviceReady ?? true,
    isBusy: false,
    identity: 'test-user',
    error: null,
  })

  mockUseCallActions.mockReturnValue({
    hold,
    unhold,
    isOnHold: overrides.isOnHold ?? false,
    isLoading: false,
    error: null,
  })

  return { toggleMute, disconnect, hold, unhold }
}

describe('CallBar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders with data-state matching callState from useVoice', () => {
    setupMocks({ callState: 'ringing' })
    const { container } = render(<CallBar />)
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('ringing')
  })

  it('timer starts counting when callState is open', () => {
    setupMocks({ callState: 'open', callInfo: { from: '+1', to: '+2', isMuted: false, callSid: 'CA1', direction: 'outbound' } })
    render(<CallBar />)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByRole('timer').textContent).toBe('00:03')
  })

  it('timer resets to 0 when callState returns to idle', () => {
    const { toggleMute } = setupMocks({ callState: 'open', callInfo: { from: '+1', to: '+2', isMuted: false, callSid: 'CA1', direction: 'outbound' } })
    const { rerender } = render(<CallBar />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByRole('timer').textContent).toBe('00:05')

    // Change callState to idle
    setupMocks({ callState: 'idle' })
    rerender(<CallBar />)
    expect(screen.getByRole('timer').textContent).toBe('00:00')
  })

  it('mute button calls toggleMute and has correct aria-pressed', () => {
    const { toggleMute } = setupMocks({
      callState: 'open',
      callInfo: { from: '+1', to: '+2', isMuted: true, callSid: 'CA1', direction: 'outbound' },
    })
    render(<CallBar />)
    const btn = screen.getByLabelText('Unmute')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(btn)
    expect(toggleMute).toHaveBeenCalled()
  })

  it('hold button calls hold/unhold and has correct aria-pressed', () => {
    const { hold } = setupMocks({
      callState: 'open',
      callInfo: { from: '+1', to: '+2', isMuted: false, callSid: 'CA1', direction: 'outbound' },
      isOnHold: false,
    })
    render(<CallBar />)
    const btn = screen.getByLabelText('Hold')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(btn)
    expect(hold).toHaveBeenCalled()
  })

  it('hangup button calls disconnect', () => {
    const { disconnect } = setupMocks({
      callState: 'open',
      callInfo: { from: '+1', to: '+2', isMuted: false, callSid: 'CA1', direction: 'outbound' },
    })
    render(<CallBar />)
    fireEvent.click(screen.getByLabelText('Hang up'))
    expect(disconnect).toHaveBeenCalled()
  })

  it('disposition callback fires with callSid when triggered', () => {
    setupMocks({
      callState: 'closed',
      callInfo: { from: '+1', to: '+2', isMuted: false, callSid: 'CA123', direction: 'outbound' },
    })
    const onDisposition = vi.fn()
    render(<CallBar onDisposition={onDisposition} />)
    fireEvent.click(screen.getByLabelText('Disposition'))
    expect(onDisposition).toHaveBeenCalledWith('CA123')
  })

  it('CallerInfo subcomponent renders from/to from callInfo', () => {
    setupMocks({
      callState: 'open',
      callInfo: { from: '+15551111111', to: '+15552222222', isMuted: false, callSid: 'CA1', direction: 'outbound' },
    })
    render(
      <CallBar>
        <CallBar.CallerInfo />
      </CallBar>,
    )
    expect(screen.getByText('+15551111111')).toBeDefined()
    expect(screen.getByText('+15552222222')).toBeDefined()
  })
})
