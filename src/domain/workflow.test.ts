import {
  defaultAttemptsForTask,
  formatDateOfBirthInput,
  formatProcedureDateTime,
  locationsForTask,
  needsCatheterLength,
  needsCatheterSize,
  needsAttempts,
  needsProcedureDetails,
  parseIntakeText,
  parseProcedureDateTime,
  validateClient,
  validateProcedure,
} from './workflow';

describe('workflow', () => {
  it('inserts date-of-birth separators while typing or pasting', () => {
    expect(formatDateOfBirthInput('1')).toBe('1');
    expect(formatDateOfBirthInput('010')).toBe('01/0');
    expect(formatDateOfBirthInput('01021980')).toBe('01/02/1980');
    expect(formatDateOfBirthInput('01/02/1980')).toBe('01/02/1980');
    expect(formatDateOfBirthInput('01021980123')).toBe('01/02/1980');
  });

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
      DOB: 01021980
      MRN # SAFE-001
      Facility: Demo Medical Center
      Room: 204B
    `)).toEqual({
      name: 'Demo Patient',
      dateOfBirth: '01/02/1980',
      medicalRecordNumber: 'SAFE-001',
      facility: 'Demo Medical Center',
      roomNumber: '204B',
    });
  });

  it('recognizes a unique standalone client name formatted as Last, First', () => {
    expect(parseIntakeText(`
      McGrain, Craig
      DOB: 01021980
      MRN: SAFE-001
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

  it('requires every client field', () => {
    expect(validateClient({
      name: 'Demo Patient',
      dateOfBirth: '',
      medicalRecordNumber: 'SAFE-001',
      facility: 'Demo Medical Center',
      roomNumber: '',
    })).toEqual(['date of birth', 'room number']);
  });

  it('requires size, side, and location for IV and PICC procedures', () => {
    expect(needsCatheterSize('IV Insertion')).toBe(true);
    expect(needsProcedureDetails('PICC Insertion')).toBe(true);
    expect(validateProcedure({
      task: 'IV Insertion',
      size: '20ga',
      catheterLength: null,
      attempts: '1',
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
      attempts: '1',
      side: null,
      location: null,
    })).toEqual(['side', 'location']);
    expect(validateProcedure({
      task: 'Blood Draw',
      size: null,
      catheterLength: null,
      attempts: '2',
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
      attempts: '1',
      side: 'Right',
      location: 'Upper Arm',
    })).toEqual(['catheter length']);
    expect(validateProcedure({
      task: 'PICC Insertion',
      size: null,
      catheterLength: '45 cm',
      attempts: '1',
      side: 'Right',
      location: 'Upper Arm',
    })).toEqual([]);
  });

  it('requires side and location for dressing changes', () => {
    expect(needsProcedureDetails('Dressing Change')).toBe(true);
    expect(validateProcedure({
      task: 'Dressing Change',
      size: null,
      catheterLength: null,
      attempts: null,
      side: null,
      location: null,
    })).toEqual(['side', 'location']);
  });

  it('supports Midline Insertion with default attempts, side, and location', () => {
    expect(needsCatheterSize('Midline Insertion')).toBe(false);
    expect(needsCatheterLength('Midline Insertion')).toBe(false);
    expect(needsAttempts('Midline Insertion')).toBe(true);
    expect(defaultAttemptsForTask('Midline Insertion')).toBe('1');
    expect(validateProcedure({
      task: 'Midline Insertion',
      size: null,
      catheterLength: null,
      attempts: null,
      side: null,
      location: null,
    })).toEqual(['number of attempts', 'side', 'location']);
    expect(validateProcedure({
      task: 'Midline Insertion',
      size: null,
      catheterLength: null,
      attempts: '1',
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
      attempts: null,
      side: 'Right',
      location: 'Port',
    })).toEqual(['location']);
    expect(validateProcedure({
      task: 'Port Access',
      size: null,
      catheterLength: null,
      attempts: null,
      side: 'Right',
      location: 'Chest',
    })).toEqual([]);
    expect(validateProcedure({
      task: 'Dressing Change',
      size: null,
      catheterLength: null,
      attempts: null,
      side: 'Left',
      location: 'Port',
    })).toEqual([]);
  });
});
