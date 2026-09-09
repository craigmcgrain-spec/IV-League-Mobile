import { shareFile } from './sharing';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

describe('file sharing', () => {
  it('rejects non-file URIs before opening the share sheet', async () => {
    await expect(shareFile('content://exports/data.csv', {
      dialogTitle: 'Share data',
      mimeType: 'text/csv',
    })).resolves.toEqual({
      ok: false,
      reason: 'invalid-uri',
      message: 'Shared files must use a local file URI.',
    });
  });
});
