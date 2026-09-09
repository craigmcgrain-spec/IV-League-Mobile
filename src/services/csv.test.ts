import {
  buildCompletedProceduresCsv,
  buildCompletedProceduresCsvFilename,
} from './csv';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/cache/',
}));
jest.mock('../native/sharing', () => ({
  shareFile: jest.fn(),
}));

const record = {
  id: 1,
  completedAt: '2026-09-09T12:30:00.000Z',
  task: 'Troubleshoot',
  clientName: 'Patient, Demo',
  facility: '=UNSAFE()',
  roomNumber: '204B',
  details: 'Device: IV · Right Forearm · Notes: "Flushed", then reassessed.\nCap changed.',
  hasPdf: true,
  pdfFilename: 'demo.pdf',
  includedInBatch: false,
  archived: false,
} as const;

describe('Completed Procedures CSV', () => {
  it('builds import-friendly rows with quoting and spreadsheet formula protection', () => {
    const csv = buildCompletedProceduresCsv(
      { name: 'Demo Clinician', credentials: 'RN' },
      [record],
    );

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Completed At (ISO 8601)","Task"');
    expect(csv).toContain('"Patient, Demo"');
    expect(csv).toContain('"\'=UNSAFE()"');
    expect(csv).toContain(
      '"Device: IV · Right Forearm · Notes: ""Flushed"", then reassessed. Cap changed."',
    );
  });

  it('uses the selected completion date range in the filename', () => {
    expect(buildCompletedProceduresCsvFilename([record])).toBe(
      'Completed Procedures Data_2026-09-09_to_2026-09-09.csv',
    );
  });
});
