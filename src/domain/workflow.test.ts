import {
  needsProcedureDetails,
  parseIntakeText,
  validateClient,
  validateProcedure,
} from './workflow';

describe('workflow', () => {
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

  it('requires one size, side, and location for IV and PICC procedures', () => {
    expect(needsProcedureDetails('PICC Insertion')).toBe(true);
    expect(validateProcedure({
      task: 'IV Insertion',
      size: '20ga',
      side: null,
      location: null,
    })).toEqual(['side', 'location']);
  });

  it('does not request catheter details for other tasks', () => {
    expect(validateProcedure({
      task: 'Blood Draw',
      size: null,
      side: null,
      location: null,
    })).toEqual([]);
  });
});
