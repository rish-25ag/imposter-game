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

## Files

- `App.js`: all screens (setup, pass, reveal, clues, vote, result) and scoring.
- `src/words.js`: the built-in word pairs. Add your own here, or use the "Custom" category in the app.
