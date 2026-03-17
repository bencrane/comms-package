import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TokenManager } from '../../src/services/token-manager'
import type { ApiClient } from '../../src/services/api-client'
import type { VoiceTokenResponse } from '../../src/types'

function createMockApiClient(response?: VoiceTokenResponse) {
  return {
    get: vi.fn().mockResolvedValue(
      response ?? {
        token: 'test-token',
        identity: 'user-123',
        ttl_seconds: 3600,
      },
    ),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    updateAuthToken: vi.fn(),
  } as unknown as ApiClient & { get: ReturnType<typeof vi.fn> }
}

describe('TokenManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetchToken calls apiClient.get with /api/voice/token', async () => {
    const apiClient = createMockApiClient()
    const manager = new TokenManager(apiClient)

    await manager.fetchToken()

    expect(apiClient.get).toHaveBeenCalledWith('/api/voice/token')
  })

  it('fetchToken returns the VoiceTokenResponse from the API client', async () => {
    const tokenResponse: VoiceTokenResponse = {
      token: 'my-token',
      identity: 'user-456',
      ttl_seconds: 1800,
    }
    const apiClient = createMockApiClient(tokenResponse)
    const manager = new TokenManager(apiClient)

    const result = await manager.fetchToken()

    expect(result).toEqual(tokenResponse)
  })

  it('startAutoRefresh fetches a token immediately', async () => {
    const apiClient = createMockApiClient()
    const manager = new TokenManager(apiClient)

    manager.startAutoRefresh()
    await vi.advanceTimersByTimeAsync(0)

    expect(apiClient.get).toHaveBeenCalledWith('/api/voice/token')
    manager.destroy()
  })

  it('startAutoRefresh schedules next refresh at ttl_seconds - buffer', async () => {
    const apiClient = createMockApiClient({
      token: 'test-token',
      identity: 'user-123',
      ttl_seconds: 3600,
    })
    const manager = new TokenManager(apiClient)

    manager.startAutoRefresh()
    // Let the initial fetch resolve
    await vi.advanceTimersByTimeAsync(0)

    // Reset call count after initial fetch
    apiClient.get.mockClear()

    // buffer = Math.min(60, 3600 * 0.1) = 60, so refresh at (3600 - 60) * 1000 = 3540000ms
    await vi.advanceTimersByTimeAsync(3539999)
    expect(apiClient.get).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(apiClient.get).toHaveBeenCalledTimes(1)

    manager.destroy()
  })

  it('onTokenUpdated callback fires with token data after successful refresh', async () => {
    const apiClient = createMockApiClient()
    const manager = new TokenManager(apiClient)
    const callback = vi.fn()

    manager.onTokenUpdated(callback)
    manager.startAutoRefresh()
    await vi.advanceTimersByTimeAsync(0)

    expect(callback).toHaveBeenCalledWith({
      token: 'test-token',
      identity: 'user-123',
      ttlSeconds: 3600,
    })

    manager.destroy()
  })

  it('failed refresh retries up to 3 times', async () => {
    const apiClient = createMockApiClient()
    apiClient.get.mockRejectedValue(new Error('Network error'))
    const manager = new TokenManager(apiClient)

    manager.startAutoRefresh()
    // Run through all retries: initial + 3 retries with delays (1s, 2s, 4s)
    await vi.runAllTimersAsync()

    // 1 initial attempt + 3 retries = 4 calls total
    expect(apiClient.get).toHaveBeenCalledTimes(4)

    manager.destroy()
  })

  it('onTokenError callback fires after all retries exhausted', async () => {
    const apiClient = createMockApiClient()
    apiClient.get.mockRejectedValue({ code: 500, message: 'Server error' })
    const manager = new TokenManager(apiClient)
    const errorCallback = vi.fn()

    manager.onTokenError(errorCallback)
    manager.startAutoRefresh()
    await vi.runAllTimersAsync()

    expect(errorCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        recoverable: false,
      }),
    )

    manager.destroy()
  })

  it('destroy clears timers and removes listeners', async () => {
    const apiClient = createMockApiClient()
    const manager = new TokenManager(apiClient)
    const callback = vi.fn()

    manager.onTokenUpdated(callback)
    manager.startAutoRefresh()
    await vi.advanceTimersByTimeAsync(0)

    // callback fired once for initial fetch
    expect(callback).toHaveBeenCalledTimes(1)

    manager.destroy()
    callback.mockClear()

    // Advance past the scheduled refresh — should not fire
    await vi.advanceTimersByTimeAsync(3600000)
    expect(callback).not.toHaveBeenCalled()
  })
})
