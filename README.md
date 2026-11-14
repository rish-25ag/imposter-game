# Imposter

A pass-the-phone word party game built with Expo. Everyone gets the same secret word except the imposter. Players give one-word clues, vote on who the imposter is, and keep score across rounds.

## Run it in Expo Go

1. Install [Node.js](https://nodejs.org) (LTS) on your computer.
2. Install **Expo Go** on your phone from the App Store or Play Store. It must support Expo SDK 58.
3. In this folder run:

   ```bash
   npm install
   npx expo start
   ```

4. Scan the QR code: with the Camera app on iPhone, or from inside Expo Go on Android. Your phone and computer need to be on the same Wi-Fi. If they aren't, run `npx expo start --tunnel` instead.

## Use it without your laptop (EAS Update, free)

Publish the app to your Expo account once, and Expo Go can open it any time: laptop off, any network.

One-time setup, in the `imposter-game` folder, signed in to Expo (see the login note below):

```bash
npx eas-cli@latest init
```

```bash
npx eas-cli@latest update:configure
```

Answer **Y** to the prompts. These link the project to your Expo account and add the update settings to `app.json`.

Publish (run this again whenever the app changes):

```bash
npm run publish-app
```

Then open it on your phone: the command prints an **EAS Dashboard** link. Open it, or go to expo.dev → your project → **Updates**, open the latest update and use **Preview** to open it in Expo Go (signed in to the same account). After the first open, Imposter stays in Expo Go's recent list.

**Login note (Windows):** if `npx expo login` crashes while opening the browser, create a token at expo.dev → Account settings → Access tokens and run `setx EXPO_TOKEN "your-token"`, then open a new PowerShell window.

## Files

- `App.js`: all screens (setup, pass, reveal, clues, vote, result) and scoring.
- `src/words.js`: the built-in word pairs. Add your own here, or use the "Custom" category in the app.
