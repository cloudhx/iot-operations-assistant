import { Module } from '@nestjs/common';

import { DeviceEventsModule } from '../device-events/device-events.module.js';
import { DevicesModule } from '../devices/devices.module.js';
import { MaintenanceWorkOrdersModule } from '../maintenance-work-orders/maintenance-work-orders.module.js';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { PendingActionApprovalService } from './actions/pending-action-approval.service.js';
import { PendingActionsService } from './actions/pending-actions.service.js';
import { DeviceAssistantService } from './device-assistant.service.js';
import { GeminiClientService } from './gemini/gemini-client.service.js';
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
  imports: [
    DevicesModule,
    TelemetryModule,
    DeviceEventsModule,
    MaintenanceWorkOrdersModule,
  ],
  providers: [
    DeviceAssistantService,
    GeminiClientService,
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
  ],
  exports: [
    DeviceAssistantService,
    PendingActionsService,
    PendingActionApprovalService,
    AiTraceService,
  ],
})
export class AiModule {}
