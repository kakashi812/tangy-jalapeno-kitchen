import { ApiErrorSchema, ErrorCode, type ApiError } from '@fernleaf/shared';

/**
 * An error response from the API, in the shared { code, message, fieldErrors? } shape.
 * Forms read fieldErrors to show each message next to its input; pages read code to decide what
 * to render (e.g. UNAUTHENTICATED → login).
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string[]>;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.code;
    this.fieldErrors = body.fieldErrors ?? {};
  }
}

/** Reads a failed response into an ApiRequestError, even if the body isn't our shape (e.g. a proxy error page). */
export async function toApiRequestError(response: Response): Promise<ApiRequestError> {
  const json: unknown = await response.json().catch(() => undefined);
  const parsed = ApiErrorSchema.safeParse(json);
  return new ApiRequestError(
    response.status,
    parsed.success
      ? parsed.data
      : { code: ErrorCode.Internal, message: `The server returned an error (${response.status}).` },
  );
}
