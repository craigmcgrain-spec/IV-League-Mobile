import { sharePdf } from './reliableSharing';

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));

describe('reliable PDF sharing', () => {
  it('rejects non-file attachment URIs', async () => {
    await expect(sharePdf('content://reports/test.pdf', 'Share report')).resolves.toEqual({
      ok: false,
      reason: 'invalid-uri',
      message: 'PDF attachments must use a local file URI.',
    });
  });
});
