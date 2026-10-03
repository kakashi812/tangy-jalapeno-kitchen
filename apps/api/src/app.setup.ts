import type { INestApplication } from '@nestjs/common';
import { ApiExceptionFilter } from './common/api-exception.filter.js';

/** App-wide setup shared by main.ts and the tests, so tests run the same app the server does. */
export function configureApp(app: INestApplication): void {
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}
