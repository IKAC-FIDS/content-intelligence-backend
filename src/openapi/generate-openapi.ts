import { NestFactory } from '@nestjs/core';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AppModule } from '../app.module';
import { createOpenApiDocument } from './openapi.document';
import { OPENAPI_JSON_PATH } from './openapi.constants';

async function generate() {
  process.env.NODE_ENV ??= 'test';
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  // Swagger scans Nest metadata directly. Deliberately do not call app.init()
  // here: initialization starts runtime schedulers and middleware that are not
  // part of contract generation and may require external infrastructure.
  const document = createOpenApiDocument(app);
  const output = resolve(process.cwd(), OPENAPI_JSON_PATH);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();
  process.stdout.write(`${output}\n`);
}

generate().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
