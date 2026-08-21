# Anantam Edu AI — Render Backend V6

This version fixes the content-generation/formatting problems:

- Removes `$...$`, `$$...$$` and common LaTeX commands from generated output.
- Converts common math/chemistry notation to readable Unicode.
- Generates large, detailed chapter notes instead of short summaries.
- Generates organised exam papers with MCQ choices on separate lines.
- Adds `/api/practice` for dynamically generated practice sets.
- Keeps chat and image-generation endpoints.
- Uses the existing Render environment variables.

## Deploy

Replace the backend files in the GitHub repository connected to your Render service.

Render:
- Build: `npm install`
- Start: `npm start`
- Keep `GEMINI_API_KEY` as a secret environment variable.

After deployment, open:
`/health`

It should show `configured: true` and list the features including `practice`.

IMPORTANT:
The Android app must call the same Render URL. If the app already uses
`https://anantam-edu-ai-v4.onrender.com`, no URL change is needed.

The Android UI still controls how the generated content is displayed. This backend
fixes the AI prompts, response cleanup and structured generation.
