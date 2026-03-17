import type { OEXError } from '../types'

export function createOEXError(code: number, message: string, recoverable?: boolean): OEXError {
  return {
    code,
    message,
    recoverable: recoverable ?? isRecoverableHttpStatus(code),
  }
}

export function isRecoverableHttpStatus(status: number): boolean {
  return status === 429 || status === 503
}
