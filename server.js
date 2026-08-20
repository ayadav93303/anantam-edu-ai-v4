const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "12mb" }));

// Allow the app to be hosted separately (for example on Netlify) while
// keeping the Gemini API key safely on the Render server.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// Gemini 3.6 Flash currently has a free tier for Gemini Developer API.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function inlineMd(s = "") {
  s = esc(s);
  // Preserve math for MathJax after escaping HTML.
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s;
}

function markdownToHtml(md = "") {
  // A clean, ChatGPT-like renderer for headings, lists, tables, quotes,
  // code blocks and common LaTeX math. MathJax in index.html renders math.
  const lines = String(md).replace(/\r/g, "").split("\n");
  let out = "", list = null, para = [], inCode = false, code = [];
  const closeList = () => { if (list === "ul") out += "</ul>"; if (list === "ol") out += "</ol>"; list = null; };
  const flush = () => { if (para.length) { out += `<p>${inlineMd(para.join(" "))}</p>`; para = []; } };
  const codeEscape = s => esc(s).replace(/\n/g, "\n");
  const isTableSep = line => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
  const cells = line => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(x => x.trim());
  for (let i=0; i<lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line.startsWith("```")) {
      flush(); closeList();
      if (!inCode) { inCode = true; code = []; } else { out += `<pre><code>${codeEscape(code.join("\n"))}</code></pre>`; inCode = false; code = []; }
      continue;
    }
    if (inCode) { code.push(raw); continue; }
    if (!line) { flush(); closeList(); continue; }

    // Markdown table
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1].trim())) {
      flush(); closeList();
      const head = cells(line); i++;
      out += `<div class="table-wrap"><table><thead><tr>${head.map(c=>`<th>${inlineMd(c)}</th>`).join("")}</tr></thead><tbody>`;
      while (i + 1 < lines.length && lines[i + 1].trim().includes("|")) {
        const next = lines[i + 1].trim();
        if (!next || isTableSep(next)) { i++; continue; }
        i++; const row = cells(next);
        out += `<tr>${head.map((_,j)=>`<td>${inlineMd(row[j]||"")}</td>`).join("")}</tr>`;
      }
      out += `</tbody></table></div>`; continue;
    }
    let m = line.match(/^(#{1,4})\s+(.+)$/);
    if (m) { flush(); closeList(); const h = Math.min(m[1].length + 1, 5); out += `<h${h}>${inlineMd(m[2])}</h${h}>`; continue; }
    if (/^[-*_]{3,}$/.test(line)) { flush(); closeList(); out += "<hr>"; continue; }
    m = line.match(/^[-*•]\s+(.+)$/);
    if (m) { flush(); if (list !== "ul") { closeList(); out += "<ul>"; list = "ul"; } out += `<li>${inlineMd(m[1])}</li>`; continue; }
    m = line.match(/^\d+[.)]\s+(.+)$/);
    if (m) { flush(); if (list !== "ol") { closeList(); out += "<ol>"; list = "ol"; } out += `<li>${inlineMd(m[1])}</li>`; continue; }
    if (line.startsWith(">")) { flush(); closeList(); out += `<blockquote>${inlineMd(line.slice(1).trim())}</blockquote>`; continue; }
    para.push(line);
  }
  if (inCode) out += `<pre><code>${codeEscape(code.join("\n"))}</code></pre>`;
  flush(); closeList();
  return out || "<p>No answer was generated.</p>";
}

function messagesToGemini(messages) {
  return messages
    .filter(x => x.role !== "system")
    .map(x => {
      const parts = [];
      if (x.image && x.image.data) {
        parts.push({ inlineData: { mimeType: x.image.mimeType || "image/jpeg", data: x.image.data } });
      }
      parts.push({ text: String(x.content || "") });
      return { role: x.role === "assistant" ? "model" : "user", parts };
    });
}

async function gemini(messages, options = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on Render.");

  const system = messages
    .filter(x => x.role === "system")
    .map(x => String(x.content))
    .join("\n\n");

  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: messagesToGemini(messages),
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens ?? 1000,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {})
    }
  };

  const r = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify(body)
  });

  const raw = await r.text();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${raw.slice(0, 1800)}`);

  const data = JSON.parse(raw);
  const text = (data.candidates || [])
    .flatMap(c => (c.content && c.content.parts) || [])
    .map(p => p.text || "")
    .join("")
    .trim();

  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

async function ai(messages, options = {}) {
  const text = await gemini(messages, options);
  return { text, provider: "gemini" };
}

const SYSTEM = `You are Anantam Edu AI, a polished educational assistant. The current student's name will be supplied by the app when available.

Give answers with the same clean, readable style a high-quality ChatGPT study answer would use. Match English, Hindi, or natural Hinglish used by the student.

GENERAL ANSWERS:
- Start directly with the answer. Do not write unnecessary greetings or repeat the question.
- Use a short **bold heading** only when it genuinely improves readability.
- Use normal paragraphs for explanations; use bullets only for actual lists.
- Use numbered steps for procedures, solutions, derivations, and algorithms.
- For maths and physics, show equations on separate lines and show the calculation step-by-step, followed by a clearly labelled **Answer**.
- For chemistry, write balanced equations clearly and preserve subscripts/superscripts using LaTeX when useful, e.g. $H_2O$, $x^2$, $\\rightarrow$.
- For biology and theory subjects, use clear headings, short paragraphs, definitions, examples and key points where appropriate.
- Never use hashtags (#) as headings.
- Do not put every sentence into a bullet point.
- Do not use excessive emojis.
- Keep simple questions concise, but give complete detail when the user asks to explain, solve, teach, or answer in detail.
- If the user asks for an exam-style answer, write it in a clean answer-writing format appropriate to the marks.

NOTES:
- Make notes visually structured with a title, headings/subheadings, definitions, explanations, examples/formulas and a quick revision section.
- Do not make notes artificially short.

QUESTION PAPERS:
- Create a professional question paper with title, class, subject, time, full marks and clear instructions.
- Organize questions into sections such as Section A, Section B and Section C when appropriate.
- Number every question clearly and show marks beside questions.
- Make the total marks add up exactly to the requested total.
- Do not include answers unless explicitly requested.

OUTPUT:
Return clean Markdown. Use Markdown headings, bold text, ordered/unordered lists only when appropriate, tables when useful, fenced code blocks for code, and LaTeX math delimiters for equations.`;


async function handleChat(req, res) {
  const message = String(req.body.message || "").trim().slice(0, 10000);
  const image = req.body.image && req.body.image.data ? {
    mimeType: String(req.body.image.mimeType || "image/jpeg").slice(0, 100),
    data: String(req.body.image.data).replace(/^data:[^;]+;base64,/, "").slice(0, 9000000)
  } : null;
  if (!message && !image) return res.status(400).json({ error: "Please enter a question or attach an image." });
  console.log(`AI chat request: ${(message || "[image]").slice(0, 120)}`);
  const history = Array.isArray(req.body.history) ? req.body.history.slice(-8) : [];
  const profileName = String(req.body.profileName || "Student").trim().slice(0, 80) || "Student";
  const personalizedSystem = SYSTEM + `\n\nThe student's name is ${profileName}. Use their name naturally only when it feels appropriate; never call them Amit unless their name is Amit.`;
  const messages = [
    { role: "system", content: personalizedSystem },
    ...history.filter(x => ["user", "assistant"].includes(x.role)).map(x => ({ role: x.role, content: String(x.content).slice(0, 6000) })),
    { role: "user", content: message || "Please analyze this image and answer helpfully.", ...(image ? { image } : {}) }
  ];
  const result = await ai(messages, { maxOutputTokens: 4096 });
  console.log(`AI response provider: ${result.provider}`);
  res.json({ reply: markdownToHtml(result.text), text: result.text, provider: result.provider });
}



// Native Gemini image generation (Nano Banana 2 / Gemini 3.1 Flash Image).
// Image generation is separate from normal text generation and may require a paid API tier.
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

async function generateGeminiImage(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on Render.");
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      model: GEMINI_IMAGE_MODEL,
      input: String(prompt).slice(0, 5000),
      response_format: { type: "image", mime_type: "image/png", aspect_ratio: "1:1", image_size: "1K" }
    })
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`Gemini image ${r.status}: ${raw.slice(0, 1600)}`);
  const data = JSON.parse(raw);
  const image = data.output_image;
  if (!image || !image.data) throw new Error("Gemini did not return an image.");
  return { text: "Here is your generated image.", imageData: `data:${image.mime_type || "image/png"};base64,${image.data}` };
}

app.post("/api/generate-image", async (req, res) => {
  try {
    const prompt = String(req.body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ error: "Please describe the image you want." });
    console.log(`Image generation request: ${prompt.slice(0,120)}`);
    const result = await generateGeminiImage(prompt);
    res.json({ ...result, provider: "gemini-image", model: GEMINI_IMAGE_MODEL });
  } catch (e) {
    console.error("/api/generate-image error:", e);
    const msg = /400|401|402|403|billing|quota|credit|payment/i.test(e.message)
      ? "Image generation is not available on the current Gemini API tier. Text/image-question features can still work."
      : "Image generation failed. Please try again.";
    res.status(503).json({ error: msg, detail: e.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, gemini: !!process.env.GEMINI_API_KEY, geminiModel: GEMINI_MODEL });
});

app.post("/api/chat", async (req, res) => {
  try { await handleChat(req, res); }
  catch (e) { console.error("/api/chat error:", e); res.status(503).json({ error: "AI is temporarily unavailable. Please try again.", detail: e.message }); }
});

app.post("/api/notes", async (req, res) => {
  try {
    const { topic="", className="", subject="", language="English" } = req.body;
    const prompt = `Create exam-ready revision notes for ${className} ${subject}, topic "${topic}". Language: ${language}. Include definition/core idea, key points, important terms, examples or formulas if relevant, common exam points, and a 3-line quick revision. Be accurate, thorough, well-structured and student-friendly. Give enough explanation for a student to study from the notes without needing another source.`;
    const result = await ai([{ role:"system", content:SYSTEM }, { role:"user", content:prompt }], { maxOutputTokens: 5000 });
    res.json({ html: markdownToHtml(result.text), text: result.text, provider: result.provider });
  } catch (e) { console.error("/api/notes error:", e); res.status(503).json({ error:"Notes generation failed.", detail:e.message }); }
});

app.post("/api/exam", async (req, res) => {
  try {
    const { className="", subject="", marks="50", difficulty="Medium", topics="", mix="MCQ + Short + Long" } = req.body;
    const prompt = `Create a complete school exam question paper. Class: ${className}. Subject: ${subject}. Total marks: ${marks}. Difficulty: ${difficulty}. Topics: ${topics || "relevant syllabus"}. Question mix: ${mix}. Make the marks add up to the requested total. Use clear sections and question numbering. Do not provide answers. Keep it realistic and sufficiently detailed for an actual practice paper.`;
    const result = await ai([{ role:"system", content:SYSTEM }, { role:"user", content:prompt }], { maxOutputTokens: 6000, temperature: 0.3 });
    res.json({ html: `<div class="paper-head"><img src="/anantam-education-icon.png" alt="Anantam"><div><strong>ANANTAM EDU AI</strong><span>${esc(subject)} • ${esc(className)} • ${esc(marks)} Marks</span></div></div>${markdownToHtml(result.text)}`, text: result.text, provider: result.provider });
  } catch (e) { console.error("/api/exam error:", e); res.status(503).json({ error:"Exam generation failed.", detail:e.message }); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Anantam Edu AI running on port ${PORT}`));
