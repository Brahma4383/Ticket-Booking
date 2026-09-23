/**
 * The shape every endpoint uses to report a failure.
 *
 * Each backend module wraps its errors the same way, so a caller reads
 * `error.code` without caring which travel mode it came from:
 *
 *   { "error": { "code": "seat_unavailable", "message": "...", "detail": {...} } }
 */
export interface ApiErrorBody {
  /** Machine-readable, e.g. `seat_unavailable`, `invalid_selection`. */
  code: string
  message: string
  /**
   * Field errors for a validation failure (`{ contact: { phone: [...] } }`),
   * or whatever context the error carries (`{ seatIds: ['L4'] }`).
   */
  detail?: Record<string, unknown>
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody
}

/** Codes worth branching on. Anything else is shown as its `message`. */
export type ApiErrorCode =
  /** Field validation; `detail` holds the per-field messages. */
  | 'invalid'
  /** Inventory moved while the traveller was deciding — re-query and retry. */
  | 'seat_unavailable'
  | 'class_unavailable'
  | 'rooms_unavailable'
  | 'no_rate_card'
  /** The selection does not fit the service, whatever the reason. */
  | 'invalid_seat_selection'
  | 'invalid_selection'
  | 'booking_not_found'
