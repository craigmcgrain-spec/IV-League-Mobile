import { completionSummary } from './history';

describe('completion history', () => {
  it('stores only the minimal procedure summary', () => {
    const summary = completionSummary({
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

    expect(summary).toEqual({
      completedAt: '2026-09-01T12:00:00.000Z',
      task: 'IV Insertion',
      clientName: 'Demo Patient',
      facility: 'Demo Medical Center',
      details: '20ga · Right Forearm',
    });
    expect(summary).not.toHaveProperty('dateOfBirth');
    expect(summary).not.toHaveProperty('medicalRecordNumber');
    expect(summary).not.toHaveProperty('roomNumber');
  });

  it('rejects records without a selected task', () => {
    expect(() => completionSummary({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        dateOfBirth: '',
        medicalRecordNumber: '',
        facility: 'Demo Medical Center',
        roomNumber: '',
      },
      procedure: { task: null, size: null, side: null, location: null },
      completedAt: new Date(),
    })).toThrow('must have a task');
  });
});
