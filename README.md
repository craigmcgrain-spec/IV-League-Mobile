# IV League Mobile

Production-oriented MVP for creating reviewed IV League procedure completion records on iOS and Android.

## Features

- Local clinician profile with name and professional credentials
- Password authentication using PBKDF2-SHA-256 (210,000 iterations, random salt) with the account stored in iOS Keychain / Android Keystore-backed secure storage
- Optional device biometric login using the platform authentication prompt
- Client intake for name, date of birth, medical record number, facility, and room
- Camera capture with on-device Google ML Kit text recognition; recognized values always return to editable fields for review
- IV Insertion, PICC Insertion, Blood Draw, and Dressing Change workflows
- Single-choice size, side, and location controls for IV/PICC procedures
- Explicit final confirmation before generating a letterheaded PDF
- Native PDF share sheet for the user's preferred email or sharing service, with a PHI-free attachment filename and temporary app file deletion afterward
- Native screenshot/screen-recording protection and automatic session lock whenever the app leaves the foreground

Patient data is held only in application memory for the active workflow. It is not logged or persisted by the app. Use demo-safe data during development.

## Prerequisites

- Node.js 20.19 or newer
- npm
- Android Studio / Android SDK for Android builds
- macOS with Xcode and CocoaPods for iOS builds

ML Kit is a native dependency, so this application requires a development build or native build; it does not run inside the stock Expo Go client.
Expo Doctor's React Native Directory metadata check is explicitly excluded for this bridge because the directory marks its New Architecture status as untested; native prebuild and platform builds remain the source of truth.

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
6. Review the completion record, confirm accuracy, generate the PDF, and choose the preferred email provider from the system share sheet.

## Security notes

- No default or hard-coded credentials are provided.
- Passwords are never stored. Only a salted PBKDF2-derived hash is stored.
- Account data uses `expo-secure-store` with this-device-only accessibility.
- OCR runs on device; the application does not upload captured images.
- Client information is not persisted and the generated PDF is deleted from the app cache after the system share sheet closes.
- Sensitive screens are protected with the platform secure-screen facility, and leaving the foreground requires authentication again.
- Recipients selected in the system share sheet control any copies created outside the app.
