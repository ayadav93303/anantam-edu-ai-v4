# Anantam Edu AI Android — Render FIXED v4

This version bundles the complete Anantam Edu AI web UI inside the APK. The APK opens the local app interface directly; it does not open Render in a browser.

The app sends AI requests in the background to:
https://anantam-edu-ai-v4.onrender.com

Fixes in this build:
- Render backend URL restored.
- Image preview X button reliably removes the selected image.
- Image input and camera input are cleared when the X is pressed.
- App remains local-first inside the Android WebView.
- Version 5.0.


Features:
- Instant local app UI
- Native microphone speech recognition
- Native camera capture
- Image/file picker
- Profile and local chat history from the web app
- Gemini API key remains on Render

Build:
1. Open in Android Studio.
2. Let Gradle Sync finish.
3. Build > Generate App Bundles or APKs > Generate APKs.


## Android fixed build
- WebView asset URLs use relative paths so CSS, JavaScript and logos load correctly from `file:///android_asset/`.
- Added launcher icon from the Anantam Education icon.
- Image preview removal is hardened so the X button clears the selected image and file inputs.
- Render API base remains `https://anantam-edu-ai-v4.onrender.com` in `app.js`.


## V4 formatting fixes included
- Normalizes raw LaTeX/Markdown math returned by the Render AI backend so `$`, `$$`, `\alpha`, `\frac`, `\rightarrow`, etc. are displayed as readable student-facing notation.
- Applies the same cleanup to AI chat answers, Notes, Exam papers and Practice questions.
- Notes requests now ask for full, detailed chapter coverage rather than short summaries.
- Exam requests explicitly require vertically organized questions/options and clear spacing.
- Existing image-preview X removal handler is retained and uses an explicit click/touch handler.


## V5 reliability and syllabus fixes
- AI/chat/notes/exam/practice/image requests now use automatic retry and timeout handling for temporary Render cold starts and transient 5xx/429 failures.
- Image questions compress photos before sending them to the AI, reducing request-size failures while preserving the original preview.
- Notes now support **All Chapters / Full Syllabus**. The app first obtains a chapter list and then generates each chapter separately, preventing one oversized request from failing the entire notes generation.
- Full-syllabus progress is shown while chapters are generated. A single failed chapter no longer discards the chapters that already succeeded.
- Notes subject list expanded with Social Science, Computer Science, Physics, Chemistry and Biology.
- Detailed notes prompts explicitly prohibit raw LaTeX/dollar delimiters and require readable Unicode maths, bullets, headings, examples and complete chapter coverage.
- Fraction formatting is converted to readable `(numerator/denominator)` notation.
- Exam generation uses strict vertical question/option formatting.
