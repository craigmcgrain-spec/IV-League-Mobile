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
        catheterLength: null,
        attempts: '1',
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
      roomNumber: '204B',
      details: '20ga · Attempts: 1 · Right Forearm',
    });
    expect(summary).not.toHaveProperty('dateOfBirth');
    expect(summary).not.toHaveProperty('medicalRecordNumber');
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
      procedure: {
        task: null,
        size: null,
        catheterLength: null,
        attempts: null,
        side: null,
        location: null,
      },
      completedAt: new Date(),
    })).toThrow('must have a task');
  });

  it('stores blood draw side and location without a catheter size', () => {
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
        task: 'Blood Draw',
        size: null,
        catheterLength: null,
        attempts: '2',
        side: 'Left',
        location: 'Antecubital',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(summary.details).toBe('Attempts: 2 · Left Antecubital');
  });

  it('stores PICC catheter length with side and location', () => {
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
        task: 'PICC Insertion',
        size: null,
        catheterLength: '45 cm',
        attempts: '1',
        side: 'Right',
        location: 'Upper Arm',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(summary.details).toBe('Length: 45 cm · Attempts: 1 · Right Upper Arm');
  });

  it('stores Midline attempts with side and location', () => {
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
        task: 'Midline Insertion',
        size: null,
        catheterLength: null,
        attempts: '1',
        side: 'Left',
        location: 'Upper Arm',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(summary.details).toBe('Attempts: 1 · Left Upper Arm');
  });
});
