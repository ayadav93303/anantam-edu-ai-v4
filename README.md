# Anantam Edu AI — GitHub Full Fixed Package

This package contains both sides of the app:

- **Render backend** — the AI server in the repository root.
- **Android project** — `android/AnantamEduAI_Android_RENDER_FIXED`.

## What is fixed

- More reliable AI requests with backend warm-up, retries and model fallback.
- Detailed chapter notes instead of short summaries.
- Full-syllabus notes generated chapter-by-chapter.
- Structured practice-question API so malformed JSON is much less likely.
- Every practice question has an answer; MCQs reveal the correct answer and explanation.
- Organized exam papers with vertically separated MCQ options and an answer key.
- Image questions explicitly ask the AI to read the image and answer the question.
- Image upload preview has a working X/remove action.
- Raw `$`, `$$` and common LaTeX commands are cleaned before display.
- Unicode maths such as x², α, β, →, ×, ÷, ≤ and ≥ is used.

## Deploy the backend to GitHub/Render

1. Upload the **contents of this package** to your GitHub repository.
2. Keep `package.json`, `server.js` and `render.yaml` in the repository root.
3. In Render, deploy the web service from that repository.
4. Set `GEMINI_API_KEY` in Render Environment.
5. Recommended text model: `gemini-2.5-flash`.
6. Leave the fallback models as configured unless you need different models.
7. Wait until Render shows the service as **Live**.
8. Open `/health` on the Render URL. It should show `ok: true` and `configured: true`.

## Build the Android APK

Open:

`android/AnantamEduAI_Android_RENDER_FIXED`

in Android Studio, let Gradle sync, then build the APK.

The Android app already points to:

`https://anantam-edu-ai-v4.onrender.com`

If you create a different Render service URL, change the `API_BASE` constant near the top of:

`android/AnantamEduAI_Android_RENDER_FIXED/app/src/main/assets/app.js`

## Important limitation

No app can guarantee zero failures when an external AI provider has an outage, quota limit, invalid API key, or network failure. This version is designed to handle normal Render wake-up delays and temporary AI-provider errors automatically and to show a useful error when the external service itself is unavailable.
