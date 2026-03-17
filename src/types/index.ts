export * from './api'
export * from './events'
export * from './voice'

export interface OEXError {
  code: number
  message: string
  recoverable: boolean
  /** User-facing message safe to display in UI */
  userMessage?: string
  /** Recovery action the consumer can present or take */
  action?: string
}
