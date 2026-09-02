import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

import type { UserProfile } from '../types';

const ACCOUNT_KEY = 'iv-league.account.v1';
const BIOMETRICS_KEY = 'iv-league.biometrics.v1';
const ITERATIONS = 210_000;

interface StoredAccount {
  profile: UserProfile;
  salt: string;
  passwordHash: string;
}

export interface Account {
  profile: UserProfile;
  biometricsEnabled: boolean;
}

async function derivePassword(password: string, saltHex: string): Promise<string> {
  const key = await pbkdf2Async(sha256, utf8ToBytes(password), hexToBytes(saltHex), {
    c: ITERATIONS,
    dkLen: 32,
    asyncTick: 10,
  });
  return bytesToHex(key);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function readStoredAccount(): Promise<StoredAccount | null> {
  const raw = await SecureStore.getItemAsync(ACCOUNT_KEY);
  if (!raw) {
    return null;
  }
  const value: unknown = JSON.parse(raw);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('profile' in value) ||
    !('salt' in value) ||
    !('passwordHash' in value)
  ) {
    throw new Error('Invalid secure account');
  }
  return value as StoredAccount;
}

export async function loadAccount(): Promise<Account | null> {
  const account = await readStoredAccount();
  if (!account) {
    return null;
  }
  return {
    profile: account.profile,
    biometricsEnabled: (await SecureStore.getItemAsync(BIOMETRICS_KEY)) === 'true',
  };
}

export async function createAccount(profile: UserProfile, password: string): Promise<Account> {
  const salt = bytesToHex(await Crypto.getRandomBytesAsync(16));
  const passwordHash = await derivePassword(password, salt);
  await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify({ profile, salt, passwordHash }), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(BIOMETRICS_KEY, 'false', {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return { profile, biometricsEnabled: false };
}

export async function verifyPassword(password: string): Promise<boolean> {
  const account = await readStoredAccount();
  if (!account) {
    return false;
  }
  return constantTimeEqual(await derivePassword(password, account.salt), account.passwordHash);
}

export async function getBiometricCapability(): Promise<boolean> {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export async function setBiometricLogin(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRICS_KEY, String(enabled), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export function authenticateWithBiometrics(promptMessage = 'Sign in to IV League') {
  return LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Use password',
    disableDeviceFallback: false,
  });
}
