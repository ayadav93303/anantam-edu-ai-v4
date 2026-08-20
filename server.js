const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

// Allow the app to be hosted separately (for example on Netlify) while
// keeping all API keys safely on the Render server.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

function inlineMd(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s;
}

function markdownToHtml(md = "") {
  const lines = String(md).replace(/\r/g, "").split("\n");
  let out = "", list = null, para = [];
  const closeList = () => { if (list === "ul") out += "</ul>"; if (list === "ol") out += "</ol>"; list = null; };
  const flush = () => { if (para.length) { out += `<p>${inlineMd(para.join(" "))}</p>`; para = []; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); closeList(); continue; }
    let m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) { flush(); closeList(); const h = m[1].length + 1; out += `<h${h}>${inlineMd(m[2])}</h${h}>`; continue; }
    if (/^[-*_]{3,}$/.test(line)) { flush(); closeList(); out += "<hr>"; continue; }
    m = line.match(/^[-*•]\s+(.+)$/);
    if (m) { flush(); if (list !== "ul") { closeList(); out += "<ul>"; list = "ul"; } out += `<li>${inlineMd(m[1])}</li>`; continue; }
    m = line.match(/^\d+[.)]\s+(.+)$/);
    if (m) { flush(); if (list !== "ol") { closeList(); out += "<ol>"; list = "ol"; } out += `<li>${inlineMd(m[1])}</li>`; continue; }
    if (line.startsWith(">")) { flush(); closeList(); out += `<blockquote>${inlineMd(line.slice(1).trim())}</blockquote>`; continue; }
    para.push(line);
  }
  flush(); closeList();
  return out || "<p>No answer was generated.</p>";
}

function messagesToInput(messages) {
  return messages.filter(x => x.role !== "system").map(x => ({
    role: x.role === "assistant" ? "assistant" : "user",
    content: [{ type: "input_text", text: String(x.content) }]
  }));
}

function openAIOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of (data.output || [])) {
    for (const c of (item.content || [])) {
      if (typeof c.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("").trim();
}

async function openai(messages, options = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured on Render.");
  const system = messages.filter(x => x.role === "system").map(x => x.content).join("\n\n");
  const body = {
    model: OPENAI_MODEL,
    ...(system ? { instructions: system } : {}),
    input: messagesToInput(messages),
    temperature: options.temperature ?? 0.35,
    max_output_tokens: options.maxOutputTokens ?? 1000
  };
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify(body)
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${raw.slice(0, 1200)}`);
  const data = JSON.parse(raw);
  const text = openAIOutputText(data);
  if (!text) throw new Error("OpenAI returned an empty response.");
  return text;
}

async function gemini(messages, options = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on Render.");
  const system = messages.filter(x => x.role === "system").map(x => x.content).join("\n\n");
  const contents = messages.filter(x => x.role !== "system").map(x => ({
    role: x.role === "assistant" ? "model" : "user",
    parts: [{ text: String(x.content) }]
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig: { temperature: options.temperature ?? 0.35, maxOutputTokens: options.maxOutputTokens ?? 1000 }
  };
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const raw = await r.text();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${raw.slice(0, 1200)}`);
  const data = JSON.parse(raw);
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

async function ai(messages, options = {}) {
  const errors = [];
  // OpenAI first, Gemini as an automatic fallback.
  if (process.env.OPENAI_API_KEY) {
    try { return { text: await openai(messages, options), provider: "openai" }; }
    catch (e) { console.error("OpenAI failed:", e.message); errors.push(e.message); }
  }
  if (process.env.GEMINI_API_KEY) {
    try { return { text: await gemini(messages, options), provider: "gemini" }; }
    catch (e) { console.error("Gemini failed:", e.message); errors.push(e.message); }
  }
  throw new Error(errors.join(" | ") || "No AI provider is configured.");
}

const SYSTEM = `You are Anantam Edu AI, a fast, friendly study assistant for students.
The student's name is Amit.

Give direct, accurate, useful answers. Match the student's language: English, Hindi, or natural Hinglish.
For school questions, explain at the student's level and use examples when useful.
For maths, show the essential steps and final answer.
For science, give definitions, key points, and examples where useful.
For exam questions, focus on marks-oriented answers.

Formatting rules:
- Use short headings only when helpful.
- Use bullet points for lists, but do not turn every answer into a bullet list.
- Use numbered steps for procedures.
- Bold important terms with **double asterisks**.
- Do not use hashtags as headings.
- Do not add unnecessary introductions or conclusions.
- Don't repeat the question.
- Keep simple questions concise; give more detail when the question needs it.
- Answer casual greetings naturally instead of producing a study-note format.`;

async function handleChat(req, res) {
  const message = String(req.body.message || "").trim().slice(0, 10000);
  if (!message) return res.status(400).json({ error: "Please enter a question." });
  console.log(`AI chat request: ${message.slice(0, 120)}`);
  const history = Array.isArray(req.body.history) ? req.body.history.slice(-8) : [];
  const messages = [
    { role: "system", content: SYSTEM },
    ...history.filter(x => ["user", "assistant"].includes(x.role)).map(x => ({ role: x.role, content: String(x.content).slice(0, 6000) })),
    { role: "user", content: message }
  ];
  const result = await ai(messages, { maxOutputTokens: 1000 });
  console.log(`AI response provider: ${result.provider}`);
  res.json({ reply: markdownToHtml(result.text), text: result.text, provider: result.provider });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, openai: !!process.env.OPENAI_API_KEY, gemini: !!process.env.GEMINI_API_KEY, openaiModel: OPENAI_MODEL, geminiModel: GEMINI_MODEL });
});

app.post("/api/chat", async (req, res) => {
  try { await handleChat(req, res); }
  catch (e) { console.error("/api/chat error:", e); res.status(503).json({ error: "AI is temporarily unavailable. Please try again.", detail: e.message }); }
});

app.post("/api/notes", async (req, res) => {
  try {
    const { topic="", className="", subject="", language="English" } = req.body;
    const prompt = `Create exam-ready revision notes for ${className} ${subject}, topic "${topic}". Language: ${language}. Include definition/core idea, key points, important terms, examples or formulas if relevant, common exam points, and a 3-line quick revision. Be accurate, concise and student-friendly.`;
    const result = await ai([{ role:"system", content:SYSTEM }, { role:"user", content:prompt }], { maxOutputTokens: 1400 });
    res.json({ html: markdownToHtml(result.text), text: result.text, provider: result.provider });
  } catch (e) { console.error("/api/notes error:", e); res.status(503).json({ error:"Notes generation failed.", detail:e.message }); }
});

app.post("/api/exam", async (req, res) => {
  try {
    const { className="", subject="", marks="50", difficulty="Medium", topics="", mix="MCQ + Short + Long" } = req.body;
    const prompt = `Create a complete school exam question paper. Class: ${className}. Subject: ${subject}. Total marks: ${marks}. Difficulty: ${difficulty}. Topics: ${topics || "relevant syllabus"}. Question mix: ${mix}. Make the marks add up to the requested total. Use clear sections and question numbering. Do not provide answers. Keep it realistic and sufficiently detailed for an actual practice paper.`;
    const result = await ai([{ role:"system", content:SYSTEM }, { role:"user", content:prompt }], { maxOutputTokens: 2000, temperature: 0.3 });
    res.json({ html: `<div class="paper-head"><img src="/anantam-education-icon.png" alt="Anantam"><div><strong>ANANTAM EDU AI</strong><span>${esc(subject)} • ${esc(className)} • ${esc(marks)} Marks</span></div></div>${markdownToHtml(result.text)}`, text: result.text, provider: result.provider });
  } catch (e) { console.error("/api/exam error:", e); res.status(503).json({ error:"Exam generation failed.", detail:e.message }); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Anantam Edu AI running on port ${PORT}`));
