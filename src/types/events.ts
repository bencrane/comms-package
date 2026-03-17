export interface TokenUpdatedEvent {
  token: string
  identity: string
  ttlSeconds: number
}

export interface TokenErrorEvent {
  code: number
  message: string
  recoverable: boolean
}

export type OEXEventMap = {
  'token:updated': TokenUpdatedEvent
  'token:error': TokenErrorEvent
}
