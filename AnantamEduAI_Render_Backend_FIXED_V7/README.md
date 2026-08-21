# Anantam Edu AI Render Backend V7

This is the corrected backend for the existing Android app.

Important V7 fix:
- Gemini 3.6 Flash no longer receives deprecated `temperature` sampling parameters.
- Keeps the full-content notes, organised exam, practice and formatting fixes from V6.
- `/api/notes`, `/api/exam`, `/api/practice`, `/api/chat`, and `/api/generate-image` are included.

Deploy these files to the GitHub repository connected to Render, then wait for Render to redeploy.

Keep `GEMINI_API_KEY` in Render Environment Variables.
