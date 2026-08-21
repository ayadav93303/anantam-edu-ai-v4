# Anantam Edu AI Render Backend V8

V8 fixes the remaining raw LaTeX/dollar-sign problem. The backend now converts `$...$`, `$$...$$`, `\alpha`, `\beta`, `\frac`, `\text{}`, arrows, Greek letters, superscripts and common LaTeX commands into readable Unicode/plain text before returning notes, exams, practice and chat responses.

Also retains the full-chapter notes, organised exam questions and practice generation rules.

Deploy the contents of this folder to the GitHub repository connected to Render. Keep GEMINI_API_KEY in Render Environment Variables.
