import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ApiExceptionFilter } from './common/api-exception.filter.js';

/** App-wide setup shared by main.ts and the tests, so tests run the same app the server does. */
export function configureApp(app: INestApplication): void {
  // Reads the Cookie header into request.cookies (the session token lives there).
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}
