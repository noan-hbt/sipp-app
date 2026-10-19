# Sipp PWA

React + Vite + Motion. Talks to the backend at `VITE_API_URL`.

```sh
npm install
npm run dev      # http://localhost:5173 (also on your LAN for testing on a phone)
npm run build    # dist/ (installable PWA, offline shell)
```

The backend must list the PWA origin in `CORS_ORIGINS`.

## Languages

The interface is in French and English. Every visible text lives in `src/locales/fr.ts` (the reference) and `src/locales/en.ts`, with the same keys: the build fails if a key is missing on one side. Change a text in both files.

The language is the one picked in the profile, else the device's (French when it starts with `fr`, English otherwise). The demo lesson and the welcome examples are content, written once per language (`src/demo/demoLesson.ts`, `welcome.examples`). Lessons themselves are generated in the language of the learner's request.
