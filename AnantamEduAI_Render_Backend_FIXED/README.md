# Anantam Edu AI — Render Backend FIXED

This is the Render replacement backend for the Anantam Edu AI Android app.

## Endpoints
- GET /
- GET /health
- POST /api/chat
- POST /api/notes
- POST /api/exam
- POST /api/generate-image

## Render setup
1. Upload/replace the contents of this folder in the GitHub repository used by the old Render service (for example `anantam-edu-ai-v4`).
2. In Render, open the existing Web Service and deploy the latest commit, or create a Web Service from the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add the secret environment variable `GEMINI_API_KEY` in Render. Do not put the key in GitHub or in the Android app.
6. Optional model variables are already included in `render.yaml`:
   - `GEMINI_TEXT_MODEL=gemini-3.6-flash`
   - `GEMINI_IMAGE_MODEL=gemini-3.1-flash-image`
7. Test `/health`. It should return `configured: true`.

The Android app is configured to call:
`https://anantam-edu-ai-v4.onrender.com`

If the Render service uses a different URL, change only `API_BASE` in the Android `app.js` before rebuilding.
