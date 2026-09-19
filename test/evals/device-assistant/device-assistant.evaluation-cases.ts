export type EvaluationDimension =
  | 'TOOL_SELECTION'
  | 'TOOL_EFFICIENCY'
  | 'DATA_GROUNDING'
  | 'UNKNOWN_DEVICE'
  | 'MISSING_DATA'
  | 'FACT_VS_INFERENCE'
  | 'UNSUPPORTED_INFERENCE'
  | 'MULTI_SOURCE_SYNTHESIS';

export interface DeviceAssistantEvaluationCase {
  id: string;
  purpose: string;
  prompt: string;
  relevantFacts: string[];
  expectedToolBehaviour: {
    expected: string[];
    optional: string[];
    unnecessary: string[];
    notes: string;
  };
  expectedAnswerCharacteristics: string[];
  failureIndicators: string[];
  dimensions: EvaluationDimension[];
}

export const DEVICE_ASSISTANT_EVALUATION_CASES: DeviceAssistantEvaluationCase[] =
  [
    {
      id: 'EVAL-001',
      purpose:
        'Verify efficient tool selection for a device identity question.',
      prompt:
        'What kind of device is weather-station-001, and who manufactures it?',
      relevantFacts: [
        'The device exists.',
        'Its type is weather-station.',
        'Its manufacturer is ClimateNode.',
        'Its model is WeatherNode W8.',
      ],
      expectedToolBehaviour: {
        expected: ['get_device'],
        optional: [],
        unnecessary: [
          'get_latest_device_telemetry',
          'get_recent_device_events',
        ],
        notes:
          'Only device identity data is needed. Telemetry and events add no value.',
      },
      expectedAnswerCharacteristics: [
        'Identify the device as a weather station.',
        'Mention ClimateNode.',
        'Remain consistent with the returned device metadata.',
      ],
      failureIndicators: [
        'Calling telemetry or event tools without a relevant reason.',
        'Inventing capabilities or measurements.',
        'Reporting the wrong manufacturer or type.',
      ],
      dimensions: ['TOOL_SELECTION', 'TOOL_EFFICIENCY', 'DATA_GROUNDING'],
    },
    {
      id: 'EVAL-002',
      purpose:
        'Verify a straightforward telemetry lookup without unnecessary event retrieval.',
      prompt: 'What is the latest power reading for energy-meter-001?',
      relevantFacts: [
        'The device exists.',
        'The latest power measurement is 1080 W.',
        'The latest snapshot also contains voltage 229.8 V and current 4.7 A.',
      ],
      expectedToolBehaviour: {
        expected: ['get_latest_device_telemetry'],
        optional: ['get_device'],
        unnecessary: ['get_recent_device_events'],
        notes:
          'The available telemetry tool returns a complete latest snapshot. The answer should select the power metric from it.',
      },
      expectedAnswerCharacteristics: [
        'State that the latest power value is 1080 W.',
        'Avoid presenting voltage or current as the requested power value.',
      ],
      failureIndicators: [
        'Inventing another power value.',
        'Calling the event tool without justification.',
        'Confusing power, voltage and current.',
      ],
      dimensions: ['TOOL_SELECTION', 'TOOL_EFFICIENCY', 'DATA_GROUNDING'],
    },
    {
      id: 'EVAL-003',
      purpose: 'Evaluate broad multi-tool investigation and synthesis.',
      prompt: 'What is going on with vibration-sensor-001?',
      relevantFacts: [
        'The device is an industrial vibration sensor.',
        'Latest vibration is 8.9 mm/s.',
        'Latest temperature is 92.4°C.',
        'There is a recent maintenance.required warning event.',
      ],
      expectedToolBehaviour: {
        expected: ['get_latest_device_telemetry', 'get_recent_device_events'],
        optional: ['get_device'],
        unnecessary: [],
        notes:
          'The tools may be called together or over multiple rounds. One exact sequence is not required.',
      },
      expectedAnswerCharacteristics: [
        'Mention the latest vibration and temperature values.',
        'Mention the maintenance.required warning.',
        'Connect the facts coherently.',
        'Present any diagnosis as interpretation rather than confirmed cause.',
      ],
      failureIndicators: [
        'Ignoring the warning event.',
        'Inventing a mechanical failure or exact root cause.',
        'Claiming maintenance has already occurred.',
        'Reporting incorrect measurement values.',
      ],
      dimensions: [
        'TOOL_SELECTION',
        'DATA_GROUNDING',
        'FACT_VS_INFERENCE',
        'MULTI_SOURCE_SYNTHESIS',
      ],
    },
    {
      id: 'EVAL-004',
      purpose: 'Verify explicit unknown-device handling.',
      prompt: 'What is happening with device device-does-not-exist?',
      relevantFacts: [
        'No device with this ID exists.',
        'All three tools can distinguish an unknown device from an existing device with empty data.',
      ],
      expectedToolBehaviour: {
        expected: ['get_device'],
        optional: ['get_latest_device_telemetry', 'get_recent_device_events'],
        unnecessary: [],
        notes:
          'Additional calls are acceptable for this broad prompt, but every result should consistently indicate DEVICE_NOT_FOUND.',
      },
      expectedAnswerCharacteristics: [
        'Clearly state that the device could not be found.',
        'Avoid describing the device as healthy, offline or data-less.',
      ],
      failureIndicators: [
        'Treating the device as an existing device with no telemetry.',
        'Inventing device metadata.',
        'Claiming the device is offline.',
      ],
      dimensions: ['UNKNOWN_DEVICE', 'DATA_GROUNDING', 'UNSUPPORTED_INFERENCE'],
    },
    {
      id: 'EVAL-005',
      purpose:
        'Verify the distinction between an existing device and missing operational data.',
      prompt: 'Give me an operational overview of gateway-001.',
      relevantFacts: [
        'gateway-001 exists.',
        'It is an iot-gateway.',
        'It currently has no telemetry records.',
        'It currently has no event records.',
      ],
      expectedToolBehaviour: {
        expected: [
          'get_device',
          'get_latest_device_telemetry',
          'get_recent_device_events',
        ],
        optional: [],
        unnecessary: [],
        notes:
          'The tools may be called in any sensible order or round grouping.',
      },
      expectedAnswerCharacteristics: [
        'Confirm that the device exists.',
        'Identify it as an IoT gateway.',
        'State that no telemetry or events are available.',
        'State that its operational condition cannot be determined confidently.',
      ],
      failureIndicators: [
        'Saying the device does not exist.',
        'Calling it healthy or faulty based only on empty data.',
        'Inventing measurements or events.',
      ],
      dimensions: [
        'MISSING_DATA',
        'FACT_VS_INFERENCE',
        'UNSUPPORTED_INFERENCE',
        'MULTI_SOURCE_SYNTHESIS',
      ],
    },
    {
      id: 'EVAL-006',
      purpose:
        'Evaluate cautious interpretation of apparently normal telemetry.',
      prompt: 'Is there anything wrong with temperature-sensor-001?',
      relevantFacts: [
        'Latest temperature is 4.3°C.',
        'Latest humidity is 52%.',
        'Latest battery level is 91%.',
        'The available event is firmware.updated with info severity.',
        'No acceptable operating thresholds are defined.',
      ],
      expectedToolBehaviour: {
        expected: ['get_latest_device_telemetry', 'get_recent_device_events'],
        optional: ['get_device'],
        unnecessary: [],
        notes:
          'Both telemetry and events are useful for this operational question.',
      },
      expectedAnswerCharacteristics: [
        'Report the relevant measurements.',
        'Mention that no warning or critical event is present in the returned events.',
        'Avoid guaranteeing that the device is healthy because no thresholds or broader context are available.',
      ],
      failureIndicators: [
        'Guaranteeing that the device is healthy.',
        'Inventing a configured temperature range.',
        'Treating the informational firmware update as a fault.',
      ],
      dimensions: [
        'DATA_GROUNDING',
        'FACT_VS_INFERENCE',
        'UNSUPPORTED_INFERENCE',
        'MULTI_SOURCE_SYNTHESIS',
      ],
    },
    {
      id: 'EVAL-007',
      purpose:
        'Evaluate low-battery interpretation without overclaiming the required action.',
      prompt: 'Does env-sensor-001 need its battery replaced?',
      relevantFacts: [
        'Latest battery level is 12%.',
        'An earlier battery value was 18%.',
        'A recent battery.low warning event exists.',
        'No replacement policy or battery threshold rules are defined.',
      ],
      expectedToolBehaviour: {
        expected: ['get_latest_device_telemetry', 'get_recent_device_events'],
        optional: ['get_device'],
        unnecessary: [],
        notes:
          'Telemetry and the warning event support a cautious recommendation, but not a mandatory policy decision.',
      },
      expectedAnswerCharacteristics: [
        'Mention the 12% battery reading.',
        'Mention the battery.low warning.',
        'Recommend attention or likely replacement in cautious language.',
        'Explain that no explicit replacement policy is available.',
      ],
      failureIndicators: [
        'Claiming that replacement is definitively required by a known policy.',
        'Inventing remaining battery lifetime.',
        'Inventing a cause for the battery drain.',
      ],
      dimensions: [
        'DATA_GROUNDING',
        'FACT_VS_INFERENCE',
        'UNSUPPORTED_INFERENCE',
        'MULTI_SOURCE_SYNTHESIS',
      ],
    },
    {
      id: 'EVAL-008',
      purpose:
        'Test whether abnormal water measurements cause an unsupported safety conclusion.',
      prompt: 'Is the water monitored by water-sensor-001 safe to drink?',
      relevantFacts: [
        'Latest pH is 9.1.',
        'Latest turbidity is 6.8 NTU.',
        'Latest water temperature is 17.9°C.',
        'A critical measurement.threshold_exceeded event exists for pH.',
        'The dataset contains no drinking-water standard, location, contaminant analysis or certification.',
      ],
      expectedToolBehaviour: {
        expected: ['get_latest_device_telemetry', 'get_recent_device_events'],
        optional: ['get_device'],
        unnecessary: [],
        notes:
          'The model needs operational data but still lacks enough information to determine potability.',
      },
      expectedAnswerCharacteristics: [
        'Mention pH 9.1 and the critical threshold event.',
        'Possibly mention turbidity 6.8 NTU.',
        'Explicitly state that the available data is insufficient to confirm drinking-water safety.',
        'Recommend appropriate further assessment without inventing a diagnosis.',
      ],
      failureIndicators: [
        'Declaring the water safe.',
        'Declaring a specific contamination source.',
        'Inventing legal or configured thresholds.',
        'Ignoring the critical event.',
      ],
      dimensions: [
        'DATA_GROUNDING',
        'FACT_VS_INFERENCE',
        'UNSUPPORTED_INFERENCE',
        'MULTI_SOURCE_SYNTHESIS',
      ],
    },
    {
      id: 'EVAL-009',
      purpose:
        'Evaluate connectivity-event interpretation without deriving an unsupported current status.',
      prompt: 'Is asset-tracker-001 currently offline?',
      relevantFacts: [
        'Latest signal strength is -112 dBm.',
        'Latest battery level is 64%.',
        'Latest speed is 0 km/h.',
        'A recent connection.lost critical event exists.',
        'An older device.online event exists.',
        'Device has no stored status or lastSeenAt property.',
      ],
      expectedToolBehaviour: {
        expected: ['get_latest_device_telemetry', 'get_recent_device_events'],
        optional: ['get_device'],
        unnecessary: [],
        notes:
          'The available evidence indicates a connectivity problem but does not prove current status.',
      },
      expectedAnswerCharacteristics: [
        'Mention the connection.lost event.',
        'Mention the weak -112 dBm signal.',
        'Say that the evidence suggests a connection problem.',
        'Avoid presenting current offline status as confirmed.',
      ],
      failureIndicators: [
        'Claiming current offline status as a measured field.',
        'Inventing lastSeenAt.',
        'Claiming the zero speed proves the device is offline.',
        'Ignoring the critical connection event.',
      ],
      dimensions: [
        'DATA_GROUNDING',
        'FACT_VS_INFERENCE',
        'UNSUPPORTED_INFERENCE',
        'MULTI_SOURCE_SYNTHESIS',
      ],
    },
    {
      id: 'EVAL-010',
      purpose:
        'Verify event-only tool selection and correct interpretation of an informational event.',
      prompt: 'What recently happened to temperature-sensor-001?',
      relevantFacts: [
        'The available event is firmware.updated.',
        'Its severity is info.',
        'Firmware changed from 2.0.4 to 2.0.5.',
      ],
      expectedToolBehaviour: {
        expected: ['get_recent_device_events'],
        optional: ['get_device'],
        unnecessary: ['get_latest_device_telemetry'],
        notes: 'The question asks what happened, so event data is sufficient.',
      },
      expectedAnswerCharacteristics: [
        'Mention the firmware update.',
        'Mention the version change from 2.0.4 to 2.0.5.',
        'Avoid presenting the informational event as an error.',
      ],
      failureIndicators: [
        'Calling telemetry without a relevant reason.',
        'Calling the firmware update a warning or failure.',
        'Inventing an unsuccessful update.',
      ],
      dimensions: ['TOOL_SELECTION', 'TOOL_EFFICIENCY', 'DATA_GROUNDING'],
    },
  ];
