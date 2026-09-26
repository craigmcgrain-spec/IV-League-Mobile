import {
  needsCatheterLength,
  needsCatheterSize,
  needsProcedureDetails,
  needsTroubleshootDetails,
  parseSupplyQuantity,
  SUPPLIES,
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
  const supplies = SUPPLIES
    .map((supply) => {
      const quantity = parseSupplyQuantity(record.procedure.supplies?.[supply]);
      return quantity ? `${supply} x${quantity}` : null;
    })
    .filter(Boolean);
  const details = [
    needsCatheterSize(record.procedure.task) ? record.procedure.size : null,
    needsCatheterLength(record.procedure.task) && record.procedure.catheterLength?.trim()
      ? `Length: ${record.procedure.catheterLength.trim()}`
      : null,
    needsTroubleshootDetails(record.procedure.task) && record.procedure.troubleshootDevice
      ? `Device: ${record.procedure.troubleshootDevice}`
      : null,
    needsProcedureDetails(record.procedure.task) && record.procedure.side && record.procedure.location
      ? `${record.procedure.side} ${record.procedure.location}`
      : null,
    record.procedure.notes?.trim()
      ? `Notes: ${record.procedure.notes.trim()}`
      : null,
    ...supplies,
  ].filter(Boolean).join(' · ');

  return {
    completedAt: record.completedAt.toISOString(),
    task: record.procedure.task,
    clientName: record.client.name.trim(),
    facility: record.client.facility.trim(),
    roomNumber: record.client.roomNumber.trim(),
    details,
    procedure: record.procedure,
  };
}
