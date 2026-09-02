import { buildReportHtml, escapeHtml } from './pdf';

jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-print', () => ({}));
jest.mock('expo-sharing', () => ({}));

describe('PDF report', () => {
  it('escapes user-entered values', () => {
    expect(escapeHtml('<Demo & "Test">')).toBe('&lt;Demo &amp; &quot;Test&quot;&gt;');
  });

  it('contains letterhead, user, client, task, and procedure details', () => {
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
        task: 'IV Insertion',
        size: '20ga',
        side: 'Right',
        location: 'Forearm',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(html).toContain('IV LEAGUE');
    expect(html).toContain('Demo Clinician');
    expect(html).toContain('SAFE-001');
    expect(html).toContain('IV Insertion');
    expect(html).toContain('20ga');
    expect(html).toContain('Right');
    expect(html).toContain('Forearm');
    expect(html).not.toContain('Demo Patient.pdf');
  });
});
