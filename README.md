# IV League Mobile

Production-oriented MVP for creating reviewed IV League procedure completion records on iOS and Android.

## Features

- Local clinician profile with name and professional credentials
- Password authentication using native PBKDF2-SHA-256 (210,000 iterations, random salt) with the account stored in iOS Keychain / Android Keystore-backed secure storage
- Optional device biometric login using the platform authentication prompt
- Client intake for an editable procedure date/time (defaulting to now), name, auto-formatted date of birth, medical record number, facility, and room
- Keyboard-aware scrolling keeps the active intake field visible and supports drag-to-dismiss
- Editable encrypted facility directory with facility selection and inline facility creation during intake
- Camera capture with on-device Google ML Kit text recognition, including labeled names and unique `Last, First` name lines; recognized values always return to editable fields for review
- IV Insertion, Midline Insertion, PICC Insertion, Blood Draw, and Dressing Change workflows
- IV gauge selection; PICC catheter-length entry; side/location selection for every procedure; and attempt counts for IV, Midline, PICC, and Blood Draw
- Explicit final confirmation before generating a letterheaded PDF
- Native PDF share sheet for the user's preferred email or sharing service, with a `facility_client name_date.pdf` attachment filename, provider-safe temporary file retention, and reliable Android URI grants
- Authenticated, paged completed-procedure history with encrypted PDF resend and secure per-record deletion
- Selectable combined Completed Procedures PDFs and an archived-procedure view with restore-to-active support
- Native screenshot/screen-recording protection and automatic session lock whenever the app leaves the foreground

Patient data is never logged. Only the encrypted completion history and its encrypted PDF attachment persist after the active workflow is cleared. Use demo-safe data during development.

## Prerequisites

- Node.js 20.19 or newer
- npm
- Android Studio / Android SDK for Android builds
- macOS with Xcode and CocoaPods for iOS builds

ML Kit is a native dependency, so this application requires a development build or native build; it does not run inside the stock Expo Go client.
Expo Doctor's React Native Directory metadata check is explicitly excluded for this bridge because the directory marks its New Architecture status as untested; native prebuild and platform builds remain the source of truth.
An autolinked local Android sharing module hands Gmail a system MediaStore URI with `ClipData` and a direct read grant for PDF attachments.

## Setup

```bash
npm install
npm run typecheck
npm test
```

Generate native projects when needed:

```bash
npm run prebuild
npx expo run:android
# On macOS:
npx expo run:ios
```

The camera permission is requested only when the scan screen is opened. Biometric capability is checked after login and enabling biometric login requires a successful platform authentication.

## Principal flow

1. Create a clinician profile and password.
2. Optionally enable biometric login from the home screen.
3. Start intake and enter fields manually or scan a clearly labeled demo document.
4. Review and edit all intake fields.
5. Choose a procedure and, for IV/PICC, choose one size, side, and location.
6. Review the completion record, confirm accuracy, and save its PDF to Completed procedures.
7. Send an individual stored PDF, or select multiple procedures to create and share a combined Completed Procedures document.
8. Archive procedures after they have been added to a combined document.

## Security notes

- No default or hard-coded credentials are provided.
- Passwords are never stored. Only a salted PBKDF2-derived hash is stored.
- Account data uses `expo-secure-store` with this-device-only accessibility.
- Completion history is encrypted at rest with SQLCipher. Its random 256-bit database key is held in platform secure storage.
- The searchable encrypted history index retains completion time, task, client name, facility, room, and procedure summary so selected records can populate a Completed Procedures document. The individual generated PDF contains the complete report (including date of birth and medical record number), is stored as an encrypted SQLCipher value attached to that record, and can be sent again. Deleting a record also securely deletes its PDF and any materialized cache copy.
- OCR runs on device; the application does not upload captured images.
- Date of birth and medical record number are not indexed in history; they persist only inside the encrypted individual PDF. Shared PDFs are isolated in protected app cache so asynchronous email providers can read the attachment. On Android 10 and newer, a system MediaStore copy is created for reliable email handoff. Temporary copies are removed after one hour, on the next app cleanup, or when their history record is deleted.
- PDF filenames contain the facility and client name as requested. Treat the attachment name as sensitive client information and use only approved email recipients and services.
- Sensitive screens are protected with the platform secure-screen facility, and leaving the foreground requires authentication again.
- Recipients selected in the system share sheet control any copies created outside the app.
