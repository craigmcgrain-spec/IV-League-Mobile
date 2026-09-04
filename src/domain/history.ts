import {
  needsAttempts,
  needsCatheterLength,
  needsCatheterSize,
  needsProcedureDetails,
} from './workflow';
import type { CompletedProcedure, CompletionRecord } from '../types';

export type NewCompletedProcedure = Omit<
  CompletedProcedure,
  'id' | 'hasPdf' | 'pdfFilename' | 'includedInBatch' | 'archived'
>;

export function completionSummary(record: CompletionRecord): NewCompletedProcedure {
  if (!record.procedure.task) {
    throw new Error('A completed procedure must have a task');
  }
  const details = [
    needsCatheterSize(record.procedure.task) ? record.procedure.size : null,
    needsCatheterLength(record.procedure.task) && record.procedure.catheterLength?.trim()
      ? `Length: ${record.procedure.catheterLength.trim()}`
      : null,
    needsProcedureDetails(record.procedure.task) && record.procedure.side && record.procedure.location
      ? `${record.procedure.side} ${record.procedure.location}`
      : null,
    needsAttempts(record.procedure.task) && record.procedure.attempts
      ? `Attempts: ${record.procedure.attempts}`
      : null,
  ].filter(Boolean).join(' · ');

  return {
    completedAt: record.completedAt.toISOString(),
    task: record.procedure.task,
    clientName: record.client.name.trim(),
    facility: record.client.facility.trim(),
    roomNumber: record.client.roomNumber.trim(),
    details,
  };
}
