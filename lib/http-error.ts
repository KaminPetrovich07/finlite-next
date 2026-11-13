// An error with an HTTP status and a message for the user. Lives apart from
// lib/auth/server.ts so that low-level modules (lib/db.ts and the journal
// guard) can throw it without an import cycle.
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
