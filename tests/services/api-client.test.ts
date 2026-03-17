import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiClient } from '../../src/services/api-client'

function mockFetchResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

describe('ApiClient', () => {
  const baseUrl = 'https://api.oex.com'
  const authToken = 'test-jwt-token'
  let client: ApiClient

  beforeEach(() => {
    client = new ApiClient({ apiBaseUrl: baseUrl, authToken })
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('GET request sends correct URL, method, and Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse({ ok: true }))

    await client.get('/api/voice/token')

    expect(fetch).toHaveBeenCalledWith(
      'https://api.oex.com/api/voice/token',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-jwt-token',
        }),
      }),
    )
  })

  it('POST request sends JSON body with correct Content-Type header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse({ ok: true }))

    await client.post('/api/sms', { to: '+1234567890', body: 'Hello' })

    expect(fetch).toHaveBeenCalledWith(
      'https://api.oex.com/api/sms',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ to: '+1234567890', body: 'Hello' }),
      }),
    )
  })

  it('PUT request sends JSON body correctly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse({ ok: true }))

    await client.put('/api/resource/1', { name: 'updated' })

    expect(fetch).toHaveBeenCalledWith(
      'https://api.oex.com/api/resource/1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'updated' }),
      }),
    )
  })

  it('DELETE request sends correct method', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse({ ok: true }))

    await client.delete('/api/resource/1')

    expect(fetch).toHaveBeenCalledWith(
      'https://api.oex.com/api/resource/1',
      expect.objectContaining({
        method: 'DELETE',
      }),
    )
  })

  it('successful response returns parsed JSON typed correctly', async () => {
    const responseData = { token: 'abc', identity: 'user1', ttl_seconds: 3600 }
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse(responseData))

    const result = await client.get<{ token: string; identity: string; ttl_seconds: number }>(
      '/api/voice/token',
    )

    expect(result).toEqual(responseData)
  })

  it('400 error returns OEXError with recoverable: false and detail message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse({ detail: 'Twilio credentials not configured' }, 400),
    )

    await expect(client.get('/api/voice/token')).rejects.toMatchObject({
      code: 400,
      message: 'Twilio credentials not configured',
      recoverable: false,
    })
  })

  it('404 error returns OEXError with recoverable: false', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse({ detail: 'Voice session not found' }, 404),
    )

    await expect(client.get('/api/voice/sessions/xyz')).rejects.toMatchObject({
      code: 404,
      recoverable: false,
    })
  })

  it('429 error triggers retry (fetch is called more than once)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockFetchResponse({ detail: 'Rate limited' }, 429))
      .mockResolvedValueOnce(mockFetchResponse({ ok: true }))

    const result = await client.get('/api/voice/token')

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ ok: true })
  })

  it('503 error triggers retry with exponential backoff', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockFetchResponse({ detail: 'Service unavailable' }, 503))
      .mockResolvedValueOnce(mockFetchResponse({ detail: 'Service unavailable' }, 503))
      .mockResolvedValueOnce(mockFetchResponse({ ok: true }))

    const result = await client.get('/api/voice/token')

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ ok: true })
  })

  it('updateAuthToken changes the token used in subsequent requests', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse({ ok: true }))

    client.updateAuthToken('new-token')
    await client.get('/api/voice/token')

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer new-token',
        }),
      }),
    )
  })
})
