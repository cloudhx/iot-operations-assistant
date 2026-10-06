export interface DeviceAssistantResult {
  interactionId: string;
  answer: string;
}

export class DeviceAssistantInteractionError extends Error {
  constructor(
    readonly interactionId: string,
    cause: unknown,
  ) {
    super('Device assistant interaction failed', { cause });
    this.name = 'DeviceAssistantInteractionError';
  }
}
