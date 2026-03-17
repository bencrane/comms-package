import { describe, it, expect } from 'vitest'
import { createOEXError, isRecoverableHttpStatus, createTwilioOEXError, getErrorInfo } from '../../src/utils/errors'

describe('createTwilioOEXError', () => {
  it('returns catalog entry for known code 20101', () => {
    const error = createTwilioOEXError(20101)
    expect(error.code).toBe(20101)
    expect(error.message).toBe('Invalid JWT token')
    expect(error.userMessage).toBe('Your session could not be verified. Please sign in again.')
    expect(error.action).toBe('Re-authenticate and fetch a new token.')
    expect(error.recoverable).toBe(true)
  })

  it('returns catalog entry for known code 31008', () => {
    const error = createTwilioOEXError(31008)
    expect(error.code).toBe(31008)
    expect(error.message).toBe('User denied microphone access')
    expect(error.userMessage).toBe('Microphone access is required for calls. Please allow microphone access in your browser settings.')
    expect(error.action).toBe('Open browser settings and grant microphone permission for this site.')
    expect(error.recoverable).toBe(false)
  })

  it('returns catalog entry for known code 31201', () => {
    const error = createTwilioOEXError(31201)
    expect(error.code).toBe(31201)
    expect(error.message).toBe('Media connection failed')
    expect(error.recoverable).toBe(true)
  })

  it('returns catalog entry for known code 31301', () => {
    const error = createTwilioOEXError(31301)
    expect(error.code).toBe(31301)
    expect(error.message).toBe('Signaling connection disconnected')
    expect(error.recoverable).toBe(true)
  })

  it('returns catalog entry for known code 31505', () => {
    const error = createTwilioOEXError(31505)
    expect(error.code).toBe(31505)
    expect(error.message).toBe('SIP busy everywhere')
    expect(error.userMessage).toBe('The line is busy.')
    expect(error.recoverable).toBe(false)
  })

  it('returns userMessage and action fields for known codes', () => {
    const error = createTwilioOEXError(31006)
    expect(error.userMessage).toBeDefined()
    expect(error.action).toBeDefined()
    expect(error.userMessage).toBe('Unable to connect. Check your internet connection.')
    expect(error.action).toBe('Verify network connectivity. Try refreshing the page.')
  })

  it('returns fallback for unknown code with no catalog entry', () => {
    const error = createTwilioOEXError(99999)
    expect(error.code).toBe(99999)
    expect(error.message).toBe('Unknown error (code 99999)')
    expect(error.recoverable).toBe(false)
    expect(error.userMessage).toBeUndefined()
    expect(error.action).toBeUndefined()
  })

  it('uses fallbackMessage when code is not in catalog', () => {
    const error = createTwilioOEXError(99999, 'Something custom happened')
    expect(error.message).toBe('Something custom happened')
    expect(error.recoverable).toBe(false)
  })

  it('returns recoverable: true for 20102 (token expired)', () => {
    const error = createTwilioOEXError(20102)
    expect(error.recoverable).toBe(true)
  })

  it('returns recoverable: false for 31008 (mic denied)', () => {
    const error = createTwilioOEXError(31008)
    expect(error.recoverable).toBe(false)
  })

  it('returns recoverable: true for 31201 (media connection failed)', () => {
    const error = createTwilioOEXError(31201)
    expect(error.recoverable).toBe(true)
  })
})

describe('getErrorInfo', () => {
  it('returns entry for known code', () => {
    const entry = getErrorInfo(31008)
    expect(entry).toBeDefined()
    expect(entry!.message).toBe('User denied microphone access')
    expect(entry!.userMessage).toBe('Microphone access is required for calls. Please allow microphone access in your browser settings.')
    expect(entry!.action).toBe('Open browser settings and grant microphone permission for this site.')
    expect(entry!.recoverable).toBe(false)
  })

  it('returns undefined for unknown code', () => {
    const entry = getErrorInfo(99999)
    expect(entry).toBeUndefined()
  })
})

describe('backward compatibility', () => {
  it('createOEXError still works unchanged', () => {
    const error = createOEXError(500, 'Internal server error')
    expect(error.code).toBe(500)
    expect(error.message).toBe('Internal server error')
    expect(error.recoverable).toBe(false)
  })

  it('isRecoverableHttpStatus still works unchanged', () => {
    expect(isRecoverableHttpStatus(429)).toBe(true)
    expect(isRecoverableHttpStatus(503)).toBe(true)
    expect(isRecoverableHttpStatus(500)).toBe(false)
    expect(isRecoverableHttpStatus(200)).toBe(false)
  })
})
