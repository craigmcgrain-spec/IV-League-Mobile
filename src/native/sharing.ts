import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export type ShareFileResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-uri' | 'unsupported' | 'error'; message: string };

export async function shareFile(
  uri: string,
  options: { dialogTitle: string; mimeType: string; uti?: string },
): Promise<ShareFileResult> {
  if (!uri.startsWith('file://')) {
    return {
      ok: false,
      reason: 'invalid-uri',
      message: 'Shared files must use a local file URI.',
    };
  }
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'File sharing is available only on iOS and Android.',
    };
  }

  try {
    if (!(await Sharing.isAvailableAsync())) {
      return {
        ok: false,
        reason: 'unsupported',
        message: 'The system share sheet is unavailable.',
      };
    }
    await Sharing.shareAsync(uri, {
      dialogTitle: options.dialogTitle,
      mimeType: options.mimeType,
      UTI: options.uti,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: error instanceof Error ? error.message : 'The file could not be shared.',
    };
  }
}
