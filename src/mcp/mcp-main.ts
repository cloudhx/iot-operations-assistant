import { NestFactory } from '@nestjs/core';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { McpModule } from './mcp.module.js';
import { McpServerService } from './mcp-server.service.js';

async function bootstrap(): Promise<void> {
  const applicationContext = await NestFactory.createApplicationContext(
    McpModule,
    { logger: false },
  );

  applicationContext.enableShutdownHooks();
  const mcpServerService = applicationContext.get(McpServerService);

  serveStdio(() => mcpServerService.createServer(), {
    legacy: 'reject',
  });
}

try {
  await bootstrap();
} catch (error) {
  console.error('Failed to start MCP server.', error);
  process.exitCode = 1;
}
