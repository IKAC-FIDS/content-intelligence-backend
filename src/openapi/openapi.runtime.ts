import { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi.document';
import { SWAGGER_PATH } from './openapi.constants';

export function configureRuntimeOpenApi(app: INestApplication, enabled: boolean) {
  if (!enabled) return;
  SwaggerModule.setup(SWAGGER_PATH, app, createOpenApiDocument(app), {
    jsonDocumentUrl: `/${SWAGGER_PATH}/openapi.json`,
    swaggerOptions: { persistAuthorization: false },
  });
}
