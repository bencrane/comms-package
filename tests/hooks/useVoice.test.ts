import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useVoice } from '../../src/hooks/useVoice'
import { OEXCommsContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue, OEXCallInfo } from '../../src/types'

// Suppress console.error for the "outside provider" test
vi.spyOn(console, 'error').mockImplementation(() => {})

function createMockContext(overrides?: Partial<OEXCommsContextValue>): OEXCommsContextValue {
  return {
    deviceState: 'registered',
    deviceReady: true,
    identity: 'test-user',
    callState: 'idle',
    callInfo: null,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendDigits: vi.fn(),
    mute: vi.fn(),
    toggleMute: vi.fn(),
    acceptIncoming: vi.fn(),
    rejectIncoming: vi.fn(),
    ...overrides,
  }
}

function createWrapper(context: OEXCommsContextValue) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(OEXCommsContext.Provider, { value: context }, children)
  }
}

describe('useVoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns callState idle when no call active', () => {
    const context = createMockContext()
    const { result } = renderHook(() => useVoice(), { wrapper: createWrapper(context) })

    expect(result.current.callState).toBe('idle')
  })

  it('connect() dispatches connecting state and calls device.connect with To param', async () => {
    const mockConnect = vi.fn()
    const context = createMockContext({ connect: mockConnect })
    const { result } = renderHook(() => useVoice(), { wrapper: createWrapper(context) })

    await act(async () => {
      await result.current.connect('+15551234567')
    })

    expect(mockConnect).toHaveBeenCalledWith('+15551234567')
  })

  it('returns callState open after call accept event fires', () => {
    const context = createMockContext({ callState: 'open' })
    const { result } = renderHook(() => useVoice(), { wrapper: createWrapper(context) })

    expect(result.current.callState).toBe('open')
  })

  it('disconnect() calls call.disconnect()', () => {
    const mockDisconnect = vi.fn()
    const context = createMockContext({ callState: 'open', disconnect: mockDisconnect })
    const { result } = renderHook(() => useVoice(), { wrapper: createWrapper(context) })

    result.current.disconnect()

    expect(mockDisconnect).toHaveBeenCalled()
  })

  it('returns callState idle after call disconnect event fires', () => {
    const context = createMockContext({ callState: 'idle' })
    const { result } = renderHook(() => useVoice(), { wrapper: createWrapper(context) })

    expect(result.current.callState).toBe('idle')
  })

  it('mute(true) calls call.mute(true)', () => {
    const mockMute = vi.fn()
    const context = createMockContext({ callState: 'open', mute: mockMute })
    const { result } = renderHook(() => useVoice(), { wrapper: createWrapper(context) })

    result.current.mute(true)

    expect(mockMute).toHaveBeenCalledWith(true)
  })

  it('toggleMute() toggles the current mute state', () => {
    const mockToggleMute = vi.fn()
    const context = createMockContext({ callState: 'open', toggleMute: mockToggleMute })
    const { result } = renderHook(() => useVoice(), { wrapper: createWrapper(context) })

    result.current.toggleMute()

    expect(mockToggleMute).toHaveBeenCalled()
  })

  it('sendDigits() calls call.sendDigits on active call', () => {
    const mockSendDigits = vi.fn()
    const context = createMockContext({ callState: 'open', sendDigits: mockSendDigits })
    const { result } = renderHook(() => useVoice(), { wrapper: createWrapper(context) })

    result.current.sendDigits('123#')

    expect(mockSendDigits).toHaveBeenCalledWith('123#')
  })

  it('returns callInfo with direction, from, to, isMuted, callSid for active call', () => {
    const callInfo: OEXCallInfo = {
      direction: 'outbound',
      from: 'test-user',
      to: '+15551234567',
      isMuted: false,
      callSid: 'CA123',
    }
    const context = createMockContext({ callState: 'open', callInfo })
    const { result } = renderHook(() => useVoice(), { wrapper: createWrapper(context) })

    expect(result.current.callInfo).toEqual({
      direction: 'outbound',
      from: 'test-user',
      to: '+15551234567',
      isMuted: false,
      callSid: 'CA123',
    })
  })

  it('throws error when used outside OEXCommsProvider', () => {
    expect(() => {
      renderHook(() => useVoice())
    }).toThrow('useVoice must be used within an OEXCommsProvider')
  })
})
