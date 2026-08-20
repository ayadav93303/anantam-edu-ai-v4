const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const chatHistory = [];
const API_BASE = window.ANANTAM_API_URL || "https://anantam-edu-ai-v4.onrender.com";

function show(id){
  $$(".screen").forEach(x=>x.classList.remove("active"));
  const target=$("#"+id); if(target) target.classList.add("active");
  $$(".nav").forEach(x=>x.classList.toggle("active",x.dataset.id===id));
  window.scrollTo({top:0,behavior:"smooth"});
}
function openChat(){show("chat");setTimeout(()=>$("#chatInput")?.focus(),80)}
function chatWith(text){show("chat");setTimeout(()=>{const i=$("#chatInput");if(i){i.value=text;$("#chatForm").requestSubmit()}},80)}

function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function addMessage(html, user=false){
  const box=$("#messages");
  const row=document.createElement("div");
  row.className="message "+(user?"user":"ai");
  row.innerHTML=user
    ? `<div class="bubble">${esc(html)}</div>`
    : `<img src="/anantam-education-icon.png" alt="Anantam"><div class="bubble"><b>Anantam Edu AI</b><div>${html}</div></div>`;
  box.appendChild(row);
  box.scrollTop=box.scrollHeight;
  return row;
}

function setStatus(text){if($("#status"))$("#status").textContent=text}

async function askAI(message){
  setStatus("● Thinking…");
  const r=await fetch(`${API_BASE}/api/chat`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({message,history:chatHistory.slice(-8)})
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||"AI request failed");
  chatHistory.push({role:"user",content:message});
  chatHistory.push({role:"assistant",content:data.text||""});
  return data.reply;
}

$("#chatForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const input=$("#chatInput"), question=input.value.trim();
  if(!question)return;
  addMessage(question,true);
  input.value=""; input.disabled=true;
  const thinking=addMessage(`<span class="thinking">Thinking…</span>`);
  try{
    const answer=await askAI(question);
    thinking.remove();
    addMessage(answer);
  }catch(err){
    console.error(err);
    thinking.remove();
    addMessage(`<p>Sorry, I couldn't reach the AI right now. Please try again.</p>`);
  }finally{
    input.disabled=false; input.focus(); setStatus("● Ready");
  }
});

async function generateNotes(){
  const out=$("#noteOutput");
  out.innerHTML='<div class="note-card">Generating your notes…</div>';
  try{
    const r=await fetch(`${API_BASE}/api/notes`,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        topic:$("#noteTopic").value.trim(),
        className:$("#noteClass").value,subject:$("#noteSubject").value,
        language:$("#noteLang").value
      })});
    const d=await r.json(); if(!r.ok)throw new Error(d.error);
    out.innerHTML=`<div class="note-card">${d.html}</div>`;
  }catch(e){out.innerHTML=`<div class="note-card"><b>Couldn't generate notes.</b><p>${esc(e.message)}</p></div>`}
}

async function generateExam(){
  const out=$("#examOutput");
  out.innerHTML='<div class="note-card">Preparing your question paper…</div>';
  try{
    const r=await fetch(`${API_BASE}/api/exam`,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        className:$("#examClass").value,subject:$("#examSubject").value,
        marks:$("#marks").value,difficulty:$("#difficulty").value,
        topics:$("#examTopics").value.trim(),mix:$("#mix").value
      })});
    const d=await r.json();if(!r.ok)throw new Error(d.error);
    out.innerHTML=`<div class="paper">${d.html}</div>`;
  }catch(e){out.innerHTML=`<div class="note-card"><b>Couldn't generate the paper.</b><p>${esc(e.message)}</p></div>`}
}

function pick(button,correct){
  $$(".answers button").forEach(x=>x.disabled=true);
  button.classList.add(correct?"good":"bad");
  $("#result").textContent=correct?"✓ Correct!":"✗ Not quite. Try another question.";
}

$("#themeBtn")?.addEventListener("click",()=>{
  document.body.classList.toggle("light");
  $("#themeBtn").textContent=document.body.classList.contains("light")?"☀":"☾";
});
