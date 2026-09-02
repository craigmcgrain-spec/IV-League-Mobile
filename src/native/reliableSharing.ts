import { requireNativeModule } from 'expo-modules-core';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

type ReliableSharingModule = {
  sharePdfAsync(uri: string, dialogTitle: string): Promise<void>;
  cleanupSharedPdfsAsync(maxAgeMs: number): Promise<void>;
  deleteSharedPdfsAsync(filename: string): Promise<void>;
};

export type SharePdfResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-uri' | 'unsupported' | 'error'; message: string };

export async function sharePdf(uri: string, dialogTitle: string): Promise<SharePdfResult> {
  if (!uri.startsWith('file://')) {
    return {
      ok: false,
      reason: 'invalid-uri',
      message: 'PDF attachments must use a local file URI.',
    };
  }

  try {
    if (Platform.OS === 'android') {
      const nativeSharing = requireNativeModule<ReliableSharingModule>('IVLeagueReliableSharing');
      await nativeSharing.sharePdfAsync(uri, dialogTitle);
    } else if (Platform.OS === 'ios') {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle,
        UTI: 'com.adobe.pdf',
      });
    } else {
      return {
        ok: false,
        reason: 'unsupported',
        message: 'PDF sharing is available only on iOS and Android.',
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: error instanceof Error ? error.message : 'The PDF could not be shared.',
    };
  }
}

export async function cleanupSharedPdfExports(maxAgeMs: number): Promise<void> {
  if (Platform.OS === 'android') {
    const nativeSharing = requireNativeModule<ReliableSharingModule>('IVLeagueReliableSharing');
    await nativeSharing.cleanupSharedPdfsAsync(maxAgeMs);
  }
}

export async function deleteSharedPdfExports(filename: string): Promise<void> {
  if (Platform.OS === 'android') {
    const nativeSharing = requireNativeModule<ReliableSharingModule>('IVLeagueReliableSharing');
    await nativeSharing.deleteSharedPdfsAsync(filename);
  }
}
