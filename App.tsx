import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { StatusBar } from 'expo-status-bar';
import { usePreventScreenCapture } from 'expo-screen-capture';
import TextRecognition from '@react-native-ml-kit/text-recognition';

import {
  authenticateWithBiometrics,
  createAccount,
  getBiometricCapability,
  loadAccount,
  setBiometricLogin,
  verifyPassword,
} from './src/services/auth';
import {
  cleanupStaleSharedReports,
  deleteCachedReport,
  generateAndShareCompletedProcedures,
  generateReport,
  shareStoredReport,
} from './src/services/pdf';
import {
  addFacility,
  archiveCompletedProcedures,
  deleteCompletedProcedure,
  deleteFacility,
  HISTORY_PAGE_SIZE,
  listFacilities,
  listCompletedProcedures,
  loadCompletedProcedurePdf,
  markProceduresIncludedInBatch,
  renameFacility,
  saveCompletedProcedure,
} from './src/services/history';
import {
  EMPTY_CLIENT,
  GAUGES,
  LOCATIONS,
  SIDES,
  TASKS,
  needsProcedureDetails,
  parseIntakeText,
  validateClient,
  validateProcedure,
} from './src/domain/workflow';
import type {
  Client,
  CompletedProcedure,
  CompletionRecord,
  Procedure,
  ProcedureLocation,
  ProcedureSide,
  ProcedureSize,
  ProcedureTask,
  UserProfile,
} from './src/types';

type Route = 'home' | 'facilities' | 'intake' | 'camera' | 'procedure' | 'review';

export default function App() {
  usePreventScreenCapture('iv-league-sensitive-content');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [account, setAccount] = useState<Awaited<ReturnType<typeof loadAccount>>>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [route, setRoute] = useState<Route>('home');
  const [client, setClient] = useState<Client>(EMPTY_CLIENT);
  const [procedure, setProcedure] = useState<Procedure>({ task: null, size: null, side: null, location: null });
  const [ocrNotice, setOcrNotice] = useState(false);
  const [completions, setCompletions] = useState<CompletedProcedure[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [facilities, setFacilities] = useState<string[]>([]);
  const [facilitiesError, setFacilitiesError] = useState(false);

  const refreshAccount = () => {
    setLoading(true);
    setLoadError(false);
    loadAccount()
      .then(setAccount)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshAccount();
    cleanupStaleSharedReports().catch(() => {
      Alert.alert('Privacy cleanup warning', 'An older temporary report could not be removed from the protected app cache.');
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (authenticated && state === 'background') {
        setAuthenticated(false);
      }
    });
    return () => subscription.remove();
  }, [authenticated]);

  useEffect(() => {
    let active = true;
    if (!authenticated) {
      return () => {
        active = false;
      };
    }
    setHistoryLoading(true);
    setHistoryError(false);
    listCompletedProcedures(0, showArchived)
      .then((page) => {
        if (active) {
          setCompletions(page.records);
          setHistoryHasMore(page.hasMore);
        }
      })
      .catch(() => {
        if (active) {
          setHistoryError(true);
        }
      })
      .finally(() => {
        if (active) {
          setHistoryLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [authenticated, showArchived]);

  useEffect(() => {
    if (!authenticated) {
      return;
    }
    setFacilitiesError(false);
    listFacilities()
      .then(setFacilities)
      .catch(() => setFacilitiesError(true));
  }, [authenticated]);

  const resetWorkflow = () => {
    setClient(EMPTY_CLIENT);
    setProcedure({ task: null, size: null, side: null, location: null });
    setOcrNotice(false);
    setShowArchived(false);
    setRoute('home');
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (loadError) {
    return <SecureStorageErrorScreen onRetry={refreshAccount} />;
  }

  if (!account) {
    return (
      <AccountSetupScreen
        onComplete={(created) => {
          setAccount(created);
          setAuthenticated(true);
        }}
      />
    );
  }

  if (!authenticated) {
    return (
      <LoginScreen
        profile={account.profile}
        biometricsEnabled={account.biometricsEnabled}
        onAuthenticated={() => setAuthenticated(true)}
      />
    );
  }

  if (route === 'home') {
    return (
      <HomeScreen
        profile={account.profile}
        biometricsEnabled={account.biometricsEnabled}
        completions={completions}
        historyLoading={historyLoading}
        historyError={historyError}
        historyHasMore={historyHasMore}
        historyLoadingMore={historyLoadingMore}
        showArchived={showArchived}
        facilitiesCount={facilities.length}
        facilitiesError={facilitiesError}
        onBiometricChange={(enabled) => setAccount({ ...account, biometricsEnabled: enabled })}
        onDeleteCompletion={async (record) => {
          if (record.pdfFilename) {
            await deleteCachedReport(record.pdfFilename);
          }
          await deleteCompletedProcedure(record.id);
          setCompletions((current) => current.filter((item) => item.id !== record.id));
        }}
        onLoadMore={async () => {
          if (historyLoadingMore) {
            return;
          }
          setHistoryLoadingMore(true);
          try {
            const page = await listCompletedProcedures(completions.length, showArchived);
            setCompletions((current) => [...current, ...page.records]);
            setHistoryHasMore(page.hasMore);
          } finally {
            setHistoryLoadingMore(false);
          }
        }}
        onHistoryViewChange={(archived) => {
          setCompletions([]);
          setShowArchived(archived);
        }}
        onRecordsIncluded={(ids) => {
          const selected = new Set(ids);
          setCompletions((current) => current.map((record) => (
            selected.has(record.id) ? { ...record, includedInBatch: true } : record
          )));
        }}
        onRecordsArchived={(ids) => {
          const selected = new Set(ids);
          setCompletions((current) => current.filter((record) => !selected.has(record.id)));
        }}
        onManageFacilities={() => setRoute('facilities')}
        onStart={() => setRoute('intake')}
        onLogout={() => {
          resetWorkflow();
          setAuthenticated(false);
        }}
      />
    );
  }

  if (route === 'facilities') {
    return (
      <FacilityDirectoryScreen
        facilities={facilities}
        onAdd={async (name) => {
          await addFacility(name);
          setFacilities(await listFacilities());
        }}
        onRename={async (currentName, nextName) => {
          await renameFacility(currentName, nextName);
          setFacilities(await listFacilities());
        }}
        onDelete={async (name) => {
          await deleteFacility(name);
          setFacilities(await listFacilities());
        }}
        onBack={() => setRoute('home')}
      />
    );
  }

  if (route === 'intake') {
    return (
      <IntakeScreen
        client={client}
        facilities={facilities}
        ocrNotice={ocrNotice}
        onChange={setClient}
        onAddFacility={async (name) => {
          await addFacility(name);
          const updatedFacilities = await listFacilities();
          setFacilities(updatedFacilities);
          const normalized = name.replace(/\s+/g, ' ').trim();
          const savedFacility = updatedFacilities.find(
            (facility) => facility.toLowerCase() === normalized.toLowerCase(),
          );
          if (!savedFacility) {
            throw new Error('Facility was not saved');
          }
          setClient((current) => ({ ...current, facility: savedFacility }));
        }}
        onScan={() => setRoute('camera')}
        onBack={resetWorkflow}
        onContinue={() => setRoute('procedure')}
      />
    );
  }

  if (route === 'camera') {
    return (
      <ScanScreen
        onCancel={() => setRoute('intake')}
        onRecognized={(text) => {
          setClient((current) => ({ ...current, ...parseIntakeText(text) }));
          setOcrNotice(true);
          setRoute('intake');
        }}
      />
    );
  }

  if (route === 'procedure') {
    return (
      <ProcedureScreen
        procedure={procedure}
        onChange={setProcedure}
        onBack={() => setRoute('intake')}
        onContinue={() => setRoute('review')}
      />
    );
  }

  if (route === 'review') {
    return (
      <ReviewScreen
        profile={account.profile}
        client={client}
        procedure={procedure}
        onHistorySaved={(record) => setCompletions((current) => [record, ...current])}
        onBack={() => setRoute('procedure')}
        onComplete={resetWorkflow}
      />
    );
  }

  return null;
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.centered}>
      <ActivityIndicator color={COLORS.teal} size="large" />
      <Text style={styles.loadingText}>Opening IV League securely...</Text>
    </SafeAreaView>
  );
}

function SecureStorageErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <AppScreen>
      <BrandHeader subtitle="Secure clinical documentation" />
      <Text style={styles.title}>Secure storage unavailable</Text>
      <Text style={styles.body}>Your existing account was not changed. Restore access to the device's secure storage, then retry.</Text>
      <PrimaryButton label="Retry secure storage" onPress={onRetry} />
    </AppScreen>
  );
}

function AccountSetupScreen({ onComplete }: { onComplete: (account: NonNullable<Awaited<ReturnType<typeof loadAccount>>>) => void }) {
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !credentials.trim()) {
      Alert.alert('Profile incomplete', 'Enter your name and professional credentials.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      Alert.alert('Passwords do not match', 'Re-enter the same password in both fields.');
      return;
    }
    setBusy(true);
    try {
      onComplete(await createAccount({ name: name.trim(), credentials: credentials.trim() }, password));
    } catch {
      Alert.alert('Account setup failed', 'The secure account could not be created.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen>
      <BrandHeader subtitle="Secure clinical documentation" />
      <Text style={styles.title}>Create your profile</Text>
      <Text style={styles.body}>This profile stays in encrypted device storage. No patient information is retained by the app.</Text>
      <Field label="Full name" value={name} onChangeText={setName} placeholder="Craig McGrain" autoCapitalize="words" />
      <Field label="Professional credentials" value={credentials} onChangeText={setCredentials} placeholder="RN" autoCapitalize="characters" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      <Field label="Confirm password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" />
      <PrimaryButton label="Create secure profile" onPress={submit} busy={busy} />
    </AppScreen>
  );
}

function LoginScreen({
  profile,
  biometricsEnabled,
  onAuthenticated,
}: {
  profile: UserProfile;
  biometricsEnabled: boolean;
  onAuthenticated: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const login = async () => {
    setBusy(true);
    try {
      if (await verifyPassword(password)) {
        setPassword('');
        onAuthenticated();
      } else {
        Alert.alert('Login failed', 'The password is incorrect.');
      }
    } catch {
      Alert.alert('Login unavailable', 'Secure authentication could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const biometricLogin = async () => {
    const result = await authenticateWithBiometrics();
    if (result.success) {
      onAuthenticated();
    } else if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
      Alert.alert('Biometric login failed', 'Use your password to continue.');
    }
  };

  return (
    <AppScreen>
      <BrandHeader subtitle="Clinical completion records" />
      <Text style={styles.eyebrow}>WELCOME BACK</Text>
      <Text style={styles.title}>{profile.name}, {profile.credentials}</Text>
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" onSubmitEditing={login} />
      <PrimaryButton label="Sign in" onPress={login} busy={busy} />
      {biometricsEnabled ? <SecondaryButton label="Use device biometrics" onPress={biometricLogin} /> : null}
    </AppScreen>
  );
}

function HomeScreen({
  profile,
  biometricsEnabled,
  completions,
  historyLoading,
  historyError,
  historyHasMore,
  historyLoadingMore,
  showArchived,
  facilitiesCount,
  facilitiesError,
  onBiometricChange,
  onDeleteCompletion,
  onLoadMore,
  onHistoryViewChange,
  onRecordsIncluded,
  onRecordsArchived,
  onManageFacilities,
  onStart,
  onLogout,
}: {
  profile: UserProfile;
  biometricsEnabled: boolean;
  completions: CompletedProcedure[];
  historyLoading: boolean;
  historyError: boolean;
  historyHasMore: boolean;
  historyLoadingMore: boolean;
  showArchived: boolean;
  facilitiesCount: number;
  facilitiesError: boolean;
  onBiometricChange: (enabled: boolean) => void;
  onDeleteCompletion: (record: CompletedProcedure) => Promise<void>;
  onLoadMore: () => Promise<void>;
  onHistoryViewChange: (archived: boolean) => void;
  onRecordsIncluded: (ids: number[]) => void;
  onRecordsArchived: (ids: number[]) => void;
  onManageFacilities: () => void;
  onStart: () => void;
  onLogout: () => void;
}) {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [sharingHistoryId, setSharingHistoryId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  useEffect(() => {
    getBiometricCapability().then(setBiometricAvailable).catch(() => setBiometricAvailable(false));
  }, []);

  useEffect(() => {
    const visibleIds = new Set(completions.map((record) => record.id));
    setSelectedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
  }, [completions]);

  const toggleBiometrics = async () => {
    try {
      if (!biometricsEnabled) {
        const result = await authenticateWithBiometrics('Confirm device biometric login');
        if (!result.success) {
          if (result.error !== 'user_cancel') {
            Alert.alert('Biometrics not enabled', 'Device authentication was not completed.');
          }
          return;
        }
      }
      const next = !biometricsEnabled;
      await setBiometricLogin(next);
      onBiometricChange(next);
    } catch {
      Alert.alert('Biometric setting unavailable', 'The secure biometric preference could not be updated.');
    }
  };

  const confirmDelete = (record: CompletedProcedure) => {
    Alert.alert(
      'Delete completion record?',
      `${record.task} for ${record.clientName} will be permanently removed from this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDeleteCompletion(record).catch(() => {
              Alert.alert('Record not deleted', 'The encrypted completion record could not be removed.');
            });
          },
        },
      ],
    );
  };

  const resendPdf = async (record: CompletedProcedure) => {
    if (!record.hasPdf) {
      Alert.alert('PDF unavailable', 'This record was created before encrypted PDF history was enabled.');
      return;
    }
    setSharingHistoryId(record.id);
    try {
      const pdf = await loadCompletedProcedurePdf(record.id);
      await shareStoredReport(pdf.filename, pdf.base64);
    } catch {
      Alert.alert('PDF could not be shared', 'The encrypted PDF could not be opened or the share sheet is unavailable.');
    } finally {
      setSharingHistoryId(null);
    }
  };

  const selectedRecords = completions.filter((record) => selectedIds.has(record.id));
  const toggleSelected = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const createCompletedProceduresDocument = async () => {
    if (selectedRecords.length === 0) {
      Alert.alert('Select procedures', 'Choose at least one completed procedure.');
      return;
    }
    setBatchBusy(true);
    const ids = selectedRecords.map((record) => record.id);
    try {
      await generateAndShareCompletedProcedures(profile, selectedRecords);
    } catch {
      Alert.alert('Document not created', 'The selected procedures could not be prepared or shared.');
      setBatchBusy(false);
      return;
    }
    try {
      await markProceduresIncludedInBatch(ids);
      onRecordsIncluded(ids);
    } catch {
      Alert.alert(
        'Document shared; archive unavailable',
        'The procedures could not be marked as included. Create the document again before archiving them.',
      );
    } finally {
      setBatchBusy(false);
    }
  };

  const archiveSelected = () => {
    const eligible = selectedRecords.filter((record) => record.includedInBatch);
    if (eligible.length !== selectedRecords.length || eligible.length === 0) {
      Alert.alert(
        'Create the document first',
        'Only procedures already added to a Completed Procedures document can be archived.',
      );
      return;
    }
    Alert.alert(
      'Archive selected procedures?',
      `${eligible.length} procedure${eligible.length === 1 ? '' : 's'} will move to Archived.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: () => {
            const ids = eligible.map((record) => record.id);
            archiveCompletedProcedures(ids)
              .then(() => {
                onRecordsArchived(ids);
                setSelectedIds(new Set());
              })
              .catch(() => Alert.alert('Archive failed', 'The encrypted procedure records could not be archived.'));
          },
        },
      ],
    );
  };

  return (
    <AppScreen>
      <BrandHeader subtitle={`${profile.name}, ${profile.credentials}`} />
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>NEW COMPLETION RECORD</Text>
        <Text style={styles.heroTitle}>Document a procedure confidently.</Text>
        <Text style={styles.heroBody}>Client data is used only for the current report and is cleared when you finish.</Text>
        <PrimaryButton label="Start client intake" onPress={onStart} />
      </View>
      <Pressable accessibilityRole="button" style={styles.settingRow} onPress={onManageFacilities}>
        <View style={{ flex: 1 }}>
          <Text style={styles.settingTitle}>Facility directory</Text>
          <Text style={styles.settingBody}>
            {facilitiesError ? 'Directory unavailable' : `${facilitiesCount} facilit${facilitiesCount === 1 ? 'y' : 'ies'} configured`}
          </Text>
        </View>
        <Text style={styles.disclosure}>›</Text>
      </Pressable>
      {biometricAvailable ? (
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: biometricsEnabled }} style={styles.settingRow} onPress={toggleBiometrics}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Device biometric login</Text>
            <Text style={styles.settingBody}>{biometricsEnabled ? 'Enabled' : 'Use fingerprint or face authentication'}</Text>
          </View>
          <View style={[styles.switchTrack, biometricsEnabled && styles.switchTrackOn]}>
            <View style={[styles.switchThumb, biometricsEnabled && styles.switchThumbOn]} />
          </View>
        </Pressable>
      ) : null}
      <View style={styles.historySection}>
        <Text style={styles.historyHeading}>Completed procedures</Text>
        <Text style={styles.privacyNote}>Encrypted on this device. Select active procedures to create a combined Completed Procedures PDF, then archive them when finished.</Text>
        <View style={styles.segmentedControl}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: !showArchived }}
            onPress={() => onHistoryViewChange(false)}
            style={[styles.segment, !showArchived && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, !showArchived && styles.segmentTextSelected]}>Active</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: showArchived }}
            onPress={() => onHistoryViewChange(true)}
            style={[styles.segment, showArchived && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, showArchived && styles.segmentTextSelected]}>Archived</Text>
          </Pressable>
        </View>
        {historyLoading ? <ActivityIndicator color={COLORS.teal} /> : null}
        {historyError ? <Text style={styles.historyError}>Completion history could not be opened securely.</Text> : null}
        {!historyLoading && !historyError && completions.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Text style={styles.emptyHistoryTitle}>{showArchived ? 'No archived procedures' : 'No completed procedures yet'}</Text>
            <Text style={styles.settingBody}>{showArchived ? 'Archived records appear here.' : 'Records appear here after a PDF is created.'}</Text>
          </View>
        ) : null}
        {completions.map((record) => (
          <View key={record.id} style={styles.historyCard}>
            {!showArchived ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selectedIds.has(record.id) }}
                accessibilityLabel={`Select ${record.task} for ${record.clientName}`}
                onPress={() => toggleSelected(record.id)}
                style={[styles.checkbox, selectedIds.has(record.id) && styles.checkboxChecked]}
              >
                {selectedIds.has(record.id) ? <Text style={styles.checkmark}>✓</Text> : null}
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.historyTask}>{record.task}</Text>
              <Text style={styles.historyClient}>{record.clientName}</Text>
              <Text style={styles.historyMeta}>{record.facility} · Room {record.roomNumber || 'not recorded'} · {new Date(record.completedAt).toLocaleString()}</Text>
              {record.details ? <Text style={styles.historyDetails}>{record.details}</Text> : null}
              {record.includedInBatch && !record.archived ? <Text style={styles.includedText}>Added to Completed Procedures document</Text> : null}
            </View>
            <View style={styles.historyActions}>
              {record.hasPdf ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Send PDF for ${record.task} for ${record.clientName}`}
                  disabled={sharingHistoryId !== null}
                  onPress={() => resendPdf(record)}
                  hitSlop={8}
                >
                  <Text style={styles.sendPdfText}>{sharingHistoryId === record.id ? 'Opening...' : 'Send PDF'}</Text>
                </Pressable>
              ) : <Text style={styles.pdfUnavailable}>PDF unavailable</Text>}
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${record.task} for ${record.clientName}`} onPress={() => confirmDelete(record)} hitSlop={8}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {!showArchived && selectedRecords.length > 0 ? (
          <View style={styles.batchActions}>
            <PrimaryButton
              label={`Create and send Completed Procedures (${selectedRecords.length})`}
              onPress={createCompletedProceduresDocument}
              busy={batchBusy}
            />
            <SecondaryButton label="Archive selected" onPress={archiveSelected} />
          </View>
        ) : null}
        {historyHasMore ? (
          <SecondaryButton
            label={historyLoadingMore ? 'Loading...' : `Load ${HISTORY_PAGE_SIZE} older procedures`}
            onPress={() => onLoadMore().catch(() => {
              Alert.alert('History not loaded', 'Older completion records could not be opened securely.');
            })}
          />
        ) : null}
      </View>
      <SecondaryButton label="Sign out" onPress={onLogout} />
    </AppScreen>
  );
}

function IntakeScreen({
  client,
  facilities,
  ocrNotice,
  onChange,
  onAddFacility,
  onScan,
  onBack,
  onContinue,
}: {
  client: Client;
  facilities: string[];
  ocrNotice: boolean;
  onChange: (client: Client) => void;
  onAddFacility: (name: string) => Promise<void>;
  onScan: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [newFacility, setNewFacility] = useState('');
  const [facilityBusy, setFacilityBusy] = useState(false);
  const update = (key: keyof Client, value: string) => onChange({ ...client, [key]: value });
  const saveFacility = async () => {
    if (!newFacility.trim()) {
      Alert.alert('Facility name required', 'Enter a facility name.');
      return;
    }
    setFacilityBusy(true);
    try {
      await onAddFacility(newFacility);
      setNewFacility('');
    } catch {
      Alert.alert('Facility not saved', 'The facility could not be added to your directory.');
    } finally {
      setFacilityBusy(false);
    }
  };
  const continueFlow = () => {
    const missing = validateClient(client);
    if (!facilities.includes(client.facility)) {
      Alert.alert('Select a facility', 'Choose a facility from your directory.');
      return;
    }
    if (missing.length) {
      Alert.alert('Client information incomplete', `Review: ${missing.join(', ')}.`);
      return;
    }
    onContinue();
  };

  return (
    <AppScreen>
      <StepHeader step="1 of 3" title="Client intake" onBack={onBack} />
      <SecondaryButton label="Scan document with camera" onPress={onScan} />
      {ocrNotice ? <View style={styles.notice}><Text style={styles.noticeText}>Scanned values were added. Review and edit every field before continuing.</Text></View> : null}
      <Field label="Name" value={client.name} onChangeText={(value) => update('name', value)} autoCapitalize="words" />
      <Field label="Date of birth" value={client.dateOfBirth} onChangeText={(value) => update('dateOfBirth', value)} placeholder="MM/DD/YYYY" keyboardType="numbers-and-punctuation" />
      <Field label="Medical record number" value={client.medicalRecordNumber} onChangeText={(value) => update('medicalRecordNumber', value)} autoCapitalize="characters" />
      <ChoiceGroup label="Facility" options={facilities} value={facilities.includes(client.facility) ? client.facility : null} onSelect={(facility) => update('facility', facility)} />
      {facilities.length === 0 ? (
        <Text style={styles.historyError}>No facilities are configured. Add one below to continue.</Text>
      ) : null}
      {client.facility && !facilities.includes(client.facility) ? (
        <Text style={styles.historyError}>The scanned facility is not in your directory. Add it below or select a configured facility.</Text>
      ) : null}
      <View style={styles.inlineFacility}>
        <Field label="Add a facility" value={newFacility} onChangeText={setNewFacility} autoCapitalize="words" />
        <SecondaryButton label="Add to facility directory" onPress={saveFacility} busy={facilityBusy} />
      </View>
      <Field label="Room number" value={client.roomNumber} onChangeText={(value) => update('roomNumber', value)} />
      <PrimaryButton label="Continue to procedure" onPress={continueFlow} />
    </AppScreen>
  );
}

function FacilityDirectoryScreen({
  facilities,
  onAdd,
  onRename,
  onDelete,
  onBack,
}: {
  facilities: string[];
  onAdd: (name: string) => Promise<void>;
  onRename: (currentName: string, nextName: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Facility name required', 'Enter a facility name.');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await onRename(editing, name);
      } else {
        await onAdd(name);
      }
      setName('');
      setEditing(null);
    } catch {
      Alert.alert('Facility not saved', 'Use a unique facility name and try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (facility: string) => {
    Alert.alert(
      'Remove facility?',
      `${facility} will no longer appear during client intake. Existing procedure records are unchanged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onDelete(facility).catch(() => {
              Alert.alert('Facility not removed', 'The facility directory could not be updated.');
            });
          },
        },
      ],
    );
  };

  return (
    <AppScreen>
      <StepHeader step="SETTINGS" title="Facility directory" onBack={onBack} />
      <Text style={styles.body}>Facilities in this encrypted directory appear as choices during client intake.</Text>
      <Field label={editing ? 'Edit facility name' : 'New facility name'} value={name} onChangeText={setName} autoCapitalize="words" />
      <PrimaryButton label={editing ? 'Save facility' : 'Add facility'} onPress={save} busy={busy} />
      {editing ? <SecondaryButton label="Cancel editing" onPress={() => { setEditing(null); setName(''); }} /> : null}
      {facilities.length === 0 ? (
        <View style={styles.emptyHistory}><Text style={styles.emptyHistoryTitle}>No facilities configured</Text></View>
      ) : facilities.map((facility) => (
        <View key={facility} style={styles.facilityRow}>
          <Text style={styles.facilityName}>{facility}</Text>
          <Pressable accessibilityRole="button" onPress={() => { setEditing(facility); setName(facility); }}>
            <Text style={styles.sendPdfText}>Edit</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => confirmDelete(facility)}>
            <Text style={styles.deleteText}>Remove</Text>
          </Pressable>
        </View>
      ))}
    </AppScreen>
  );
}

function ScanScreen({ onCancel, onRecognized }: { onCancel: () => void; onRecognized: (text: string) => void }) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  if (!permission) {
    return <LoadingScreen />;
  }
  if (!permission.granted) {
    return (
      <AppScreen>
        <StepHeader step="OPTIONAL SCAN" title="Camera access" onBack={onCancel} />
        <Text style={styles.body}>Camera access is used only to recognize text on the document you choose. Images are not uploaded or retained.</Text>
        <PrimaryButton label="Allow camera access" onPress={async () => { await requestPermission(); }} />
        <SecondaryButton label="Enter details manually" onPress={onCancel} />
      </AppScreen>
    );
  }

  const capture = async () => {
    let photoUri: string | null = null;
    setBusy(true);
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.85 });
      if (!photo) {
        throw new Error('No image captured');
      }
      photoUri = photo.uri;
      const result = await TextRecognition.recognize(photoUri);
      onRecognized(result.text);
    } catch {
      Alert.alert('Text recognition unsuccessful', 'Try again in good lighting or enter the details manually.');
    } finally {
      if (photoUri) {
        try {
          await FileSystem.deleteAsync(photoUri, { idempotent: true });
        } catch {
          Alert.alert('Privacy cleanup warning', 'The temporary camera image could not be deleted. Close the app before continuing.');
        }
      }
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.cameraScreen}>
      <StatusBar style="light" />
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
      <View style={styles.cameraOverlay}>
        <View style={styles.scanFrame} />
        <Text style={styles.cameraHelp}>Align the client information inside the frame.</Text>
        <PrimaryButton label="Capture and recognize text" onPress={capture} busy={busy} />
        <SecondaryButton label="Cancel" onPress={onCancel} light />
      </View>
    </SafeAreaView>
  );
}

function ProcedureScreen({
  procedure,
  onChange,
  onBack,
  onContinue,
}: {
  procedure: Procedure;
  onChange: (procedure: Procedure) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const chooseTask = (task: ProcedureTask) => {
    onChange(needsProcedureDetails(task) ? { ...procedure, task } : { task, size: null, side: null, location: null });
  };
  const continueFlow = () => {
    const missing = validateProcedure(procedure);
    if (missing.length) {
      Alert.alert('Procedure details incomplete', `Select: ${missing.join(', ')}.`);
      return;
    }
    onContinue();
  };

  return (
    <AppScreen>
      <StepHeader step="2 of 3" title="Procedure details" onBack={onBack} />
      <ChoiceGroup label="Task completed" options={TASKS} value={procedure.task} onSelect={chooseTask} />
      {needsProcedureDetails(procedure.task) ? (
        <>
          <ChoiceGroup label="Catheter size" options={GAUGES} value={procedure.size} onSelect={(size) => onChange({ ...procedure, size: size as ProcedureSize })} compact />
          <ChoiceGroup label="Side" options={SIDES} value={procedure.side} onSelect={(side) => onChange({ ...procedure, side: side as ProcedureSide })} compact />
          <ChoiceGroup label="Location" options={LOCATIONS} value={procedure.location} onSelect={(location) => onChange({ ...procedure, location: location as ProcedureLocation })} />
        </>
      ) : null}
      <PrimaryButton label="Review completion record" onPress={continueFlow} />
    </AppScreen>
  );
}

function ReviewScreen({
  profile,
  client,
  procedure,
  onHistorySaved,
  onBack,
  onComplete,
}: {
  profile: UserProfile;
  client: Client;
  procedure: Procedure;
  onHistorySaved: (record: CompletedProcedure) => void;
  onBack: () => void;
  onComplete: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedHistoryId, setSavedHistoryId] = useState<number | null>(null);
  const completionRecord = useRef<CompletionRecord | null>(null);

  const generate = async () => {
    if (!confirmed) {
      Alert.alert('Confirmation required', 'Confirm that you reviewed the information before producing the PDF.');
      return;
    }
    setBusy(true);
    try {
      const record = completionRecord.current ?? { profile, client, procedure, completedAt: new Date() };
      completionRecord.current = record;
      if (savedHistoryId !== null) {
        return;
      }
      const report = await generateReport(record);
      let saved: CompletedProcedure;
      try {
        saved = await saveCompletedProcedure(record, report.uri, report.filename);
      } finally {
        await FileSystem.deleteAsync(report.uri, { idempotent: true }).catch(() => {
          Alert.alert('Privacy cleanup warning', 'The temporary PDF could not be removed from protected app cache.');
        });
      }
      setSavedHistoryId(saved.id);
      onHistorySaved(saved);
      onComplete();
    } catch {
      Alert.alert('Completion not saved', 'The PDF and encrypted completion record could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen>
      <StepHeader step="3 of 3" title="Review and confirm" onBack={onBack} />
      <ReviewCard title="Clinician" rows={[['Name', `${profile.name}, ${profile.credentials}`]]} />
      <ReviewCard title="Client" rows={[
        ['Name', client.name],
        ['Date of birth', client.dateOfBirth],
        ['Medical record #', client.medicalRecordNumber],
        ['Facility / room', `${client.facility} / ${client.roomNumber}`],
      ]} />
      <ReviewCard title="Procedure" rows={[
        ['Task', procedure.task ?? ''],
        ...(needsProcedureDetails(procedure.task)
          ? [['Size', procedure.size ?? ''], ['Side', procedure.side ?? ''], ['Location', procedure.location ?? '']] as [string, string][]
          : []),
      ]} />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} style={styles.confirmRow} onPress={() => setConfirmed(!confirmed)}>
        <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>{confirmed ? <Text style={styles.checkmark}>✓</Text> : null}</View>
        <Text style={styles.confirmText}>I reviewed the client and procedure information and confirm it is accurate.</Text>
      </Pressable>
      <Text style={styles.privacyNote}>The PDF will be encrypted and attached to this procedure in Completed procedures. It will not be sent until you choose Send PDF.</Text>
      <PrimaryButton label="Generate PDF and save procedure" onPress={generate} busy={busy} disabled={!confirmed} />
    </AppScreen>
  );
}

function AppScreen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <View style={styles.brandHeader}>
      <View style={styles.logoMark}><Text style={styles.logoIV}>IV</Text></View>
      <View><Text style={styles.brandName}>IV LEAGUE</Text><Text style={styles.brandSubtitle}>{subtitle}</Text></View>
    </View>
  );
}

function StepHeader({ step, title, onBack }: { step: string; title: string; onBack: () => void }) {
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={onBack} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable>
      <Text style={styles.eyebrow}>{step.toUpperCase()}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={COLORS.muted} style={styles.input} {...props} />
    </View>
  );
}

function PrimaryButton({ label, onPress, busy = false, disabled = false }: { label: string; onPress: () => void | Promise<void>; busy?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, (pressed || disabled) && styles.buttonDimmed]}>
      {busy ? <ActivityIndicator color="white" /> : <Text style={styles.primaryButtonText}>{label}</Text>}
    </Pressable>
  );
}

function SecondaryButton({ label, onPress, light = false, busy = false }: { label: string; onPress: () => void | Promise<void>; light?: boolean; busy?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[styles.secondaryButton, busy && styles.buttonDimmed]}>
      {busy ? <ActivityIndicator color={light ? 'white' : COLORS.teal} /> : <Text style={[styles.secondaryButtonText, light && { color: 'white' }]}>{label}</Text>}
    </Pressable>
  );
}

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onSelect,
  compact = false,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onSelect: (value: T) => void;
  compact?: boolean;
}) {
  return (
    <View style={styles.choiceGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceWrap}>
        {options.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === option }}
            onPress={() => onSelect(option)}
            style={[styles.choice, compact && styles.choiceCompact, value === option && styles.choiceSelected]}
          >
            <Text style={[styles.choiceText, value === option && styles.choiceTextSelected]}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ReviewCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <View style={styles.reviewCard}>
      <Text style={styles.reviewTitle}>{title}</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>{label}</Text>
          <Text style={styles.reviewValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const COLORS = {
  navy: '#12283F',
  teal: '#008A8C',
  paleTeal: '#E6F5F3',
  cream: '#F7F4ED',
  white: '#FFFFFF',
  text: '#1B2B38',
  muted: '#647480',
  border: '#D6DEE2',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.cream },
  screen: { padding: 24, paddingBottom: 48, gap: 18, flexGrow: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.cream, gap: 16 },
  loadingText: { color: COLORS.muted, fontSize: 15 },
  brandHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  logoMark: { width: 46, height: 46, borderRadius: 14, backgroundColor: COLORS.navy, alignItems: 'center', justifyContent: 'center' },
  logoIV: { color: 'white', fontWeight: '900', fontSize: 20 },
  brandName: { color: COLORS.navy, fontSize: 18, fontWeight: '900', letterSpacing: 1.6 },
  brandSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  eyebrow: { color: COLORS.teal, fontSize: 12, fontWeight: '800', letterSpacing: 1.3, marginBottom: -10 },
  title: { color: COLORS.navy, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  body: { color: COLORS.muted, fontSize: 16, lineHeight: 24 },
  field: { gap: 7 },
  fieldLabel: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  input: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 14, fontSize: 16, color: COLORS.text },
  primaryButton: { minHeight: 52, borderRadius: 13, backgroundColor: COLORS.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 4 },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: COLORS.teal, fontSize: 15, fontWeight: '700' },
  buttonDimmed: { opacity: 0.45 },
  heroCard: { backgroundColor: COLORS.navy, borderRadius: 22, padding: 24, gap: 16 },
  heroLabel: { color: '#67D5CE', fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  heroTitle: { color: 'white', fontWeight: '800', fontSize: 27, lineHeight: 33 },
  heroBody: { color: '#C7D5DF', fontSize: 15, lineHeight: 22 },
  settingRow: { backgroundColor: COLORS.white, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingTitle: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  settingBody: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  disclosure: { color: COLORS.teal, fontSize: 28, fontWeight: '500' },
  switchTrack: { width: 48, height: 28, borderRadius: 14, backgroundColor: COLORS.border, padding: 3 },
  switchTrackOn: { backgroundColor: COLORS.teal },
  switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'white' },
  switchThumbOn: { marginLeft: 20 },
  back: { color: COLORS.teal, fontSize: 16, fontWeight: '700', marginBottom: 18 },
  notice: { backgroundColor: COLORS.paleTeal, borderRadius: 12, padding: 14 },
  noticeText: { color: '#155C5A', lineHeight: 20, fontWeight: '600' },
  cameraScreen: { flex: 1, backgroundColor: '#000' },
  cameraOverlay: { flex: 1, justifyContent: 'flex-end', padding: 24, paddingBottom: 42, backgroundColor: 'rgba(0,0,0,0.28)', gap: 12 },
  scanFrame: { position: 'absolute', top: '19%', left: '8%', width: '84%', height: '45%', borderRadius: 18, borderWidth: 3, borderColor: 'white' },
  cameraHelp: { color: 'white', fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  choiceGroup: { gap: 10 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  choice: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12 },
  choiceCompact: { minWidth: 72, alignItems: 'center' },
  choiceSelected: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  choiceText: { color: COLORS.text, fontWeight: '600' },
  choiceTextSelected: { color: 'white' },
  reviewCard: { backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 17, gap: 12 },
  reviewTitle: { color: COLORS.teal, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  reviewRow: { flexDirection: 'row', gap: 12 },
  reviewLabel: { width: 115, color: COLORS.muted, fontSize: 14 },
  reviewValue: { color: COLORS.text, fontSize: 14, fontWeight: '600', flex: 1 },
  confirmRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 6 },
  checkbox: { width: 25, height: 25, borderWidth: 2, borderColor: COLORS.teal, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: COLORS.teal },
  checkmark: { color: 'white', fontWeight: '900' },
  confirmText: { color: COLORS.text, lineHeight: 21, flex: 1, fontWeight: '600' },
  privacyNote: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  successIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.paleTeal, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 60 },
  successCheck: { color: COLORS.teal, fontSize: 38, fontWeight: '900' },
  historySection: { gap: 12, marginTop: 4 },
  historyHeading: { color: COLORS.navy, fontSize: 22, fontWeight: '800' },
  segmentedControl: { flexDirection: 'row', backgroundColor: COLORS.border, borderRadius: 12, padding: 3 },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 9 },
  segmentSelected: { backgroundColor: COLORS.white },
  segmentText: { color: COLORS.muted, fontWeight: '700' },
  segmentTextSelected: { color: COLORS.navy },
  historyError: { color: '#9A3412', backgroundColor: '#FFF0E8', borderRadius: 12, padding: 14, fontWeight: '600' },
  emptyHistory: { backgroundColor: COLORS.white, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, padding: 18, gap: 4 },
  emptyHistoryTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  historyCard: { backgroundColor: COLORS.white, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  historyTask: { color: COLORS.teal, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  historyClient: { color: COLORS.navy, fontSize: 17, fontWeight: '800', marginTop: 4 },
  historyMeta: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  historyDetails: { color: COLORS.text, fontSize: 13, fontWeight: '600', marginTop: 5 },
  includedText: { color: '#155C5A', fontSize: 11, fontWeight: '700', marginTop: 6 },
  historyActions: { alignItems: 'flex-end', gap: 14 },
  batchActions: { backgroundColor: COLORS.paleTeal, borderRadius: 15, padding: 12, gap: 2 },
  facilityRow: { backgroundColor: COLORS.white, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 18 },
  facilityName: { color: COLORS.navy, fontSize: 16, fontWeight: '700', flex: 1 },
  inlineFacility: { backgroundColor: COLORS.paleTeal, borderRadius: 15, padding: 14, gap: 12 },
  sendPdfText: { color: COLORS.teal, fontSize: 13, fontWeight: '800' },
  pdfUnavailable: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  deleteText: { color: '#B42318', fontSize: 13, fontWeight: '700' },
});
