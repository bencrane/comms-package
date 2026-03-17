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

// --- Error Catalog ---

export interface ErrorCatalogEntry {
  message: string
  userMessage: string
  action: string
  recoverable: boolean
}

const ERROR_CATALOG = new Map<number, ErrorCatalogEntry>([
  // Authorization Errors (20xxx)
  [20101, { message: 'Invalid JWT token', userMessage: 'Your session could not be verified. Please sign in again.', action: 'Re-authenticate and fetch a new token.', recoverable: true }],
  [20102, { message: 'JWT token expired', userMessage: 'Your session has expired. Reconnecting...', action: 'Token refresh is automatic. If this persists, sign in again.', recoverable: true }],
  [20103, { message: 'Authentication failed', userMessage: 'Authentication failed. Please sign in again.', action: 'Re-authenticate with valid credentials.', recoverable: false }],
  [20104, { message: 'Invalid access token', userMessage: 'Your session could not be verified. Please sign in again.', action: 'Re-authenticate and fetch a new token.', recoverable: true }],
  [20151, { message: 'Token expiration time exceeds maximum allowed', userMessage: 'Your session could not be established. Please try again.', action: 'Contact support — the token configuration needs adjustment.', recoverable: false }],
  [20157, { message: 'JWT token expired', userMessage: 'Your session has expired. Reconnecting...', action: 'Token refresh is automatic. If this persists, sign in again.', recoverable: true }],

  // General Errors
  [31000, { message: 'Unknown error', userMessage: 'Something went wrong. Please try again.', action: 'Retry the operation. If this persists, refresh the page.', recoverable: true }],
  [31006, { message: 'Connection error', userMessage: 'Unable to connect. Check your internet connection.', action: 'Verify network connectivity. Try refreshing the page.', recoverable: true }],
  [31007, { message: 'Call cancelled', userMessage: 'The call was cancelled.', action: 'No action needed — the call ended normally.', recoverable: false }],

  // Client Errors (31001–31009)
  [31001, { message: 'Bad request', userMessage: 'The call could not be placed. Please try again.', action: 'Retry the call. If this persists, contact support.', recoverable: false }],
  [31002, { message: 'Resource not found', userMessage: 'The number or endpoint could not be reached.', action: 'Verify the phone number and try again.', recoverable: false }],
  [31003, { message: 'Access forbidden', userMessage: "You don't have permission to make this call.", action: 'Contact your administrator to verify your calling permissions.', recoverable: false }],
  [31005, { message: 'Unexpected signaling error', userMessage: 'Connection interrupted. Retrying...', action: 'Check your internet connection. Try refreshing the page.', recoverable: true }],
  [31008, { message: 'User denied microphone access', userMessage: 'Microphone access is required for calls. Please allow microphone access in your browser settings.', action: 'Open browser settings and grant microphone permission for this site.', recoverable: false }],
  [31009, { message: 'Device registration failed', userMessage: 'Could not connect to the calling service. Please try again.', action: 'Refresh the page. If this persists, check your network.', recoverable: true }],

  // Malformed Request Errors (311xx)
  [31100, { message: 'Malformed request', userMessage: 'The call could not be placed due to a configuration error.', action: 'Contact support — the request format needs correction.', recoverable: false }],

  // Media Errors (312xx)
  [31201, { message: 'Media connection failed', userMessage: 'Call audio could not be established. Check your internet connection.', action: 'Check network connectivity. Disable VPN if active. Try a different network.', recoverable: true }],
  [31202, { message: 'Media connection failed', userMessage: 'Call audio could not be established. Check your internet connection.', action: 'Check network connectivity. Ensure WebRTC is not blocked by firewall.', recoverable: true }],
  [31203, { message: 'Low bytes received — possible audio quality issue', userMessage: 'Call quality is degraded — you may not hear the other party.', action: 'Check your internet connection speed. Move closer to your router.', recoverable: true }],
  [31204, { message: 'Low bytes sent — possible audio quality issue', userMessage: 'Call quality is degraded — the other party may not hear you.', action: 'Check your internet connection speed. Check your microphone.', recoverable: true }],
  [31205, { message: 'ICE gathering failed', userMessage: 'Could not establish a connection for the call.', action: 'Check that your firewall allows WebRTC traffic. Try a different network.', recoverable: true }],
  [31206, { message: 'ICE connection failed', userMessage: 'Call connection was lost.', action: 'Check your internet connection. Try refreshing and calling again.', recoverable: true }],
  [31207, { message: 'No supported audio codec', userMessage: 'Your browser does not support the required audio format.', action: 'Try using Chrome or Edge for the best calling experience.', recoverable: false }],

  // Signaling Errors (313xx)
  [31301, { message: 'Signaling connection disconnected', userMessage: 'Connection to the calling service was lost. Reconnecting...', action: 'Automatic reconnection is in progress. Check your internet if it persists.', recoverable: true }],
  [31302, { message: 'Signaling connection error', userMessage: 'Connection to the calling service failed.', action: 'Check your internet connection. Try refreshing the page.', recoverable: true }],
  [31303, { message: 'Signaling connection timeout', userMessage: 'Connection to the calling service timed out.', action: 'Check your internet connection and firewall settings.', recoverable: true }],

  // Signature Validation Errors (314xx)
  [31401, { message: 'Invalid signature', userMessage: 'Your session could not be verified. Please sign in again.', action: 'Re-authenticate — the token signature is invalid.', recoverable: false }],
  [31402, { message: 'Access token signature invalid', userMessage: 'Your session could not be verified. Please sign in again.', action: 'Re-authenticate — the token signature is invalid.', recoverable: false }],

  // SIP Errors (315xx)
  [31501, { message: 'SIP server error', userMessage: 'The call service encountered an error. Please try again.', action: 'Retry the call. If this persists, contact support.', recoverable: true }],
  [31502, { message: 'SIP bad request', userMessage: 'The call could not be placed due to a configuration error.', action: 'Contact support — the SIP request format needs correction.', recoverable: false }],
  [31503, { message: 'SIP service unavailable', userMessage: 'The call service is temporarily unavailable. Please try again shortly.', action: 'Wait a moment and retry the call.', recoverable: true }],
  [31504, { message: 'SIP timeout', userMessage: 'The call could not be connected — the other party did not respond.', action: 'Try calling again. The number may be unreachable.', recoverable: true }],
  [31505, { message: 'SIP busy everywhere', userMessage: 'The line is busy.', action: 'Try calling again later.', recoverable: false }],
  [31506, { message: 'SIP call declined', userMessage: 'The call was declined.', action: 'The other party declined the call. Try again later.', recoverable: false }],
  [31507, { message: 'SIP not acceptable', userMessage: 'The call could not be completed due to a compatibility issue.', action: 'Contact support — there may be a codec or format mismatch.', recoverable: false }],
])

export function createTwilioOEXError(code: number, fallbackMessage?: string): OEXError {
  const entry = ERROR_CATALOG.get(code)
  if (entry) {
    return {
      code,
      message: entry.message,
      recoverable: entry.recoverable,
      userMessage: entry.userMessage,
      action: entry.action,
    }
  }
  return {
    code,
    message: fallbackMessage ?? `Unknown error (code ${code})`,
    recoverable: false,
  }
}

export function getErrorInfo(code: number): ErrorCatalogEntry | undefined {
  return ERROR_CATALOG.get(code)
}
