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

export function formatProcedureDateTime(value: Date): { date: string; time: string } {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const year = value.getFullYear();
  const period = value.getHours() >= 12 ? 'PM' : 'AM';
  const hour = value.getHours() % 12 || 12;
  const minute = String(value.getMinutes()).padStart(2, '0');
  return {
    date: `${month}/${day}/${year}`,
    time: `${hour}:${minute} ${period}`,
  };
}

export function parseProcedureDateTime(dateValue: string, timeValue: string): Date | null {
  const dateMatch = dateValue.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const timeMatch = timeValue.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i);
  if (!dateMatch || !timeMatch) {
    return null;
  }

  const month = Number(dateMatch[1]);
  const day = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const enteredHour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const period = timeMatch[3]?.toUpperCase();
  if (minute > 59 || (period && (enteredHour < 1 || enteredHour > 12)) || (!period && enteredHour > 23)) {
    return null;
  }

  const hour = period
    ? (enteredHour % 12) + (period === 'PM' ? 12 : 0)
    : enteredHour;
  const result = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    result.getFullYear() !== year
    || result.getMonth() !== month - 1
    || result.getDate() !== day
  ) {
    return null;
  }
  return result;
}

export function needsCatheterSize(task: ProcedureTask | null): boolean {
  return task === 'IV Insertion';
}

export function needsCatheterLength(task: ProcedureTask | null): boolean {
  return task === 'PICC Insertion';
}

export function needsProcedureDetails(task: ProcedureTask | null): boolean {
  return task !== null;
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
    needsCatheterSize(procedure.task) && !procedure.size ? 'size' : '',
    needsCatheterLength(procedure.task) && !procedure.catheterLength?.trim() ? 'catheter length' : '',
    !procedure.side ? 'side' : '',
    !procedure.location ? 'location' : '',
  ].filter(Boolean);
}

export function formatDateOfBirthInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
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
        const value = match[1].trim();
        parsed[field] = field === 'dateOfBirth' ? formatDateOfBirthInput(value) : value;
        break;
      }
    }
  }
  return parsed;
}
