import type { VoiceTokenResponse, TokenUpdatedEvent, TokenErrorEvent } from '../types'
import type { ApiClient } from './api-client'
import { EventBus } from './event-bus'
import {
  DEFAULT_TOKEN_REFRESH_BUFFER_SECONDS,
  MAX_TOKEN_REFRESH_RETRIES,
  RETRY_BASE_DELAY_MS,
} from '../utils/constants'

export class TokenManager {
  private apiClient: ApiClient
  private eventBus: EventBus
  private refreshTimer: ReturnType<typeof setTimeout> | null = null

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
    this.eventBus = new EventBus()
  }

  async fetchToken(): Promise<VoiceTokenResponse> {
    return this.apiClient.get<VoiceTokenResponse>('/api/voice/token')
  }

  startAutoRefresh(): void {
    this.refresh()
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  onTokenUpdated(callback: (event: TokenUpdatedEvent) => void): () => void {
    return this.eventBus.on<TokenUpdatedEvent>('token:updated', callback)
  }

  onTokenError(callback: (event: TokenErrorEvent) => void): () => void {
    return this.eventBus.on<TokenErrorEvent>('token:error', callback)
  }

  destroy(): void {
    this.stopAutoRefresh()
    this.eventBus.removeAllListeners()
  }

  private async refresh(): Promise<void> {
    let lastError: unknown

    for (let attempt = 0; attempt <= MAX_TOKEN_REFRESH_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      try {
        const response = await this.fetchToken()
        this.eventBus.emit<TokenUpdatedEvent>('token:updated', {
          token: response.token,
          identity: response.identity,
          ttlSeconds: response.ttl_seconds,
        })
        this.scheduleRefresh(response.ttl_seconds)
        return
      } catch (error) {
        lastError = error
      }
    }

    const errorEvent: TokenErrorEvent = {
      code: (lastError as { code?: number })?.code ?? 0,
      message: (lastError as { message?: string })?.message ?? 'Token refresh failed',
      recoverable: false,
    }
    this.eventBus.emit<TokenErrorEvent>('token:error', errorEvent)
  }

  private scheduleRefresh(ttlSeconds: number): void {
    const buffer = Math.min(DEFAULT_TOKEN_REFRESH_BUFFER_SECONDS, ttlSeconds * 0.1)
    const delayMs = (ttlSeconds - buffer) * 1000
    this.refreshTimer = setTimeout(() => this.refresh(), delayMs)
  }
}
