import { AuthModule } from '../auth/auth.module.js';
import { SESSION_COOKIE } from '../auth/auth-session.service.js';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AiModule } from '../ai/ai.module.js';

export function configureOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('IoT Operations Assistant')
    .setDescription('AI-assisted IoT operations API')
    .setVersion('1.0')
    .addCookieAuth(SESSION_COOKIE, { type: 'apiKey' }, 'session')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    include: [AiModule, AuthModule],
  });

  SwaggerModule.setup('docs', app, document);
}
