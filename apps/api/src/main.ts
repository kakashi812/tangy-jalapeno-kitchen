import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadEnv } from './config/env.js';

// Locally, variables come from apps/api/.env.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(env.PORT);
}
// Vercel captures the server during import and starts listening after the module loads.
// A top-level await here would wait for that listening callback and deadlock the loader.
void bootstrap().catch((error: unknown) => {
  console.error('Failed to start the API:', error);
  process.exitCode = 1;
});
