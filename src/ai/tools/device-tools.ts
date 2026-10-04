export const DEVICE_TOOL_NAMES = {
  GET_DEVICE: 'get_device',
  GET_LATEST_TELEMETRY: 'get_latest_device_telemetry',
  GET_RECENT_EVENTS: 'get_recent_device_events',
} as const;

export type DeviceToolName =
  (typeof DEVICE_TOOL_NAMES)[keyof typeof DEVICE_TOOL_NAMES];
