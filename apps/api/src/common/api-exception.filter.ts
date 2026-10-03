import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode, type ApiError } from '@fernleaf/shared';
import { ApiException } from './api-exception.js';

const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.ValidationFailed,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.Unauthenticated,
  [HttpStatus.FORBIDDEN]: ErrorCode.Forbidden,
  [HttpStatus.NOT_FOUND]: ErrorCode.NotFound,
  [HttpStatus.CONFLICT]: ErrorCode.Conflict,
};

/** Prisma's known request errors we can explain to the user. Checked by shape, not class. */
function fromPrismaError(error: unknown): { status: number; body: ApiError } | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  switch (error.code) {
    case 'P2002': // unique constraint
      return {
        status: HttpStatus.CONFLICT,
        body: { code: ErrorCode.Conflict, message: 'A record with these details already exists' },
      };
    case 'P2025': // record required by the operation was not found
      return {
        status: HttpStatus.NOT_FOUND,
        body: { code: ErrorCode.NotFound, message: 'Record not found' },
      };
    default:
      return undefined;
  }
}

/**
 * Turns every error into the shared { code, message, fieldErrors? } shape, so the frontend handles
 * errors one way. Unexpected errors are logged in full but reach the client only as a generic message.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toApiError(error);
    if (status >= 500) {
      this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
    response.status(status).json(body);
  }

  private toApiError(error: unknown): { status: number; body: ApiError } {
    if (error instanceof ApiException) {
      return { status: error.getStatus(), body: error.body };
    }
    if (error instanceof HttpException) {
      // Thrown by Nest itself, e.g. an unknown route (404) or malformed JSON (400).
      const status = error.getStatus();
      return {
        status,
        body: { code: CODE_BY_STATUS[status] ?? ErrorCode.Internal, message: error.message },
      };
    }
    return (
      fromPrismaError(error) ?? {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: { code: ErrorCode.Internal, message: 'Something went wrong. Please try again.' },
      }
    );
  }
}
