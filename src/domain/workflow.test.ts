import {
  formatProcedureDateTime,
  locationsForTask,
  needsCatheterLength,
  needsCatheterSize,
  needsProcedureDetails,
  parseSupplyQuantity,
  parseIntakeText,
  parseProcedureDateTime,
  validateClient,
  validateProcedure,
} from './workflow';

describe('workflow', () => {
  it('formats and parses editable local procedure dates and times', () => {
    const source = new Date(2026, 8, 2, 21, 7);
    expect(formatProcedureDateTime(source)).toEqual({
      date: '09/02/2026',
      time: '9:07 PM',
    });
    expect(parseProcedureDateTime('09/02/2026', '9:07 PM')).toEqual(source);
    expect(parseProcedureDateTime('09/02/2026', '21:07')).toEqual(source);
    expect(parseProcedureDateTime('02/30/2026', '9:07 PM')).toBeNull();
    expect(parseProcedureDateTime('09/02/2026', '13:07 PM')).toBeNull();
  });

  it('extracts labeled intake fields', () => {
    expect(parseIntakeText(`
      Name: Demo Patient
      Facility: Demo Medical Center
      Room: 204B
    `)).toEqual({
      name: 'Demo Patient',
      facility: 'Demo Medical Center',
      roomNumber: '204B',
    });
  });

  it('recognizes a unique standalone client name formatted as Last, First', () => {
    expect(parseIntakeText(`
      McGrain, Craig
      Facility: Demo Medical Center
      Room: 204B
    `).name).toBe('McGrain, Craig');
  });

  it('prioritizes labeled names and does not guess between multiple comma lines', () => {
    expect(parseIntakeText(`
      Patient: Craig McGrain
      McGrain, Craig
    `).name).toBe('Craig McGrain');
    expect(parseIntakeText(`
      McGrain, Craig
      Account, Holder
    `).name).toBeUndefined();
  });

  it('requires every supported client field', () => {
    expect(validateClient({
      name: 'Demo Patient',
      facility: 'Demo Medical Center',
      roomNumber: '',
    })).toEqual(['room number']);
  });

  it('requires size, side, and location for IV and PICC procedures', () => {
    expect(needsCatheterSize('IV Insertion')).toBe(true);
    expect(needsProcedureDetails('PICC Insertion')).toBe(true);
    expect(validateProcedure({
      task: 'IV Insertion',
      size: '20ga',
      catheterLength: null,
      side: null,
      location: null,
    })).toEqual(['side', 'location']);
  });

  it('requires side and location but not catheter size for blood draws', () => {
    expect(needsCatheterSize('Blood Draw')).toBe(false);
    expect(needsProcedureDetails('Blood Draw')).toBe(true);
    expect(validateProcedure({
      task: 'Blood Draw',
      size: null,
      catheterLength: null,
      side: null,
      location: null,
    })).toEqual(['side', 'location']);
    expect(validateProcedure({
      task: 'Blood Draw',
      size: null,
      catheterLength: null,
      side: 'Left',
      location: 'Antecubital',
    })).toEqual([]);
  });

  it('requires catheter length, side, and location for PICC insertion without a gauge', () => {
    expect(needsCatheterSize('PICC Insertion')).toBe(false);
    expect(needsCatheterLength('PICC Insertion')).toBe(true);
    expect(validateProcedure({
      task: 'PICC Insertion',
      size: null,
      catheterLength: '',
      side: 'Right',
      location: 'Upper Arm',
    })).toEqual(['catheter length']);
    expect(validateProcedure({
      task: 'PICC Insertion',
      size: null,
      catheterLength: '45 cm',
      side: 'Right',
      location: 'Upper Arm',
    })).toEqual([]);
  });

  it('requires side and location for dressing changes without a cap-change answer', () => {
    expect(needsProcedureDetails('Dressing Change')).toBe(true);
    expect(validateProcedure({
      task: 'Dressing Change',
      size: null,
      catheterLength: null,
      side: null,
      location: null,
    })).toEqual(['side', 'location']);
    expect(validateProcedure({
      task: 'Dressing Change',
      size: null,
      catheterLength: null,
      side: 'Left',
      location: 'Port',
    })).toEqual([]);
  });

  it('supports Midline Insertion with side and location only', () => {
    expect(needsCatheterSize('Midline Insertion')).toBe(false);
    expect(needsCatheterLength('Midline Insertion')).toBe(false);
    expect(validateProcedure({
      task: 'Midline Insertion',
      size: null,
      catheterLength: null,
      side: null,
      location: null,
    })).toEqual(['side', 'location']);
    expect(validateProcedure({
      task: 'Midline Insertion',
      size: null,
      catheterLength: null,
      side: 'Right',
      location: 'Upper Arm',
    })).toEqual([]);
  });

  it('limits Port Access to Chest and adds Port to Dressing Change', () => {
    expect(locationsForTask('Port Access')).toEqual(['Chest']);
    expect(locationsForTask('Dressing Change')).toContain('Port');
    expect(locationsForTask('IV Insertion')).not.toContain('Port');
    expect(validateProcedure({
      task: 'Port Access',
      size: null,
      catheterLength: null,
      side: 'Right',
      location: 'Port',
    })).toEqual(['location']);
    expect(validateProcedure({
      task: 'Port Access',
      size: null,
      catheterLength: null,
      side: 'Right',
      location: 'Chest',
    })).toEqual([]);
    expect(validateProcedure({
      task: 'Dressing Change',
      size: null,
      catheterLength: null,
      side: 'Left',
      location: 'Port',
    })).toEqual([]);
  });

  it('requires device type, notes, side, and location for troubleshooting', () => {
    expect(locationsForTask('Troubleshoot')).toEqual([
      'Hand',
      'Wrist',
      'Forearm',
      'Antecubital',
      'Upper Arm',
    ]);
    expect(validateProcedure({
      task: 'Troubleshoot',
      size: null,
      catheterLength: null,
      side: null,
      location: null,
      troubleshootDevice: null,
      notes: ' ',
    })).toEqual(['device type', 'troubleshooting notes', 'side', 'location']);
    expect(validateProcedure({
      task: 'Troubleshoot',
      size: null,
      catheterLength: null,
      side: 'Right',
      location: 'Forearm',
      troubleshootDevice: 'IV',
      notes: 'No blood return; repositioned and flushed.',
    })).toEqual([]);
  });

  it('treats notes as optional for non-troubleshooting tasks', () => {
    expect(validateProcedure({
      task: 'IV Insertion',
      size: '20ga',
      catheterLength: null,
      side: 'Right',
      location: 'Forearm',
      notes: '',
      supplies: {},
    })).toEqual([]);
  });

  it('rejects supplies quantities that are not non-negative numbers', () => {
    expect(parseSupplyQuantity('2')).toBe(2);
    expect(parseSupplyQuantity('2.5')).toBe(2.5);
    expect(parseSupplyQuantity(' 0 ')).toBe(0);
    expect(parseSupplyQuantity('two')).toBeNull();
    expect(parseSupplyQuantity('-1')).toBeNull();
    expect(parseSupplyQuantity('')).toBeNull();
    expect(parseSupplyQuantity(null)).toBeNull();

    expect(validateProcedure({
      task: 'IV Insertion',
      size: '20ga',
      catheterLength: null,
      side: 'Right',
      location: 'Forearm',
      supplies: { 'Supplies: IV': '2', 'Supplies: Dressing': '' },
    })).toEqual([]);
    expect(validateProcedure({
      task: 'IV Insertion',
      size: '20ga',
      catheterLength: null,
      side: 'Right',
      location: 'Forearm',
      supplies: { 'Supplies: IV': 'two', 'Supplies: Dressing': '-3' },
    })).toEqual([
      'supplies quantity for IV',
      'supplies quantity for Dressing',
    ]);
  });
});
