import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, type ApiError } from '@fernleaf/shared';

/**
 * The one exception type business code throws. It carries the shared error shape, so the
 * exception filter can send it to the client unchanged.
 *
 *   throw new ApiException(HttpStatus.CONFLICT, 'CUTOFF_PASSED', 'Orders for 8 Oct locked at 6 Oct 16:00');
 */
export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    fieldErrors?: Record<string, string[]>,
  ) {
    const body: ApiError = fieldErrors ? { code, message, fieldErrors } : { code, message };
    super(body, status);
  }

  get body(): ApiError {
    return this.getResponse() as ApiError;
  }

  static notFound(what: string): ApiException {
    return new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NotFound, `${what} not found`);
  }

  static validation(fieldErrors: Record<string, string[]>): ApiException {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.ValidationFailed,
      'Some fields are invalid',
      fieldErrors,
    );
  }
}
