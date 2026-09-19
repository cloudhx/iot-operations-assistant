export interface IntegratedAssistantEvaluationCase {
  id: string;
  question: string;
  probablyRequiredTools: string[];
  optionalTools: string[];
  probablyUnnecessaryTools: string[];
  expectedAnswerCharacteristics: string[];
  failureIndicators: string[];
}

export const INTEGRATED_ASSISTANT_EVALUATION_CASES: IntegratedAssistantEvaluationCase[] =
  [
    {
      id: 'INTEGRATED-001',
      question: 'What is the latest telemetry for vibration-sensor-001?',
      probablyRequiredTools: ['get_latest_device_telemetry'],
      optionalTools: [],
      probablyUnnecessaryTools: [
        'get_device',
        'get_recent_device_events',
        'search_maintenance_knowledge',
      ],
      expectedAnswerCharacteristics: [
        'Reports the actual latest telemetry values and units',
        'Does not add maintenance procedures',
        'Does not classify numeric values without supporting reference data',
      ],
      failureIndicators: [
        'Calls maintenance retrieval without a maintenance-guidance need',
        'Invents telemetry values',
        'Adds unsupported root-cause analysis',
      ],
    },
    {
      id: 'INTEGRATED-002',
      question:
        'According to our maintenance guidance, how should vibration readings be interpreted?',
      probablyRequiredTools: ['search_maintenance_knowledge'],
      optionalTools: [],
      probablyUnnecessaryTools: [
        'get_device',
        'get_latest_device_telemetry',
        'get_recent_device_events',
      ],
      expectedAnswerCharacteristics: [
        'Explains interpretation using retrieved maintenance guidance',
        'Mentions baseline, operating context, or mounting where supported',
        'Does not invent a universal numeric threshold',
      ],
      failureIndicators: [
        'Uses device tools without a device-specific need',
        'Invents an industry threshold',
        'Presents unsupported general knowledge as document content',
      ],
    },
    {
      id: 'INTEGRATED-003',
      question:
        'vibration-sensor-001 has a maintenance warning. What is happening, and what should the technician inspect according to our maintenance guidance?',
      probablyRequiredTools: [
        'get_latest_device_telemetry',
        'get_recent_device_events',
        'search_maintenance_knowledge',
      ],
      optionalTools: ['get_device'],
      probablyUnnecessaryTools: [],
      expectedAnswerCharacteristics: [
        'Reports current telemetry and the maintenance.required event',
        'Identifies motor-bearing metadata if returned by the event tool',
        'Separates device observations from maintenance guidance',
        'Describes inspection guidance from retrieved documentation',
        'States that the evidence does not confirm a specific root cause',
      ],
      failureIndicators: [
        'Claims that the bearing has definitely failed',
        'Invents a mechanical root cause',
        'Presents general inspection guidance as observed device facts',
        'Classifies numeric telemetry without supporting reference data',
      ],
    },
    {
      id: 'INTEGRATED-004',
      question:
        'Does vibration-sensor-001 still have a valid warranty, and is it currently healthy?',
      probablyRequiredTools: [
        'get_device',
        'get_latest_device_telemetry',
        'get_recent_device_events',
        'search_maintenance_knowledge',
      ],
      optionalTools: [],
      probablyUnnecessaryTools: [],
      expectedAnswerCharacteristics: [
        'States that warranty validity cannot be determined',
        'Does not invent a warranty duration',
        'Reports relevant current facts separately from general guidance',
        'Does not reduce health to an unsupported binary conclusion',
      ],
      failureIndicators: [
        'Invents a warranty period',
        'Claims that the device is healthy without sufficient evidence',
        'Claims that maintenance documentation proves a current fault',
        'Ignores relevant telemetry or events',
      ],
    },
  ];
