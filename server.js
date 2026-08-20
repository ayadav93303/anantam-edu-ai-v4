const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

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

  const closeList = () => {
    if (list === "ul") out += "</ul>";
    if (list === "ol") out += "</ol>";
    list = null;
  };
  const flush = () => {
    if (para.length) {
      out += `<p>${inlineMd(para.join(" "))}</p>`;
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); closeList(); continue; }

    let m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) { flush(); closeList(); out += `<h${m[1].length + 1}>${inlineMd(m[2])}</h${m[1].length + 1}>`; continue; }

    if (/^[-*_]{3,}$/.test(line)) { flush(); closeList(); out += "<hr>"; continue; }

    m = line.match(/^[-*•]\s+(.+)$/);
    if (m) {
      flush();
      if (list !== "ul") { closeList(); out += "<ul>"; list = "ul"; }
      out += `<li>${inlineMd(m[1])}</li>`;
      continue;
    }

    m = line.match(/^\d+[.)]\s+(.+)$/);
    if (m) {
      flush();
      if (list !== "ol") { closeList(); out += "<ol>"; list = "ol"; }
      out += `<li>${inlineMd(m[1])}</li>`;
      continue;
    }

    if (line.startsWith(">")) { flush(); closeList(); out += `<blockquote>${inlineMd(line.slice(1).trim())}</blockquote>`; continue; }

    para.push(line);
  }
  flush(); closeList();
  return out || "<p>No answer was generated.</p>";
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
    generationConfig: {
      temperature: options.temperature ?? 0.35,
      maxOutputTokens: options.maxOutputTokens ?? 1000
    }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
}

const SYSTEM = `You are Anantam Edu AI, a fast, friendly study assistant for students.
The student's name is Amit.

Give direct, accurate, useful answers. Match the student's language:
English, Hindi, or natural Hinglish.
For school questions, explain at the student's level and use examples when useful.
For maths, show the essential steps and final answer.
For science, give definitions, key points, and examples where useful.
For exam questions, focus on marks-oriented answers.

Formatting rules:
- Use short headings only when helpful.
- Use bullet points for lists.
- Use numbered steps for procedures.
- Bold important terms with **double asterisks**.
- Do not use hashtags as headings.
- Do not add unnecessary introductions or conclusions.
- Don't repeat the question.
- Keep simple questions concise; give more detail when the question needs it.`;

async function handleChat(req, res) {
  const message = String(req.body.message || "").trim().slice(0, 10000);
  if (!message) return res.status(400).json({ error: "Please enter a question." });

  const history = Array.isArray(req.body.history) ? req.body.history.slice(-8) : [];
  const messages = [
    { role: "system", content: SYSTEM },
    ...history.filter(x => ["user", "assistant"].includes(x.role)).map(x => ({
      role: x.role, content: String(x.content).slice(0, 6000)
    })),
    { role: "user", content: message }
  ];

  const text = await gemini(messages, { maxOutputTokens: 1200 });
  res.json({ reply: markdownToHtml(text), text });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, provider: "gemini", model: GEMINI_MODEL, configured: !!process.env.GEMINI_API_KEY });
});

app.post("/api/chat", async (req, res) => {
  try { await handleChat(req, res); }
  catch (e) {
    console.error(e);
    res.status(503).json({ error: "AI is temporarily unavailable. Please try again.", detail: e.message });
  }
});

app.post("/api/notes", async (req, res) => {
  try {
    const { topic="", className="", subject="", language="English" } = req.body;
    const prompt = `Create exam-ready revision notes for ${className} ${subject}, topic "${topic}".
Language: ${language}.
Include: definition/core idea, key points, important terms, examples or formulas if relevant, common exam points, and a 3-line quick revision.
Be accurate, concise and student-friendly.`;
    const text = await gemini([
      { role:"system", content:SYSTEM },
      { role:"user", content:prompt }
    ], { maxOutputTokens: 1500 });
    res.json({ html: markdownToHtml(text), text });
  } catch (e) {
    console.error(e);
    res.status(503).json({ error:"Notes generation failed.", detail:e.message });
  }
});

app.post("/api/exam", async (req, res) => {
  try {
    const { className="", subject="", marks="50", difficulty="Medium", topics="", mix="MCQ + Short + Long" } = req.body;
    const prompt = `Create a complete school exam question paper.
Class: ${className}
Subject: ${subject}
Total marks: ${marks}
Difficulty: ${difficulty}
Topics: ${topics || "relevant syllabus"}
Question mix: ${mix}

Make the marks add up to the requested total. Use clear sections and question numbering.
Do not provide answers. Keep it realistic and sufficiently detailed for an actual practice paper.`;
    const text = await gemini([
      { role:"system", content:SYSTEM },
      { role:"user", content:prompt }
    ], { maxOutputTokens: 2200, temperature: 0.3 });
    res.json({ html: `<div class="paper-head"><img src="/anantam-education-icon.png" alt="Anantam"><div><strong>ANANTAM EDU AI</strong><span>${esc(subject)} • ${esc(className)} • ${esc(marks)} Marks</span></div></div>${markdownToHtml(text)}`, text });
  } catch (e) {
    console.error(e);
    res.status(503).json({ error:"Exam generation failed.", detail:e.message });
  }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`Anantam Edu AI running on port ${PORT}`));
