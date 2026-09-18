import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = randomUUID();

    const { status, code, message, details } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${requestId} ${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      code,
      message,
      ...(details ? { details } : {}),
      requestId,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, code: this.codeFor(status), message: payload };
      }

      const record = payload as Record<string, unknown>;
      const rawMessage = record.message;

      // class-validator returns an array of constraint failures; surface them as
      // details and keep `message` a single readable string.
      if (Array.isArray(rawMessage)) {
        return {
          status,
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: rawMessage,
        };
      }

      // Structured payloads (e.g. Terminus readiness results) carry keys beyond
      // the standard envelope. Preserve them, or a failing /health reports only
      // "Service Unavailable" without naming the dependency that is down.
      const envelopeKeys = new Set(['statusCode', 'message', 'error', 'code']);
      const extra = Object.fromEntries(
        Object.entries(record).filter(([key]) => !envelopeKeys.has(key)),
      );

      return {
        status,
        code: (record.code as string) ?? this.codeFor(status),
        message: (rawMessage as string) ?? exception.message,
        details: Object.keys(extra).length > 0 ? extra : undefined,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    // Anything unrecognised is a bug. Never leak the underlying message.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };
  }

  private fromPrisma(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: string;
    message: string;
  } {
    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: 'ALREADY_EXISTS',
          message: 'A record with those values already exists',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'INVALID_REFERENCE',
          message: 'Referenced record does not exist',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'Record not found',
        };
      case 'P1001':
      case 'P1002':
        // The database is unreachable, or a pooled connection died. In
        // development this fires on every `nest --watch` restart: the old
        // process exits without closing its pool and in-flight requests fail.
        // It is an availability blip, not a fault in the request, and a full
        // stack trace on every hot reload buries the errors that matter.
        this.logger.warn(
          `Database unreachable (${error.code}) — transient if the API just restarted`,
        );
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'DATABASE_UNAVAILABLE',
          message: 'The service is reconnecting. Please try again in a moment.',
        };
      case 'P2024':
        // Connection pool exhausted. The database is fine; this instance ran out
        // of connections, so it is a availability problem rather than a bug in
        // the request. 503 also tells any proxy in front of us it may retry.
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'DATABASE_BUSY',
          message: 'The service is briefly overloaded. Please try again.',
        };
      default:
        this.logger.error(`Unmapped Prisma error ${error.code}`, error.message);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        };
    }
  }

  private codeFor(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
      429: 'RATE_LIMITED',
    };
    return map[status] ?? 'ERROR';
  }
}
