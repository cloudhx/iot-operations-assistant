import { Injectable, Logger } from '@nestjs/common';

import type { CreateMaintenanceWorkOrderInput } from '../../maintenance-work-orders/domain/maintenance-work-order.model.js';
import { MaintenanceWorkOrdersService } from '../../maintenance-work-orders/maintenance-work-orders.service.js';
import { PendingActionsService } from '../actions/pending-actions.service.js';
import type {
  GeminiFunctionCall,
  GeminiFunctionResult,
} from '../gemini/gemini.types.js';
import { CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME } from './maintenance-work-order.tool.js';

@Injectable()
export class MaintenanceWorkOrderToolExecutorService {
  private readonly logger = new Logger(
    MaintenanceWorkOrderToolExecutorService.name,
  );

  constructor(
    private readonly workOrders: MaintenanceWorkOrdersService,
    private readonly pendingActions: PendingActionsService,
  ) {}

  async execute(call: GeminiFunctionCall): Promise<GeminiFunctionResult> {
    if (call.name !== CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME) {
      throw new Error(`Unsupported maintenance action tool: ${call.name}`);
    }

    const payload = this.workOrders.validateCreateInput(
      this.readArguments(call.arguments),
    );
    const pendingAction = this.pendingActions.createMaintenanceWorkOrderAction(
      CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME,
      payload,
    );

    this.logger.log(
      `Created pending action \"${pendingAction.id}\" with frozen arguments ${JSON.stringify(pendingAction.arguments)}; human approval is required`,
    );

    return {
      callId: call.id,
      name: call.name,
      result: {
        status: 'approval_required',
        actionId: pendingAction.id,
        action: {
          type: pendingAction.toolName,
          ...pendingAction.arguments,
        },
      },
    };
  }

  private readArguments(
    args: Record<string, unknown>,
  ): CreateMaintenanceWorkOrderInput {
    const { deviceId, component, reason } = args;

    if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
      throw new Error(
        `${CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME} requires a non-empty string argument \"deviceId\"`,
      );
    }
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error(
        `${CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME} requires a non-empty string argument \"reason\"`,
      );
    }
    if (component !== undefined && typeof component !== 'string') {
      throw new Error(
        `${CREATE_MAINTENANCE_WORK_ORDER_TOOL_NAME} argument \"component\" must be a string`,
      );
    }

    return {
      deviceId,
      reason,
      ...(typeof component === 'string' ? { component } : {}),
    };
  }
}
