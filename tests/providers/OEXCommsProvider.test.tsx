import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, renderHook } from '@testing-library/react'
import { useContext, type ReactNode } from 'react'
import { OEXCommsProvider } from '../../src/providers/OEXCommsProvider'
import { OEXCommsContext } from '../../src/providers/OEXCommsProvider'
import type { OEXCommsContextValue } from '../../src/types'

// --- Mocks ---

const mockRegister = vi.fn().mockResolvedValue(undefined)
const mockConnect = vi.fn()
const mockDisconnectAll = vi.fn()
const mockUpdateToken = vi.fn()
const mockDestroy = vi.fn()
const mockDeviceOn = vi.fn()

let mockDeviceIsSupported = true

vi.mock('@twilio/voice-sdk', () => {
  const DeviceClass = vi.fn().mockImplementation(() => ({
    register: mockRegister,
    connect: mockConnect,
    disconnectAll: mockDisconnectAll,
    updateToken: mockUpdateToken,
    destroy: mockDestroy,
    on: mockDeviceOn,
    identity: 'test-user',
    state: 'registered',
    isBusy: false,
    calls: [],
  }))
  Object.defineProperty(DeviceClass, 'isSupported', {
    get: () => mockDeviceIsSupported,
  })
  const CallClass = {
    Codec: { Opus: 'opus', PCMU: 'pcmu' },
  }
  return { Device: DeviceClass, Call: CallClass }
})

const mockFetchToken = vi.fn().mockResolvedValue({
  token: 'test-token',
  identity: 'test-user',
  ttl_seconds: 3600,
})
const mockStartAutoRefresh = vi.fn()
const mockTokenManagerDestroy = vi.fn()
const mockOnTokenUpdated = vi.fn().mockReturnValue(() => {})
const mockOnTokenError = vi.fn().mockReturnValue(() => {})

vi.mock('../../src/services/token-manager', () => ({
  TokenManager: vi.fn().mockImplementation(() => ({
    fetchToken: mockFetchToken,
    startAutoRefresh: mockStartAutoRefresh,
    destroy: mockTokenManagerDestroy,
    onTokenUpdated: mockOnTokenUpdated,
    onTokenError: mockOnTokenError,
  })),
}))

const mockApiClientConstructor = vi.fn()

vi.mock('../../src/services/api-client', () => ({
  ApiClient: vi.fn().mockImplementation((...args: unknown[]) => {
    mockApiClientConstructor(...args)
    return {}
  }),
}))

// Helper to read context value
function ContextReader({ onContext }: { onContext: (ctx: OEXCommsContextValue | null) => void }) {
  const ctx = useContext(OEXCommsContext)
  onContext(ctx)
  return null
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
      {children}
    </OEXCommsProvider>
  )
}

describe('OEXCommsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeviceIsSupported = true
    mockFetchToken.mockResolvedValue({
      token: 'test-token',
      identity: 'test-user',
      ttl_seconds: 3600,
    })
  })

  it('creates ApiClient with apiBaseUrl and authToken from props', async () => {
    await act(async () => {
      render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXCommsProvider>,
      )
    })

    expect(mockApiClientConstructor).toHaveBeenCalledWith({
      apiBaseUrl: 'https://api.test.com',
      authToken: 'jwt-123',
    })
  })

  it('creates TokenManager with the ApiClient', async () => {
    const { TokenManager } = await import('../../src/services/token-manager')

    await act(async () => {
      render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXCommsProvider>,
      )
    })

    expect(TokenManager).toHaveBeenCalled()
  })

  it('fetches initial token on mount', async () => {
    await act(async () => {
      render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXCommsProvider>,
      )
    })

    expect(mockFetchToken).toHaveBeenCalled()
  })

  it('creates Twilio Device with the fetched token', async () => {
    const { Device } = await import('@twilio/voice-sdk')

    await act(async () => {
      render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXCommsProvider>,
      )
    })

    expect(Device).toHaveBeenCalledWith('test-token', {
      closeProtection: true,
      codecPreferences: ['opus', 'pcmu'],
      enableImprovedSignalingErrorPrecision: true,
    })
  })

  it('calls device.register() after creation', async () => {
    await act(async () => {
      render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXCommsProvider>,
      )
    })

    expect(mockRegister).toHaveBeenCalled()
  })

  it('starts token auto-refresh after registration', async () => {
    await act(async () => {
      render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXCommsProvider>,
      )
    })

    expect(mockStartAutoRefresh).toHaveBeenCalled()
  })

  it('calls device.updateToken() when tokenManager emits token:updated', async () => {
    await act(async () => {
      render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXCommsProvider>,
      )
    })

    expect(mockOnTokenUpdated).toHaveBeenCalled()

    // Simulate the token:updated callback
    const tokenUpdatedCallback = mockOnTokenUpdated.mock.calls[0][0]
    tokenUpdatedCallback({ token: 'new-token', identity: 'test-user', ttlSeconds: 3600 })

    expect(mockUpdateToken).toHaveBeenCalledWith('new-token')
  })

  it('dispatches error state when initial token fetch fails', async () => {
    mockFetchToken.mockRejectedValueOnce({ code: 401, message: 'Unauthorized' })
    let contextValue: OEXCommsContextValue | null = null

    await act(async () => {
      render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="bad-token">
          <ContextReader onContext={(ctx) => (contextValue = ctx)} />
        </OEXCommsProvider>,
      )
    })

    expect(contextValue!.error).not.toBeNull()
    expect(contextValue!.error!.message).toBe('Unauthorized')
  })

  it('dispatches error state when Device.isSupported is false', async () => {
    mockDeviceIsSupported = false
    let contextValue: OEXCommsContextValue | null = null

    await act(async () => {
      render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <ContextReader onContext={(ctx) => (contextValue = ctx)} />
        </OEXCommsProvider>,
      )
    })

    expect(contextValue!.error).not.toBeNull()
    expect(contextValue!.error!.message).toContain('does not support')
  })

  it('calls device.destroy() on unmount', async () => {
    let unmount: () => void

    await act(async () => {
      const result = render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXCommsProvider>,
      )
      unmount = result.unmount
    })

    act(() => {
      unmount()
    })

    expect(mockDestroy).toHaveBeenCalled()
  })

  it('calls tokenManager.destroy() on unmount', async () => {
    let unmount: () => void

    await act(async () => {
      const result = render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXCommsProvider>,
      )
      unmount = result.unmount
    })

    act(() => {
      unmount()
    })

    expect(mockTokenManagerDestroy).toHaveBeenCalled()
  })

  it('handles tokenWillExpire by fetching new token and calling updateToken', async () => {
    await act(async () => {
      render(
        <OEXCommsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXCommsProvider>,
      )
    })

    // Find the tokenWillExpire handler
    const tokenWillExpireCall = mockDeviceOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'tokenWillExpire',
    )
    expect(tokenWillExpireCall).toBeDefined()

    // Reset fetchToken to return a new token
    mockFetchToken.mockResolvedValueOnce({
      token: 'refreshed-token',
      identity: 'test-user',
      ttl_seconds: 3600,
    })

    // Trigger tokenWillExpire
    await act(async () => {
      await tokenWillExpireCall[1]()
    })

    // Should have called fetchToken again and updateToken with new token
    expect(mockUpdateToken).toHaveBeenCalledWith('refreshed-token')
  })
})
