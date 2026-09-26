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
  procedure: {
    task: 'Troubleshoot' as const,
    size: null,
    catheterLength: null,
    side: 'Right' as const,
    location: 'Forearm' as const,
    troubleshootDevice: 'IV' as const,
    notes: '"Flushed", then reassessed.',
    supplies: {
      'Supplies: IV': '2',
      'Supplies: Dressing': '',
    },
  },
  hasPdf: true,
  pdfFilename: 'demo.pdf',
  includedInBatch: false,
  archived: false,
} as const;

const legacyRecord = {
  id: 2,
  completedAt: '2026-09-01T09:00:00.000Z',
  task: 'IV Insertion',
  clientName: 'Patient, Older',
  facility: 'Legacy Facility',
  roomNumber: '101',
  details: '20ga · Right Forearm',
  procedure: null,
  hasPdf: true,
  pdfFilename: 'legacy.pdf',
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

  it('emits gauge, side, location, notes, and supply columns from the stored procedure', () => {
    const csv = buildCompletedProceduresCsv(
      { name: 'Demo Clinician', credentials: 'RN' },
      [record],
    );
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    const header = lines[0] ?? '';
    const row = lines[1] ?? '';

    expect(header).toBe([
      '"Completed At (ISO 8601)"',
      '"Task"',
      '"Clinician Name"',
      '"Clinician Credentials"',
      '"Client Name"',
      '"Facility"',
      '"Room Number"',
      '"Procedure Details"',
      '"Gauge"',
      '"Side"',
      '"Location"',
      '"Notes"',
      '"Supplies: IV"',
      '"Supplies: Midline"',
      '"Supplies: PICC"',
      '"Supplies: Port Access"',
      '"Supplies: Dressing"',
    ].join(','));

    const cells = row.match(/"(?:[^"]|"")*"/g) ?? [];
    expect(cells[8]).toBe('""');
    expect(cells[9]).toBe('"Right"');
    expect(cells[10]).toBe('"Forearm"');
    expect(cells[11]).toBe('"""Flushed"", then reassessed."');
    expect(cells[12]).toBe('"2"');
    expect(cells[13]).toBe('""');
    expect(cells[14]).toBe('""');
    expect(cells[15]).toBe('""');
    expect(cells[16]).toBe('""');
  });

  it('emits empty cells for records saved before structured procedures existed', () => {
    const csv = buildCompletedProceduresCsv(
      { name: 'Demo Clinician', credentials: 'RN' },
      [legacyRecord],
    );
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    const cells = (lines[1] ?? '').match(/"(?:[^"]|"")*"/g) ?? [];

    expect(cells.slice(8)).toEqual([
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
    ]);
  });

  it('uses the selected completion date range in the filename', () => {
    expect(buildCompletedProceduresCsvFilename([record])).toBe(
      'Completed Procedures Data_2026-09-09_to_2026-09-09.csv',
    );
  });
});
