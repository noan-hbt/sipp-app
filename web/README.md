# Sipp for iOS

React + Vite + Motion, shipped as an iOS app with [Capacitor](https://capacitorjs.com): the same build (`dist/`) runs inside the app, served at `capacitor://localhost`. It talks to the backend at `VITE_API_URL`.

```sh
npm install
npm run dev      # http://localhost:5173, in a browser, for day-to-day work (no purchases, no notifications)
npm run ios      # app build (--mode ios: set VITE_API_URL etc. in .env.ios) copied into ios/
npm run ios:open # opens the Xcode project (on a Mac)
```

The backend must list `capacitor://localhost` (the app) and the dev server in `CORS_ORIGINS`.

## The iOS project

`ios/` is the Xcode project Capacitor generated, kept in git; plugins come through Swift Package Manager (`ios/App/CapApp-SPM`). Building, signing and uploading need a Mac with Xcode (or a cloud build service).

- Bundle id `app.sipp` (in `capacitor.config.ts` and the Xcode target): change both if App Store Connect gives another one, and `APNS_TOPIC` on the backend.
- Push notifications: the target has the Push Notifications entitlement (`App/App.entitlements`); `AppDelegate.swift` hands the APNs token to the plugin.
- Icon and splash screens come from `resources/` (`icon.png` 1024×1024, `splash.png`, `splash-dark.png`): `npm run ios:assets` regenerates them.
- iPhone only, portrait. `ITSAppUsesNonExemptEncryption` is false (HTTPS only), so no export compliance question at upload.

## Subscriptions

Plans are App Store auto-renewable subscriptions sold through RevenueCat:

1. App Store Connect: one subscription group with four products, `sipp_basic_month`, `sipp_basic_year`, `sipp_plus_month`, `sipp_plus_year` (the ids are in the backend config), and a free 7-day introductory offer on the Essential ones.
2. RevenueCat: the iOS app with its App Store Connect key, the four products in an offering, a webhook to `POST /billing/webhook/revenuecat` with an Authorization value.
3. `VITE_REVENUECAT_IOS_KEY` here (public key), `REVENUECAT_SECRET_KEY` and `REVENUECAT_WEBHOOK_AUTH` on the backend.

The app buys with RevenueCat, then calls `POST /billing/sync`: the server re-reads the customer from RevenueCat and grants the plan. Prices shown are the App Store's, in the user's currency. "Restore purchases" is on the plans screen and in the profile. Outside the app (browser), plans are shown but cannot be bought.

## Languages

The interface is in French and English. Every visible text lives in `src/locales/fr.ts` (the reference) and `src/locales/en.ts`, with the same keys: the build fails if a key is missing on one side. Change a text in both files.

The language is the one picked in the profile, else the device's (French when it starts with `fr`, English otherwise). The demo lesson and the welcome examples are content, written once per language (`src/demo/demoLesson.ts`, `welcome.examples`). Lessons themselves are generated in the language of the learner's request.
