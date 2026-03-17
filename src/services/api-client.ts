import type { OEXError } from '../types'
import { createOEXError, isRecoverableHttpStatus } from '../utils/errors'
import { RETRY_BASE_DELAY_MS, MAX_API_RETRIES } from '../utils/constants'

interface RequestOptions {
  body?: unknown
  params?: Record<string, string>
}

export class ApiClient {
  private apiBaseUrl: string
  private authToken: string

  constructor({ apiBaseUrl, authToken }: { apiBaseUrl: string; authToken: string }) {
    this.apiBaseUrl = apiBaseUrl
    this.authToken = authToken
  }

  updateAuthToken(token: string): void {
    this.authToken = token
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, { params })
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, { body })
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body })
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }

  private async request<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    let url = `${this.apiBaseUrl}${path}`
    if (options?.params) {
      const searchParams = new URLSearchParams(options.params)
      url += `?${searchParams.toString()}`
    }

    let lastError: OEXError | undefined

    for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt++) {
      if (attempt > 0) {
        const jitter = Math.random() * 100
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      }

      const fetchOptions: RequestInit = { method, headers }
      if (options?.body !== undefined) {
        fetchOptions.body = JSON.stringify(options.body)
      }

      const response = await fetch(url, fetchOptions)

      if (response.ok) {
        return (await response.json()) as T
      }

      if (isRecoverableHttpStatus(response.status) && attempt < MAX_API_RETRIES) {
        lastError = createOEXError(
          response.status,
          `Request failed with status ${response.status}`,
          true,
        )
        continue
      }

      let message: string
      try {
        const errorBody = (await response.json()) as { detail?: string }
        message = errorBody.detail ?? `Request failed with status ${response.status}`
      } catch {
        message = `Request failed with status ${response.status}`
      }

      throw createOEXError(response.status, message)
    }

    throw lastError ?? createOEXError(500, 'Request failed after retries')
  }
}
