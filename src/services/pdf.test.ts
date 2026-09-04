import {
  buildAttachmentFilename,
  buildCompletedProceduresFilename,
  buildCompletedProceduresHtml,
  buildReportHtml,
  cleanupStaleSharedReports,
  escapeHtml,
} from './pdf';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/cache/',
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
}));
jest.mock('expo-print', () => ({}));
jest.mock('expo-sharing', () => ({}));

describe('PDF report', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('escapes user-entered values', () => {
    expect(escapeHtml('<Demo & "Test">')).toBe('&lt;Demo &amp; &quot;Test&quot;&gt;');
  });

  it('contains letterhead, user, client, task, and procedure details', () => {
    const record = {
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        dateOfBirth: '01/02/1980',
        medicalRecordNumber: 'SAFE-001',
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'IV Insertion',
        size: '20ga',
        catheterLength: null,
        attempts: '1',
        side: 'Right',
        location: 'Forearm',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    } as const;
    const html = buildReportHtml(record);

    expect(html).toContain('IV LEAGUE');
    expect(html).toContain('Demo Clinician');
    expect(html).toContain('SAFE-001');
    expect(html).toContain('IV Insertion');
    expect(html).toContain('20ga');
    expect(html).toContain('<th>Number of attempts</th><td>1</td>');
    expect(html).toContain('Right');
    expect(html).toContain('Forearm');
    expect(html.indexOf('<th>Location</th>'))
      .toBeLessThan(html.indexOf('<th>Number of attempts</th>'));
    expect(buildAttachmentFilename(record)).toBe('Demo Medical Center_Demo Patient_2026-09-01.pdf');
  });

  it('removes path and reserved characters from the attachment name', () => {
    expect(buildAttachmentFilename({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: '../Demo/Patient',
        dateOfBirth: '01/02/1980',
        medicalRecordNumber: 'SAFE-001',
        facility: 'Demo:Facility?',
        roomNumber: '204B',
      },
      procedure: {
        task: 'Blood Draw',
        size: null,
        catheterLength: null,
        attempts: '1',
        side: null,
        location: null,
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    })).toBe('Demo-Facility_..-Demo-Patient_2026-09-01.pdf');
  });

  it('removes shared reports after the provider retention window', async () => {
    const fileSystem = jest.requireMock('expo-file-system/legacy') as {
      deleteAsync: jest.Mock;
      getInfoAsync: jest.Mock;
      readDirectoryAsync: jest.Mock;
    };
    fileSystem.getInfoAsync
      .mockResolvedValueOnce({ exists: true })
      .mockResolvedValueOnce({ exists: true, modificationTime: 1_000 });
    fileSystem.readDirectoryAsync.mockResolvedValue(['Demo Facility_Demo Patient_2026-09-01.pdf']);

    await cleanupStaleSharedReports(1_000 * 1_000 + 60 * 60 * 1_000);

    expect(fileSystem.deleteAsync).toHaveBeenCalledWith(
      '/cache/iv-league-reports/Demo Facility_Demo Patient_2026-09-01.pdf',
      { idempotent: true },
    );
  });

  it('formats a selected Completed Procedures document', () => {
    const records = [{
      id: 1,
      completedAt: '2026-09-01T12:00:00.000Z',
      task: 'IV Insertion',
      clientName: 'Demo Patient',
      facility: 'Demo Medical Center',
      roomNumber: '204B',
      details: '20ga · Right Forearm · Attempts: 1',
      hasPdf: true,
      pdfFilename: 'demo.pdf',
      includedInBatch: false,
      archived: false,
    }] as const;

    const html = buildCompletedProceduresHtml(
      { name: 'Demo Clinician', credentials: 'RN' },
      [...records],
    );

    expect(html).toContain('Demo Clinician, RN');
    expect(html).toContain('09/01/2026 through 09/01/2026');
    expect(html).toContain('Demo Patient at Demo Medical Center room 204B');
    expect(html).toContain('IV Insertion - 20ga · Right Forearm · Attempts: 1');
    expect(buildCompletedProceduresFilename([...records]))
      .toBe('Completed Procedures_2026-09-01_to_2026-09-01.pdf');
  });

  it('includes side and location but not catheter size for a blood draw', () => {
    const html = buildReportHtml({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        dateOfBirth: '01/02/1980',
        medicalRecordNumber: 'SAFE-001',
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'Blood Draw',
        size: null,
        catheterLength: null,
        attempts: '2',
        side: 'Left',
        location: 'Antecubital',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(html).toContain('<th>Side</th><td>Left</td>');
    expect(html).toContain('<th>Location</th><td>Antecubital</td>');
    expect(html).toContain('<th>Number of attempts</th><td>2</td>');
    expect(html).not.toContain('<th>Size</th>');
  });

  it('includes catheter length but not gauge size for a PICC insertion', () => {
    const html = buildReportHtml({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        dateOfBirth: '01/02/1980',
        medicalRecordNumber: 'SAFE-001',
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'PICC Insertion',
        size: null,
        catheterLength: '45 cm',
        attempts: '1',
        side: 'Right',
        location: 'Upper Arm',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(html).toContain('<th>Catheter length</th><td>45 cm</td>');
    expect(html).toContain('<th>Number of attempts</th><td>1</td>');
    expect(html).not.toContain('<th>Size</th>');
  });

  it('includes attempts, side, and location for a Midline insertion', () => {
    const html = buildReportHtml({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        dateOfBirth: '01/02/1980',
        medicalRecordNumber: 'SAFE-001',
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'Midline Insertion',
        size: null,
        catheterLength: null,
        attempts: '1',
        side: 'Right',
        location: 'Upper Arm',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(html).toContain('Midline Insertion');
    expect(html).toContain('<th>Number of attempts</th><td>1</td>');
    expect(html).toContain('<th>Side</th><td>Right</td>');
    expect(html).toContain('<th>Location</th><td>Upper Arm</td>');
    expect(html).not.toContain('<th>Size</th>');
    expect(html).not.toContain('<th>Catheter length</th>');
  });
});
