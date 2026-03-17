import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useContext, type ReactNode } from 'react'
import { OEXConversationsProvider } from '../../src/providers/OEXConversationsProvider'
import { OEXConversationsContext } from '../../src/providers/OEXConversationsProvider'
import type { OEXConversationsContextValue } from '../../src/types'

// --- Mocks ---

const mockShutdown = vi.fn()
const mockUpdateToken = vi.fn().mockResolvedValue(undefined)
const mockClientOn = vi.fn()

vi.mock('@twilio/conversations', () => ({
  Client: vi.fn().mockImplementation(() => ({
    on: mockClientOn,
    shutdown: mockShutdown,
    updateToken: mockUpdateToken,
  })),
}))

const mockGet = vi.fn().mockResolvedValue({
  token: 'test-conversations-token',
  identity: 'test-user',
  ttl_seconds: 3600,
})

vi.mock('../../src/services/api-client', () => ({
  ApiClient: vi.fn().mockImplementation(() => ({
    get: mockGet,
  })),
}))

// Helper to read context value
function ContextReader({
  onContext,
}: {
  onContext: (ctx: OEXConversationsContextValue | null) => void
}) {
  const ctx = useContext(OEXConversationsContext)
  onContext(ctx)
  return null
}

describe('OEXConversationsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({
      token: 'test-conversations-token',
      identity: 'test-user',
      ttl_seconds: 3600,
    })
  })

  it('fetches token from /api/conversations/token on mount', async () => {
    await act(async () => {
      render(
        <OEXConversationsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXConversationsProvider>,
      )
    })

    expect(mockGet).toHaveBeenCalledWith('/api/conversations/token')
  })

  it('creates Conversations Client with the fetched token', async () => {
    const { Client } = await import('@twilio/conversations')

    await act(async () => {
      render(
        <OEXConversationsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXConversationsProvider>,
      )
    })

    expect(Client).toHaveBeenCalledWith('test-conversations-token')
  })

  it('dispatches clientState initialized when stateChanged fires with initialized', async () => {
    let contextValue: OEXConversationsContextValue | null = null

    await act(async () => {
      render(
        <OEXConversationsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <ContextReader onContext={(ctx) => (contextValue = ctx)} />
        </OEXConversationsProvider>,
      )
    })

    // Find and trigger the stateChanged handler
    const stateChangedCall = mockClientOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'stateChanged',
    )
    expect(stateChangedCall).toBeDefined()

    await act(async () => {
      stateChangedCall![1]('initialized')
    })

    expect(contextValue!.clientState).toBe('initialized')
    expect(contextValue!.identity).toBe('test-user')
  })

  it('dispatches clientState failed when stateChanged fires with failed', async () => {
    let contextValue: OEXConversationsContextValue | null = null

    await act(async () => {
      render(
        <OEXConversationsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <ContextReader onContext={(ctx) => (contextValue = ctx)} />
        </OEXConversationsProvider>,
      )
    })

    const stateChangedCall = mockClientOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'stateChanged',
    )

    await act(async () => {
      stateChangedCall![1]('failed')
    })

    expect(contextValue!.clientState).toBe('failed')
    expect(contextValue!.error).not.toBeNull()
  })

  it('handles tokenAboutToExpire by fetching new token and calling client.updateToken', async () => {
    await act(async () => {
      render(
        <OEXConversationsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXConversationsProvider>,
      )
    })

    const tokenAboutToExpireCall = mockClientOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'tokenAboutToExpire',
    )
    expect(tokenAboutToExpireCall).toBeDefined()

    mockGet.mockResolvedValueOnce({
      token: 'refreshed-token',
      identity: 'test-user',
      ttl_seconds: 3600,
    })

    await act(async () => {
      await tokenAboutToExpireCall![1]()
    })

    expect(mockUpdateToken).toHaveBeenCalledWith('refreshed-token')
  })

  it('calls client.shutdown() on unmount', async () => {
    let unmount: () => void

    await act(async () => {
      const result = render(
        <OEXConversationsProvider apiBaseUrl="https://api.test.com" authToken="jwt-123">
          <div />
        </OEXConversationsProvider>,
      )
      unmount = result.unmount
    })

    act(() => {
      unmount()
    })

    expect(mockShutdown).toHaveBeenCalled()
  })

  it('accepts custom tokenUrl prop', async () => {
    await act(async () => {
      render(
        <OEXConversationsProvider
          apiBaseUrl="https://api.test.com"
          authToken="jwt-123"
          tokenUrl="/api/custom/token"
        >
          <div />
        </OEXConversationsProvider>,
      )
    })

    expect(mockGet).toHaveBeenCalledWith('/api/custom/token')
  })
})
