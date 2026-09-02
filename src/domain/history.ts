import type { CompletedProcedure, CompletionRecord } from '../types';

export type NewCompletedProcedure = Omit<CompletedProcedure, 'id' | 'hasPdf' | 'pdfFilename'>;

export function completionSummary(record: CompletionRecord): NewCompletedProcedure {
  if (!record.procedure.task) {
    throw new Error('A completed procedure must have a task');
  }
  const details = record.procedure.size && record.procedure.side && record.procedure.location
    ? `${record.procedure.size} · ${record.procedure.side} ${record.procedure.location}`
    : '';

  return {
    completedAt: record.completedAt.toISOString(),
    task: record.procedure.task,
    clientName: record.client.name.trim(),
    facility: record.client.facility.trim(),
    details,
  };
}
