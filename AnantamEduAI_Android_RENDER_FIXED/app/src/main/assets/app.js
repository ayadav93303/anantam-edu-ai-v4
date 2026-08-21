const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const API_BASE = window.ANANTAM_API_URL || "https://anantam-edu-ai-v4.onrender.com";

const PROFILE_KEY = "anantam_profile_v1";
const CHATS_KEY = "anantam_chats_v1";
let profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null") || {name:"Student"};
let chats = JSON.parse(localStorage.getItem(CHATS_KEY) || "[]");
let activeChat = null;
let pendingImage = null;
let recognition = null;

function saveProfile(){localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));}
function saveChats(){localStorage.setItem(CHATS_KEY,JSON.stringify(chats.slice(-50)));}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function currentChat(){
  if(!activeChat){
    activeChat={id:uid(),title:"New chat",messages:[]};
    chats.push(activeChat); saveChats();
  }
  return activeChat;
}

/* ---------- AI output formatter ----------
   The backend may return Markdown/LaTeX-style math as plain text.
   Android WebView does not render that automatically, so normalize it
   before displaying generated notes, papers and answers. */
function replaceLatexBraces(s, command){
  const token="\\"+command;
  let out="", i=0;
  while(i<s.length){
    const p=s.indexOf(token,i);
    if(p<0){ out+=s.slice(i); break; }
    out+=s.slice(i,p);
    let j=p+token.length;
    while(j<s.length && /\s/.test(s[j])) j++;
    if(s[j]!=="{"){ out+=token; i=j; continue; }
    let depth=0,k=j,end=-1;
    for(;k<s.length;k++){
      if(s[k]==="{") depth++;
      else if(s[k]==="}"){ depth--; if(depth===0){end=k;break;} }
    }
    if(end<0){ out+=token; i=j; continue; }
    out+=s.slice(j+1,end);
    i=end+1;
  }
  return out;
}
function latexToReadable(input){
  let s=String(input||"");

  // Math delimiters and common escaped formatting.
  s=s.replace(/\$\$([\s\S]*?)\$\$/g,"$1");
  s=s.replace(/\\\(([\s\S]*?)\\\)/g,"$1");
  s=s.replace(/\\\[([\s\S]*?)\\\]/g,"$1");
  s=s.replace(/\$([^$\n]+)\$/g,"$1");
  s=s.replace(/\\text\s*\{([^{}]*)\}/g,"$1");
  s=s.replace(/\\mathrm\s*\{([^{}]*)\}/g,"$1");
  s=s.replace(/\\mathbf\s*\{([^{}]*)\}/g,"$1");
  s=s.replace(/\\operatorname\s*\{([^{}]*)\}/g,"$1");

  // Fractions: make school-readable a/b instead of exposing LaTeX.
  for(let i=0;i<8;i++){
    const before=s;
    s=s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,"($1/$2)");
    if(s===before)break;
  }

  // Remove sizing/spacing commands.
  s=s.replace(/\\left\b/g,"").replace(/\\right\b/g,"");
  s=s.replace(/\\bigl\b|\\bigr\b|\\Bigl\b|\\Bigr\b/g,"");
  s=s.replace(/\\[,;:!]\s*/g,"");
  s=s.replace(/\\quad\b|\\qquad\b/g," ");
  s=s.replace(/\\displaystyle\b/g,"");

  // Common symbols.
  const symbols={
    "\\alpha":"α","\\beta":"β","\\gamma":"γ","\\delta":"δ","\\theta":"θ",
    "\\lambda":"λ","\\mu":"μ","\\pi":"π","\\sigma":"σ","\\phi":"φ",
    "\\omega":"ω","\\Delta":"Δ","\\Sigma":"Σ","\\Omega":"Ω",
    "\\rightarrow":"→","\\to":"→","\\Rightarrow":"⇒","\\leftrightarrow":"↔",
    "\\leq":"≤","\\le":"≤","\\geq":"≥","\\ge":"≥","\\neq":"≠",
    "\\times":"×","\\cdot":"·","\\div":"÷","\\pm":"±","\\infty":"∞",
    "\\approx":"≈","\\propto":"∝","\\degree":"°"
  };
  Object.keys(symbols).forEach(k=>s=s.split(k).join(symbols[k]));

  // Superscripts/subscripts for the most common school notation.
  const sup={"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","=":"⁼","n":"ⁿ"};
  const sub={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋","n":"ₙ"};
  s=s.replace(/\^\{([^{}]+)\}/g,(_,x)=>[...x].map(c=>sup[c]||c).join(""));
  s=s.replace(/\^([0-9n+\-])/g,(_,x)=>sup[x]||x);
  s=s.replace(/_\{([^{}]+)\}/g,(_,x)=>[...x].map(c=>sub[c]||c).join(""));
  s=s.replace(/_([0-9n+\-])/g,(_,x)=>sub[x]||x);

  // Remaining LaTeX control words / escapes that should never be shown.
  s=s.replace(/\\(text|mathrm|mathbf|operatorname)\b/g,"");
  s=s.replace(/\\([a-zA-Z]+)\b/g,"$1");
  s=s.replace(/\\\\/g,"\n");
  s=s.replace(/\s+\n/g,"\n");
  // Dollar delimiters are never useful to a student in rendered output.
  s=s.replace(/\$/g,"");
  return s;
}
function formatGeneratedContainer(root){
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n=>{
    const v=latexToReadable(n.nodeValue);
    if(v!==n.nodeValue)n.nodeValue=v;
  });
}
function setGeneratedHTML(root, html){
  root.innerHTML=html;
  formatGeneratedContainer(root);
}

function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function show(id){
  $$(".screen").forEach(x=>x.classList.remove("active"));
  const target=$("#"+id); if(target) target.classList.add("active");
  $$(".nav").forEach(x=>x.classList.toggle("active",x.dataset.id===id));
  window.scrollTo({top:0,behavior:"smooth"});
  if(id==="profile") renderProfile();
  if(id==="history") renderHistory();
}
function openChat(){show("chat");setTimeout(()=>$("#chatInput")?.focus(),80)}
function chatWith(text){show("chat");setTimeout(()=>{const i=$("#chatInput");if(i){i.value=text;$("#chatForm").requestSubmit()}},80)}

function addMessage(html,user=false,meta={}){
  const box=$("#messages");
  const row=document.createElement("div"); row.className="message "+(user?"user":"ai");
  if(user && meta.image){
    row.innerHTML=`<div class="bubble"><img class="user-image" src="${meta.image}" alt="Attached image">${html?`<div>${esc(html)}</div>`:""}</div>`;
  }else{
    if(user){
      row.innerHTML=`<div class="bubble">${esc(html)}</div>`;
    }else{
      const formatted=document.createElement("div");
      formatted.innerHTML=String(html||"");
      formatGeneratedContainer(formatted);
      row.innerHTML=`<img src="anantam-education-icon.png" alt="Anantam"><div class="bubble"><b>Anantam Edu AI</b><div>${formatted.innerHTML}</div></div>`;
    }
  }
  box.appendChild(row); box.scrollTop=box.scrollHeight; return row;
}
function setStatus(text){if($("#status"))$("#status").textContent=text}
function renderChat(){
  const box=$("#messages"); if(!box)return; box.innerHTML="";
  if(!activeChat || !activeChat.messages.length){
    box.innerHTML=`<div class="message ai"><img src="anantam-education-icon.png" alt="Anantam"><div class="bubble"><b>Anantam Edu AI</b><p>Hi ${esc(profile.name)}! 👋 What are you studying today?</p><div class="quick"><button onclick="chatWith('Explain photosynthesis in simple Hinglish')">Explain a topic</button><button onclick="chatWith('Give me 5 exam practice questions')">Practice</button><button onclick="show('notes')">Make notes</button><button onclick="show('exam')">Make exam paper</button></div></div></div>`;
    return;
  }
  activeChat.messages.forEach(m=>addMessage(m.html||m.text,m.role==="user",{image:m.image}));
}
function startNewChat(){activeChat=null;renderChat();show("chat");}
function openSavedChat(id){activeChat=chats.find(c=>c.id===id)||null;renderChat();show("chat")}
function renderHistory(){
  const box=$("#historyList"); if(!box)return;
  if(!chats.length){box.innerHTML='<div class="note-card">No chat history yet. Start a chat and it will appear here.</div>';return;}
  box.innerHTML=chats.slice().reverse().map(c=>`<button class="history-item" onclick="openSavedChat('${c.id}')"><b>${esc(c.title||"New chat")}</b><small>${new Date(Number.parseInt(c.id,36)||Date.now()).toLocaleString()}</small></button>`).join("");
}

async function apiRequest(path, options={}, cfg={}){
  const retries=cfg.retries ?? 3;
  const timeout=cfg.timeout ?? 90000;
  let lastErr=null;
  for(let attempt=1; attempt<=retries; attempt++){
    let timer=null;
    try{
      const controller=new AbortController();
      timer=setTimeout(()=>controller.abort(),timeout);
      const r=await fetch(`${API_BASE}${path}`,{
        ...options,
        signal:controller.signal,
        headers:{"Content-Type":"application/json",...(options.headers||{})}
      });
      clearTimeout(timer);
      const raw=await r.text();
      let data={};
      try{ data=raw?JSON.parse(raw):{}; }catch(_){
        throw new Error(`Server returned an invalid response (${r.status}).`);
      }
      if(r.ok) return data;
      const msg=data.error||data.message||`Request failed (${r.status})`;
      const transient=[408,425,429,500,502,503,504].includes(r.status);
      if(!transient || attempt===retries) throw new Error(msg);
      lastErr=new Error(msg);
    }catch(e){
      if(timer)clearTimeout(timer);
      lastErr=e.name==="AbortError" ? new Error("The AI server took too long to respond. Please try again.") : e;
      if(attempt===retries) break;
    }
    await new Promise(resolve=>setTimeout(resolve,Math.min(1500*Math.pow(2,attempt-1),6000)));
  }
  throw lastErr||new Error("AI service is temporarily unavailable. Please try again.");
}

function postJSON(path,payload,cfg={}){
  return apiRequest(path,{method:"POST",body:JSON.stringify(payload)},cfg);
}

function fullNotesInstruction(className,subject,topic){
  return `You are Anantam Edu AI, an expert school teacher. Create EXAM-READY, DETAILED notes for ${className} ${subject} on ${topic}. Cover the complete requested chapter/topic, not a short summary. Explain every important concept in simple student-friendly language. Include: clear headings and subheadings; definitions; laws/rules; formulas with readable notation; step-by-step derivations or methods where appropriate; worked examples; solved numerical problems for Mathematics/Physics/Chemistry; diagrams or labelled-diagram descriptions when useful; tables/comparisons; applications; important terms; common misconceptions; exam-focused points; likely questions with answers; and a final quick revision section. Use clean Markdown/HTML only. NEVER output LaTeX delimiters such as $, $$, \\(, \\[. NEVER output raw LaTeX commands such as \\frac, \\text, \\alpha or \\rightarrow. Write equations in normal readable text using Unicode symbols (×, ÷, →, ≤, ≥, α, β) and superscripts/subscripts where possible. Use real bullet lists and numbered lists. Make the notes long enough to genuinely cover the whole chapter.`;
}

function extractJSON(text){
  let s=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim();
  const a=s.indexOf("["); const b=s.lastIndexOf("]");
  if(a>=0&&b>a)s=s.slice(a,b+1);
  return JSON.parse(s);
}

async function askAI(message,image){
  setStatus("● Thinking…");
  const history=(activeChat?.messages||[]).slice(-8).map(m=>({role:m.role,content:m.text||m.html||""}));
  const payload={message,history,profileName:profile.name}; if(image)payload.image=image;
  const data=await postJSON("/api/chat",payload,{retries:3,timeout:100000});
  const c=currentChat();
  if(c.messages.length===0)c.title=(message||"Image question").slice(0,55);
  c.messages.push({role:"user",text:message||"Image question",html:message||"",image:image?.preview||null});
  c.messages.push({role:"assistant",text:data.text||"",html:data.reply}); saveChats();
  return data.reply;
}

function setInputText(text){
  const input=$("#chatInput");
  if(input){ input.value=text; input.focus(); input.dispatchEvent(new Event("input",{bubbles:true})); }
}

function setupMic(){
  const btn=$("#micBtn");
  if(!btn)return;

  // Native Android bridge (preferred inside the APK).
  if(window.AnantamNative && typeof window.AnantamNative.startMic === "function"){
    btn.addEventListener("click",()=>window.AnantamNative.startMic());
    window.setAnantamSpeechText=setInputText;
    return;
  }

  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SpeechRecognition){
    recognition=new SpeechRecognition();
    recognition.lang="en-IN";
    recognition.interimResults=true;
    recognition.continuous=false;
    recognition.onstart=()=>{btn.classList.add("recording");setStatus("● Listening…")};
    recognition.onend=()=>{btn.classList.remove("recording");setStatus("● Ready")};
    recognition.onerror=()=>{btn.classList.remove("recording");setStatus("● Ready")};
    recognition.onresult=e=>{
      let text="";
      for(let i=e.resultIndex;i<e.results.length;i++) text+=e.results[i][0].transcript;
      setInputText(text);
    };
    btn.addEventListener("click",()=>{
      try{recognition.start()}catch{try{recognition.stop()}catch{}}
    });
  } else if(window.AndroidMic){
    btn.addEventListener("click",()=>window.AndroidMic.start());
  } else {
    btn.title="Voice input is not supported here";
  }
}

async function prepareImageForAI(dataUrl,mimeType){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      const max=1600;
      const scale=Math.min(1,max/Math.max(img.width,img.height));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(img.width*scale));
      canvas.height=Math.max(1,Math.round(img.height*scale));
      const ctx=canvas.getContext("2d");
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const out=canvas.toDataURL("image/jpeg",0.78);
      resolve({mimeType:"image/jpeg",data:out.split(",")[1],preview:dataUrl});
    };
    img.onerror=()=>resolve({mimeType,data:dataUrl.split(",")[1],preview:dataUrl});
    img.src=dataUrl;
  });
}

function loadImageFile(file){
  if(!file)return;
  if(!file.type.startsWith("image/")){alert("Please select an image.");return;}
  if(file.size>8*1024*1024){alert("Please choose an image smaller than 8 MB.");return;}
  const reader=new FileReader(); reader.onload=async()=>{
    const raw=String(reader.result);
    pendingImage=await prepareImageForAI(raw,file.type);
    const preview=$("#imagePreview"); if(preview){preview.src=raw;preview.parentElement.hidden=false;preview.parentElement.style.display="inline-block";}
    setStatus("● Image ready");
  }; reader.readAsDataURL(file);
}
function clearPendingImage(event){
  if(event){
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }
  pendingImage=null;
  const input=$("#imageInput"), camera=$("#cameraInput"), preview=$("#imagePreview"), wrap=$("#imagePreviewWrap");
  if(input) input.value="";
  if(camera) camera.value="";
  if(preview){
    preview.removeAttribute("src");
    preview.src="";
  }
  if(wrap){
    wrap.hidden=true;
    wrap.style.display="none";
  }
  setStatus("● Ready");
}

window.clearPendingImage=clearPendingImage;

function setupImage(){
  const input=$("#imageInput"), camera=$("#cameraInput"), btn=$("#imageBtn"), camBtn=$("#cameraBtn"), remove=$("#removeImage");
  btn?.addEventListener("click",()=>input?.click());
  camBtn?.addEventListener("click",()=>{
    if(window.AnantamNative && typeof window.AnantamNative.startCamera==="function"){
      window.AnantamNative.startCamera();
    } else {
      camera?.click();
    }
  });
  input?.addEventListener("change",()=>{loadImageFile(input.files?.[0]);});
  camera?.addEventListener("change",()=>{loadImageFile(camera.files?.[0]);});
  remove?.addEventListener("click",clearPendingImage,{capture:true});
}


function looksLikeImageRequest(text=""){
  return /\b(generate|create|make|draw|design|render|produce)\b.{0,30}\b(image|picture|photo|poster|wallpaper|illustration|diagram)\b/i.test(text) || /\b(image|picture|poster|wallpaper)\b.{0,25}\b(generate|create|make|draw|design)\b/i.test(text);
}

async function generateImage(prompt){
  return await postJSON("/api/generate-image",{prompt,profileName:profile.name},{retries:3,timeout:120000});
}

window.setAnantamSpeechText=setInputText;

$("#chatForm")?.addEventListener("submit",async e=>{
  e.preventDefault(); const input=$("#chatInput"),question=input.value.trim();
  if(!question&&!pendingImage)return;
  const image=pendingImage; addMessage(question,true,{image:image?.preview}); input.value=""; input.disabled=true;
  const thinking=addMessage(`<span class="thinking">Thinking…</span>`);
  try{
    if(!image && looksLikeImageRequest(question)){
      const data=await generateImage(question); thinking.remove();
      const c=currentChat(); if(c.messages.length===0)c.title=question.slice(0,55);
      const html=`<p>${esc(data.text||"Here is your generated image.")}</p><img class="generated-image" src="${data.imageData}" alt="Generated image">`;
      c.messages.push({role:"user",text:question,html:question}); c.messages.push({role:"assistant",text:data.text||"",html}); saveChats(); addMessage(html); 
    } else {
      const answer=await askAI(question,image);thinking.remove();addMessage(answer);
    }
  } catch(err){console.error(err);thinking.remove();addMessage(`<p><strong>Sorry.</strong> ${esc(err.message||"I couldn't complete that request.")}</p>`)}
  finally{clearPendingImage();input.disabled=false;input.focus();setStatus("● Ready")}
});

async function generateNotes(){
  const out=$("#noteOutput");
  const className=$("#noteClass").value;
  const subject=$("#noteSubject").value;
  const topic=$("#noteTopic").value.trim();
  const language=$("#noteLang").value;
  if(!topic){
    out.innerHTML='<div class="note-card"><b>Enter a chapter or choose All Chapters.</b><p>Example: Force and Pressure, Algebra, or All Chapters.</p></div>';return;
  }
  out.innerHTML='<div class="note-card"><div class="loader"></div><b>Generating detailed notes…</b><p>AI is preparing complete exam-ready content. If Render is waking up, the first request can take longer.</p></div>';
  try{
    if(/^all\s+chapters$|^full\s+syllabus$/i.test(topic)){
      await generateAllChapterNotes(out,className,subject,language);
      return;
    }
    const d=await postJSON("/api/notes",{
      topic,className,subject,language,
      detail:fullNotesInstruction(className,subject,topic)
    },{retries:3,timeout:120000});
    if(!d.html && !d.text) throw new Error("The AI returned no notes.");
    setGeneratedHTML(out,`<div class="note-card">${d.html||esc(d.text)}</div>`);
  }catch(e){
    out.innerHTML=`<div class="note-card"><b>Notes generation failed.</b><p>${esc(e.message||"AI service is temporarily unavailable.")}</p><p>Wait a few seconds and press <b>Try again</b>. The app will automatically retry temporary Render/server errors.</p><button class="primary" onclick="generateNotes()">Try again</button></div>`;
  }
}

async function generateAllChapterNotes(out,className,subject,language){
  out.innerHTML='<div class="note-card"><div class="loader"></div><b>Finding the chapters…</b><p>Preparing the full syllabus for '+esc(className)+' '+esc(subject)+'.</p></div>';
  const listPrompt=`For ${className} ${subject}, return the chapter/topic names for a typical Indian school syllabus. Include all major chapters suitable for this class and subject. Return ONLY a JSON array of short chapter names, no markdown. Do not invent university-level topics.`;
  const listData=await postJSON("/api/chat",{message:listPrompt,history:[],profileName:profile.name},{retries:3,timeout:100000});
  const chapters=extractJSON(listData.text||listData.reply||"").filter(x=>typeof x==="string"&&x.trim()).slice(0,20);
  if(!chapters.length) throw new Error("Could not determine the chapter list.");
  out.innerHTML=`<div class="note-card"><b>Full syllabus: ${esc(className)} ${esc(subject)}</b><p>Generating ${chapters.length} chapters one by one so the app does not fail on an oversized response.</p><div id="allChapterProgress"></div></div>`;
  const progress=$("#allChapterProgress");
  const results=[];
  for(let i=0;i<chapters.length;i++){
    if(progress)progress.innerHTML=`<p><b>Chapter ${i+1} of ${chapters.length}:</b> ${esc(chapters[i])}</p><div class="loader"></div>`;
    try{
      const d=await postJSON("/api/notes",{
        topic:chapters[i],className,subject,language,
        detail:fullNotesInstruction(className,subject,chapters[i])+`\nThis is chapter ${i+1} of ${chapters.length}. Return only this chapter's notes.`
      },{retries:3,timeout:120000});
      results.push(`<section class="full-chapter"><h2>${i+1}. ${esc(chapters[i])}</h2>${d.html||`<p>${esc(d.text||"")}</p>`}</section>`);
    }catch(e){
      results.push(`<section class="full-chapter"><h2>${i+1}. ${esc(chapters[i])}</h2><p><b>This chapter could not be generated right now.</b> ${esc(e.message||"Please try again later.")}</p></section>`);
    }
    if(progress)progress.innerHTML=`<p><b>Completed ${i+1} of ${chapters.length}:</b> ${esc(chapters[i])}</p>`;
  }
  out.innerHTML=`<div class="note-card full-syllabus"><h1>${esc(className)} ${esc(subject)} — Full Syllabus Notes</h1>${results.join('<hr>')}</div>`;
  formatGeneratedContainer(out);
}

async function generateExam(){
  const out=$("#examOutput");out.innerHTML='<div class="note-card"><div class="loader"></div><b>Preparing your organized question paper…</b></div>';
  try{
    const d=await postJSON("/api/exam",{
      className:$("#examClass").value,subject:$("#examSubject").value,marks:$("#marks").value,
      difficulty:$("#difficulty").value,topics:$("#examTopics").value.trim(),mix:$("#mix").value,
      format:"STRICTLY ORGANIZED SCHOOL QUESTION PAPER. Put Q1, then its complete question. For MCQs put A, B, C, D on four separate lines vertically. Never put two options side-by-side. Leave spacing between questions. Use clear sections, numbering, marks and an answer key when appropriate. Do not use raw LaTeX or dollar signs."
    },{retries:3,timeout:120000});
    if(!d.html&&!d.text)throw new Error("The AI returned no question paper.");
    setGeneratedHTML(out,`<div class="paper">${d.html||esc(d.text)}</div>`);
  }catch(e){out.innerHTML=`<div class="note-card"><b>Question paper generation failed.</b><p>${esc(e.message||"AI service is temporarily unavailable.")}</p><button class="primary" onclick="generateExam()">Try again</button></div>`}
}

function togglePracticeOtherSubject(){
  const wrap=$("#practiceOtherSubjectWrap");
  if(wrap) wrap.hidden=$("#practiceSubject").value!=="Other";
}

function getPracticeSubject(){
  const selected=$("#practiceSubject")?.value||"Science";
  if(selected==="Other") return ($("#practiceOtherSubject")?.value||"").trim();
  return selected;
}

function cleanPracticeJson(text){
  let s=String(text||"").trim();
  s=s.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
  const start=s.indexOf("[");
  const end=s.lastIndexOf("]");
  if(start>=0 && end>start) s=s.slice(start,end+1);
  return JSON.parse(s);
}

function renderPracticeQuestions(questions, meta){
  const out=$("#practiceOutput");
  const safe=Array.isArray(questions)?questions.filter(q=>q && q.question):[];
  if(!safe.length) throw new Error("The AI returned no practice questions.");
  out.innerHTML=`<div class="practice-set">
    <div class="practice-set-head">
      <div><span class="badge">${esc(meta.subject.toUpperCase())} • ${esc(meta.className.toUpperCase())}</span>
      <h2>${esc(meta.topic)}</h2><p>${safe.length} questions • ${esc(meta.difficulty)} • ${esc(meta.language)}</p></div>
    </div>
    <div id="practiceQuestions"></div>
    <button class="primary full" onclick="generatePractice()">Generate another set</button>
  </div>`;
  const box=$("#practiceQuestions");
  safe.forEach((q,i)=>{
    const card=document.createElement("article");
    card.className="practice-question";
    const options=Array.isArray(q.options)?q.options:[];
    let opts="";
    if(options.length){
      opts=`<div class="answers">${options.map((o,j)=>`<button type="button" data-correct="${String(j===Number(q.answerIndex))}" onclick="answerPractice(this)">${esc(String.fromCharCode(65+j)+". "+o)}</button>`).join("")}</div>`;
    } else {
      opts=`<button type="button" class="show-answer" onclick="this.nextElementSibling.hidden=false">Show answer</button><div class="practice-answer" hidden><b>Answer:</b> ${esc(q.answer||"See solution")}</div>`;
    }
    card.innerHTML=`<div class="question-number">Question ${i+1}</div><h3>${esc(q.question)}</h3>${opts}<div class="practice-result"></div>`;
    box.appendChild(card);
  });
  formatGeneratedContainer(out);
  window.scrollTo({top:0,behavior:"smooth"});
}

function answerPractice(button){
  const card=button.closest(".practice-question");
  if(!card)return;
  card.querySelectorAll(".answers button").forEach(b=>b.disabled=true);
  const correct=button.dataset.correct==="true";
  button.classList.add(correct?"good":"bad");
  const result=card.querySelector(".practice-result");
  if(result) result.textContent=correct?"✓ Correct!":"✗ Not correct. Try the next one.";
  if(!correct){
    const right=card.querySelector('.answers button[data-correct="true"]');
    if(right) right.classList.add("good");
  }
}

async function generatePractice(){
  const out=$("#practiceOutput");
  const className=$("#practiceClass")?.value||"Class 8";
  const subject=getPracticeSubject();
  const topic=$("#practiceTopic")?.value.trim();
  const count=Math.min(20,Math.max(1,Number($("#practiceCount")?.value||10)));
  const difficulty=$("#practiceDifficulty")?.value||"Medium";
  const type=$("#practiceType")?.value||"MCQ";
  const language=$("#practiceLanguage")?.value||"English";

  if(!subject){out.innerHTML='<div class="note-card"><b>Choose a subject.</b><p>Select a subject or enter your own subject.</p></div>';return;}
  if(!topic){out.innerHTML='<div class="note-card"><b>Enter a chapter or topic.</b><p>For example: Force and Pressure, Algebra, Tenses, Photosynthesis.</p></div>';return;}

  out.innerHTML=`<div class="note-card practice-loading"><div class="loader"></div><b>Generating ${count} ${esc(type.toLowerCase())} questions…</b><p>${esc(subject)} • ${esc(className)} • ${esc(topic)}</p></div>`;
  const schema=type==="MCQ"
    ? `Each item must be {"question":"...","options":["A option","B option","C option","D option"],"answerIndex":0}.`
    : type==="Short Answer"
      ? `Each item must be {"question":"...","answer":"short correct answer"}.`
      : `For each item use either MCQ format {"question":"...","options":["...","...","...","..."],"answerIndex":0} or short-answer format {"question":"...","answer":"..."}.`;

  const prompt=`Create a student practice set.
Class: ${className}
Subject: ${subject}
Chapter/topic: ${topic}
Number of questions: ${count}
Difficulty: ${difficulty}
Question type: ${type}
Language: ${language}

Generate exactly ${count} original, syllabus-appropriate questions focused on the requested topic. Do not include unrelated topics. Avoid duplicate questions. Keep the wording clear for a ${className} student.
${schema}
Return ONLY a valid JSON array. No markdown, no explanation, no extra text.`;

  try{
    const d=await postJSON("/api/chat",{message:prompt,history:[],profileName:profile.name},{retries:3,timeout:100000});
    const questions=cleanPracticeJson(d.text||d.reply||"");
    renderPracticeQuestions(questions,{className,subject,topic,difficulty,language});
  }catch(e){
    out.innerHTML=`<div class="note-card"><b>Couldn't generate the practice set.</b><p>${esc(e.message||"Please try again.")}</p><button class="primary" onclick="generatePractice()">Try again</button></div>`;
  }
}
function pick(button,correct){$$('.answers button').forEach(x=>x.disabled=true);button.classList.add(correct?'good':'bad');$("#result").textContent=correct?'✓ Correct!':'✗ Not quite. Try another question.'}
function renderProfile(){
  $("#profileName").value=profile.name||""; $("#profileWelcome").textContent=`Welcome, ${profile.name||"Student"}.`;
  $("#topName").textContent=`Hi ${profile.name||"Student"} 👋`;
}
$("#profileForm")?.addEventListener("submit",e=>{e.preventDefault();profile.name=$("#profileName").value.trim()||"Student";saveProfile();renderProfile();alert("Profile saved!");show("home")});
$("#themeBtn")?.addEventListener("click",()=>{document.body.classList.toggle("light");$("#themeBtn").textContent=document.body.classList.contains("light")?'☀':'☾'});

renderProfile(); setupMic(); setupImage(); renderChat();

window.setAnantamImage = async function(dataUrl){
  if(!dataUrl) return;
  const comma=dataUrl.indexOf(",");
  if(comma<0) return;
  const header=dataUrl.slice(0,comma);
  const mime=(header.match(/^data:([^;]+)/)||[])[1] || "image/jpeg";
  pendingImage=await prepareImageForAI(dataUrl,mime);
  const preview=$("#imagePreview");
  if(preview){preview.src=dataUrl;preview.parentElement.hidden=false;preview.parentElement.style.display="inline-block";}
  setStatus("● Image ready");
};
