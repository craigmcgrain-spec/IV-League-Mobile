import { completionSummary } from './history';

describe('completion history', () => {
  it('stores the procedure summary with structured procedure facts', () => {
    const summary = completionSummary({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'IV Insertion',
        size: '20ga',
        catheterLength: null,
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
      details: '20ga · Right Forearm',
      procedure: {
        task: 'IV Insertion',
        size: '20ga',
        catheterLength: null,
        side: 'Right',
        location: 'Forearm',
      },
    });
  });

  it('rejects records without a selected task', () => {
    expect(() => completionSummary({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        facility: 'Demo Medical Center',
        roomNumber: '',
      },
      procedure: {
        task: null,
        size: null,
        catheterLength: null,
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
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'Blood Draw',
        size: null,
        catheterLength: null,
        side: 'Left',
        location: 'Antecubital',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(summary.details).toBe('Left Antecubital');
  });

  it('stores PICC catheter length with side and location', () => {
    const summary = completionSummary({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'PICC Insertion',
        size: null,
        catheterLength: '45 cm',
        side: 'Right',
        location: 'Upper Arm',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(summary.details).toBe('Length: 45 cm · Right Upper Arm');
  });

  it('stores Midline side and location', () => {
    const summary = completionSummary({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'Midline Insertion',
        size: null,
        catheterLength: null,
        side: 'Left',
        location: 'Upper Arm',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(summary.details).toBe('Left Upper Arm');
  });

  it('stores Port Access side and Chest location', () => {
    const summary = completionSummary({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'Port Access',
        size: null,
        catheterLength: null,
        side: 'Right',
        location: 'Chest',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(summary.task).toBe('Port Access');
    expect(summary.details).toBe('Right Chest');
  });

  it('stores troubleshooting device, site, and free-text notes', () => {
    const summary = completionSummary({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'Troubleshoot',
        size: null,
        catheterLength: null,
        side: 'Left',
        location: 'Upper Arm',
        troubleshootDevice: 'PICC',
        notes: 'Difficult flush; dressing and tubing inspected.',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(summary.details).toBe(
      'Device: PICC · Left Upper Arm · Notes: Difficult flush; dressing and tubing inspected.',
    );
  });

  it('stores notes for any task, not only troubleshooting', () => {
    const summary = completionSummary({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'Dressing Change',
        size: null,
        catheterLength: null,
        side: 'Right',
        location: 'Port',
        notes: 'Adhesive irritation noted.',
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(summary.details).toBe('Right Port · Notes: Adhesive irritation noted.');
  });

  it('stores supply quantities and ignores empty or invalid entries', () => {
    const summary = completionSummary({
      profile: { name: 'Demo Clinician', credentials: 'RN' },
      client: {
        name: 'Demo Patient',
        facility: 'Demo Medical Center',
        roomNumber: '204B',
      },
      procedure: {
        task: 'IV Insertion',
        size: '20ga',
        catheterLength: null,
        side: 'Right',
        location: 'Forearm',
        supplies: {
          'Supplies: IV': '2',
          'Supplies: Midline': '',
          'Supplies: Dressing': '0',
          'Supplies: PICC': 'not-a-number',
        },
      },
      completedAt: new Date('2026-09-01T12:00:00Z'),
    });

    expect(summary.details).toBe('20ga · Right Forearm · Supplies: IV x2');
  });
});
