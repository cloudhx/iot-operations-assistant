import { Module } from '@nestjs/common';

import { MaintenanceWorkOrdersModule } from '../maintenance-work-orders/maintenance-work-orders.module.js';
import { PendingActionApprovalService } from './actions/pending-action-approval.service.js';
import { PendingActionsService } from './actions/pending-actions.service.js';
import { DeviceAssistantService } from './device-assistant.service.js';
import { GeminiClientService } from './gemini/gemini-client.service.js';
import { DeviceAssistantController } from './http/device-assistant.controller.js';
import { DeviceAssistantExceptionFilter } from './http/device-assistant-exception.filter.js';
import { PendingActionsController } from './http/pending-actions.controller.js';
import { PendingActionExceptionFilter } from './http/pending-action-exception.filter.js';
import { McpDeviceClientService } from './mcp/mcp-device-client.service.js';
import { McpGeminiToolAdapterService } from './mcp/mcp-gemini-tool-adapter.service.js';
import { AiTraceService } from './observability/ai-trace.service.js';
import { DocumentRetrievalService } from './rag/document-retrieval.service.js';
import { GeminiEmbeddingService } from './rag/gemini-embedding.service.js';
import { InMemoryVectorStoreService } from './rag/in-memory-vector-store.service.js';
import { MarkdownDocumentChunkerService } from './rag/markdown-document-chunker.service.js';
import { DeviceAssistantToolDispatcherService } from './tools/device-assistant-tool-dispatcher.service.js';
import { DeviceToolExecutorService } from './tools/device-tool-executor.service.js';
import { MaintenanceKnowledgeToolExecutorService } from './tools/maintenance-knowledge-tool-executor.service.js';
import { MaintenanceWorkOrderToolExecutorService } from './tools/maintenance-work-order-tool-executor.service.js';

@Module({
  imports: [MaintenanceWorkOrdersModule],
  controllers: [DeviceAssistantController, PendingActionsController],
  providers: [
    DeviceAssistantService,
    GeminiClientService,
    McpDeviceClientService,
    McpGeminiToolAdapterService,
    DeviceAssistantToolDispatcherService,
    DeviceToolExecutorService,
    MaintenanceKnowledgeToolExecutorService,
    MaintenanceWorkOrderToolExecutorService,
    PendingActionsService,
    PendingActionApprovalService,
    AiTraceService,
    DocumentRetrievalService,
    MarkdownDocumentChunkerService,
    GeminiEmbeddingService,
    InMemoryVectorStoreService,
    DeviceAssistantExceptionFilter,
    PendingActionExceptionFilter,
  ],
  exports: [
    DeviceAssistantService,
    PendingActionsService,
    PendingActionApprovalService,
    AiTraceService,
  ],
})
export class AiModule {}
