/** Thrown from services; plugins/error-handler.ts turns it into `{ error }` with this status. */
export class HttpError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}
