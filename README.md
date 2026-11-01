# MIRA

MIRA is a premium, mobile-first AI companion web app designed for a private, emotionally aware conversational experience.

## Highlights

- Futuristic midnight interface with animated orb and immersive interactions
- Text chat and browser voice input/output
- Persistent SQLite-backed conversations and memories
- Settings panel for an explicit memory system
- Installable PWA for iPhone Safari and mobile usage
- Real backend API with environment-based secret storage

## Stack

- Frontend: React + Vite
- Backend: Express with SQLite storage
- AI: OpenAI-compatible API via `OPENAI_API_KEY`
- PWA: Vite PWA plugin

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment example:

   ```bash
   cp .env.example .env
   ```

3. Add your API key in `.env`:

   ```env
   PORT=3001
   OPENAI_API_KEY=your_key_here
   OPENAI_MODEL=gpt-4o-mini
   NODE_ENV=development
   ```

4. Start the app in development mode:

   ```bash
   npm run dev
   ```

   This starts:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:3001

5. Production build:

   ```bash
   npm run build
   npm run start
   ```

## Voice features

MIRA uses the browser's native Web Speech APIs for:

- Speech-to-text: `SpeechRecognition` / `webkitSpeechRecognition`
- Speech output: `speechSynthesis`

This means the feature works in browsers that support these APIs, especially Safari and Chrome on iPhone/desktop.

## Memory system

Memory entries are kept in a local SQLite database and are only added when the user explicitly enters information in the settings panel. These memories are then included as context for future responses.

## Security notes

- No API keys are placed in frontend source files.
- Secrets live in `.env` and are read only by the server.
- The backend validates chat and memory requests before persisting or generating replies.

## Important

The AI chat is only fully functional after a valid OpenAI-compatible API key is provided. The app will show a clear error when the key is missing instead of pretending the model is available.

## Launching on iPhone Safari

1. Open the app in Safari.
2. Tap the share button.
3. Select "Add to Home Screen".
4. Launch it like a native app.
