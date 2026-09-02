import { buildAttachmentFilename, buildReportHtml, escapeHtml } from './pdf';

jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-print', () => ({}));
jest.mock('expo-sharing', () => ({}));

describe('PDF report', () => {
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
    expect(html).toContain('Right');
    expect(html).toContain('Forearm');
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
      procedure: { task: 'Blood Draw', size: null, side: null, location: null },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    })).toBe('Demo-Facility_..-Demo-Patient_2026-09-01.pdf');
  });
});
