import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureOpenApi } from './openapi/configure-openapi.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureOpenApi(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
