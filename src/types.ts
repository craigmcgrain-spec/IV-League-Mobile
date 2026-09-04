export interface UserProfile {
  name: string;
  credentials: string;
}

export interface Client {
  name: string;
  dateOfBirth: string;
  medicalRecordNumber: string;
  facility: string;
  roomNumber: string;
}

export type ProcedureTask =
  | 'IV Insertion'
  | 'Midline Insertion'
  | 'PICC Insertion'
  | 'Blood Draw'
  | 'Dressing Change'
  | 'Port Access';
export type ProcedureSize = '24ga' | '22ga' | '20ga' | '18ga' | '16ga';
export type ProcedureAttempts = '1' | '2' | '3' | '4' | '5+';
export type ProcedureSide = 'Right' | 'Left';
export type ProcedureLocation =
  | 'Hand'
  | 'Wrist'
  | 'Forearm'
  | 'Antecubital'
  | 'Upper Arm'
  | 'Chest'
  | 'Port';

export interface Procedure {
  task: ProcedureTask | null;
  size: ProcedureSize | null;
  catheterLength: string | null;
  attempts: ProcedureAttempts | null;
  side: ProcedureSide | null;
  location: ProcedureLocation | null;
}

export interface CompletionRecord {
  profile: UserProfile;
  client: Client;
  procedure: Procedure;
  completedAt: Date;
}

export interface CompletedProcedure {
  id: number;
  completedAt: string;
  task: ProcedureTask;
  clientName: string;
  facility: string;
  roomNumber: string;
  details: string;
  hasPdf: boolean;
  pdfFilename: string | null;
  includedInBatch: boolean;
  archived: boolean;
}
