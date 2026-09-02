import type { Client, Procedure, ProcedureTask } from '../types';

export const EMPTY_CLIENT: Client = {
  name: '',
  dateOfBirth: '',
  medicalRecordNumber: '',
  facility: '',
  roomNumber: '',
};

export const TASKS = ['IV Insertion', 'PICC Insertion', 'Blood Draw', 'Dressing Change'] as const;
export const GAUGES = ['24ga', '22ga', '20ga', '18ga', '16ga'] as const;
export const SIDES = ['Right', 'Left'] as const;
export const LOCATIONS = ['Hand', 'Wrist', 'Forearm', 'Antecubital', 'Upper Arm'] as const;

export function needsProcedureDetails(task: ProcedureTask | null): boolean {
  return task === 'IV Insertion' || task === 'PICC Insertion';
}

export function validateClient(client: Client): string[] {
  const fields: [keyof Client, string][] = [
    ['name', 'name'],
    ['dateOfBirth', 'date of birth'],
    ['medicalRecordNumber', 'medical record number'],
    ['facility', 'facility'],
    ['roomNumber', 'room number'],
  ];
  return fields.filter(([key]) => !client[key].trim()).map(([, label]) => label);
}

export function validateProcedure(procedure: Procedure): string[] {
  if (!procedure.task) {
    return ['task'];
  }
  if (!needsProcedureDetails(procedure.task)) {
    return [];
  }
  return [
    !procedure.size ? 'size' : '',
    !procedure.side ? 'side' : '',
    !procedure.location ? 'location' : '',
  ].filter(Boolean);
}

const LABELS: [keyof Client, RegExp][] = [
  ['dateOfBirth', /^(?:date\s*of\s*birth|dob)\s*[:#-]?\s*(.+)$/i],
  ['medicalRecordNumber', /^(?:medical\s*record\s*(?:number|no\.?)?|mrn)\s*[:#-]?\s*(.+)$/i],
  ['facility', /^facility\s*[:#-]?\s*(.+)$/i],
  ['roomNumber', /^room(?:\s*(?:number|no\.?))?\s*[:#-]?\s*(.+)$/i],
  ['name', /^(?:client|patient)?\s*name\s*[:#-]?\s*(.+)$/i],
];

export function parseIntakeText(text: string): Partial<Client> {
  const parsed: Partial<Client> = {};
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    for (const [field, pattern] of LABELS) {
      const match = line.match(pattern);
      if (match?.[1]) {
        parsed[field] = match[1].trim();
        break;
      }
    }
  }
  return parsed;
}
