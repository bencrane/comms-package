import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useDevice } from '../../src/hooks/useDevice'
import { OEXCommsContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue } from '../../src/types'

// Suppress console.error for the "outside provider" test
vi.spyOn(console, 'error').mockImplementation(() => {})

function createMockContext(overrides?: Partial<OEXCommsContextValue>): OEXCommsContextValue {
  return {
    deviceState: 'unregistered',
    deviceReady: false,
    identity: null,
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

describe('useDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns deviceState from context', () => {
    const context = createMockContext({ deviceState: 'registering' })
    const { result } = renderHook(() => useDevice(), { wrapper: createWrapper(context) })

    expect(result.current.state).toBe('registering')
  })

  it('returns deviceReady as true when state is registered', () => {
    const context = createMockContext({ deviceState: 'registered', deviceReady: true })
    const { result } = renderHook(() => useDevice(), { wrapper: createWrapper(context) })

    expect(result.current.deviceReady).toBe(true)
  })

  it('returns deviceReady as false when state is not registered', () => {
    const context = createMockContext({ deviceState: 'unregistered', deviceReady: false })
    const { result } = renderHook(() => useDevice(), { wrapper: createWrapper(context) })

    expect(result.current.deviceReady).toBe(false)
  })

  it('returns identity from context', () => {
    const context = createMockContext({ identity: 'agent-42' })
    const { result } = renderHook(() => useDevice(), { wrapper: createWrapper(context) })

    expect(result.current.identity).toBe('agent-42')
  })

  it('throws error when used outside OEXCommsProvider', () => {
    expect(() => {
      renderHook(() => useDevice())
    }).toThrow('useDevice must be used within an OEXCommsProvider')
  })
})
