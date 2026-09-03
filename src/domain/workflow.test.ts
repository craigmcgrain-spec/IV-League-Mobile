import {
  formatProcedureDateTime,
  needsCatheterSize,
  needsProcedureDetails,
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

  it('extracts labeled intake fields without guessing unlabeled patient data', () => {
    expect(parseIntakeText(`
      Name: Demo Patient
      DOB: 01/02/1980
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
      side: null,
      location: null,
    })).toEqual(['side', 'location']);
    expect(validateProcedure({
      task: 'Blood Draw',
      size: null,
      side: 'Left',
      location: 'Antecubital',
    })).toEqual([]);
  });
});
