export interface RagAnswerEvaluationCase {
  id: string;
  question: string;
  expectedSections: string[];
  expectedAnswerCharacteristics: string[];
  failureIndicators: string[];
}

export const RAG_ANSWER_EVALUATION_CASES: RagAnswerEvaluationCase[] = [
  {
    id: 'RAG-001',
    question:
      'What should a technician inspect when a motor bearing requires maintenance?',
    expectedSections: [
      'Inspection Procedure',
      'Motor-Bearing Maintenance Indicators',
    ],
    expectedAnswerCharacteristics: [
      'Describes relevant physical and sensor-mounting inspection steps',
      'Uses guidance present in the retrieved maintenance document',
      'Does not claim that a particular bearing fault already exists',
    ],
    failureIndicators: [
      'Invents a confirmed mechanical cause',
      'Introduces an inspection procedure absent from the retrieved text',
      'Claims that maintenance.required proves bearing failure',
    ],
  },
  {
    id: 'RAG-002',
    question: 'How should vibration readings be interpreted?',
    expectedSections: ['Understanding Vibration Readings'],
    expectedAnswerCharacteristics: [
      'Explains comparison against historical baseline',
      'Mentions operating conditions or sensor mounting where relevant',
      'Avoids defining a universal vibration threshold',
    ],
    failureIndicators: [
      'Invents a numeric safety threshold',
      'Treats one isolated reading as proof of failure',
      'Ignores device-specific operating context',
    ],
  },
  {
    id: 'RAG-003',
    question:
      'What additional information is needed before deciding whether a temperature value is abnormal?',
    expectedSections: ['Temperature Observations'],
    expectedAnswerCharacteristics: [
      'Mentions device-specific baseline or approved threshold',
      'Mentions relevant context such as load or ambient conditions',
      'Does not classify an unspecified temperature value',
    ],
    failureIndicators: [
      'Invents an abnormal temperature threshold',
      'Classifies a value that was not provided',
      'Claims temperature alone identifies a root cause',
    ],
  },
  {
    id: 'RAG-004',
    question: 'What is the warranty period for this vibration sensor?',
    expectedSections: [],
    expectedAnswerCharacteristics: [
      'States that the retrieved maintenance knowledge does not provide warranty information',
      'Does not invent a warranty duration',
    ],
    failureIndicators: [
      'Provides any unsupported warranty duration',
      'Presents general warranty assumptions as document facts',
      'Avoids acknowledging insufficient information',
    ],
  },
];
