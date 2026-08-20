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
    row.innerHTML=user ? `<div class="bubble">${esc(html)}</div>` : `<img src="/anantam-education-icon.png" alt="Anantam"><div class="bubble"><b>Anantam Edu AI</b><div>${html}</div></div>`;
  }
  box.appendChild(row); box.scrollTop=box.scrollHeight; return row;
}
function setStatus(text){if($("#status"))$("#status").textContent=text}
function renderChat(){
  const box=$("#messages"); if(!box)return; box.innerHTML="";
  if(!activeChat || !activeChat.messages.length){
    box.innerHTML=`<div class="message ai"><img src="/anantam-education-icon.png" alt="Anantam"><div class="bubble"><b>Anantam Edu AI</b><p>Hi ${esc(profile.name)}! 👋 What are you studying today?</p><div class="quick"><button onclick="chatWith('Explain photosynthesis in simple Hinglish')">Explain a topic</button><button onclick="chatWith('Give me 5 exam practice questions')">Practice</button><button onclick="show('notes')">Make notes</button><button onclick="show('exam')">Make exam paper</button></div></div></div>`;
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

async function askAI(message,image){
  setStatus("● Thinking…");
  const history=(activeChat?.messages||[]).slice(-8).map(m=>({role:m.role,content:m.text||m.html||""}));
  const payload={message,history,profileName:profile.name}; if(image)payload.image=image;
  const r=await fetch(`${API_BASE}/api/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const data=await r.json(); if(!r.ok)throw new Error(data.error||"AI request failed");
  const c=currentChat();
  if(c.messages.length===0)c.title=(message||"Image question").slice(0,55);
  c.messages.push({role:"user",text:message||"Image question",html:message||"",image:image?.preview||null});
  c.messages.push({role:"assistant",text:data.text||"",html:data.reply}); saveChats();
  return data.reply;
}

function setupMic(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const btn=$("#micBtn");
  if(!btn)return;
  if(!SpeechRecognition){btn.title="Voice input is not supported on this browser";return;}
  recognition=new SpeechRecognition(); recognition.lang="en-IN"; recognition.interimResults=true; recognition.continuous=false;
  recognition.onstart=()=>{btn.classList.add("recording");setStatus("● Listening…")};
  recognition.onend=()=>{btn.classList.remove("recording");setStatus("● Ready")};
  recognition.onerror=()=>{btn.classList.remove("recording");setStatus("● Ready")};
  recognition.onresult=e=>{let text="";for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;$("#chatInput").value=text};
  btn.addEventListener("click",()=>{try{recognition.start()}catch{recognition.stop()}});
}
function setupImage(){
  const input=$("#imageInput"), btn=$("#imageBtn"), preview=$("#imagePreview"), remove=$("#removeImage");
  if(!input)return;
  btn?.addEventListener("click",()=>input.click());
  input.addEventListener("change",()=>{
    const file=input.files?.[0]; if(!file)return;
    if(!file.type.startsWith("image/")){alert("Please select an image.");return;}
    const reader=new FileReader(); reader.onload=()=>{
      pendingImage={mimeType:file.type,data:String(reader.result).split(",")[1],preview:reader.result};
      preview.src=reader.result; preview.parentElement.hidden=false;
    }; reader.readAsDataURL(file);
  });
  remove?.addEventListener("click",()=>{pendingImage=null;input.value="";preview.parentElement.hidden=true});
}

$("#chatForm")?.addEventListener("submit",async e=>{
  e.preventDefault(); const input=$("#chatInput"),question=input.value.trim();
  if(!question&&!pendingImage)return;
  const image=pendingImage; addMessage(question,true,{image:image?.preview}); input.value=""; input.disabled=true;
  const thinking=addMessage(`<span class="thinking">Thinking…</span>`);
  try{const answer=await askAI(question,image);thinking.remove();addMessage(answer)}
  catch(err){console.error(err);thinking.remove();addMessage(`<p>Sorry, I couldn't reach the AI right now. Please try again.</p>`)}
  finally{pendingImage=null;$("#imageInput").value="";$("#imagePreview").parentElement.hidden=true;input.disabled=false;input.focus();setStatus("● Ready")}
});

function generateNotes(){
  const out=$("#noteOutput"); out.innerHTML='<div class="note-card">Generating your notes…</div>';
  fetch(`${API_BASE}/api/notes`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:$("#noteTopic").value.trim(),className:$("#noteClass").value,subject:$("#noteSubject").value,language:$("#noteLang").value})}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);out.innerHTML=`<div class="note-card">${d.html}</div>`}).catch(e=>out.innerHTML=`<div class="note-card"><b>Couldn't generate notes.</b><p>${esc(e.message)}</p></div>`)
}
function generateExam(){
  const out=$("#examOutput");out.innerHTML='<div class="note-card">Preparing your question paper…</div>';
  fetch(`${API_BASE}/api/exam`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({className:$("#examClass").value,subject:$("#examSubject").value,marks:$("#marks").value,difficulty:$("#difficulty").value,topics:$("#examTopics").value.trim(),mix:$("#mix").value})}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);out.innerHTML=`<div class="paper">${d.html}</div>`}).catch(e=>out.innerHTML=`<div class="note-card"><b>Couldn't generate the paper.</b><p>${esc(e.message)}</p></div>`)
}
function pick(button,correct){$$('.answers button').forEach(x=>x.disabled=true);button.classList.add(correct?'good':'bad');$("#result").textContent=correct?'✓ Correct!':'✗ Not quite. Try another question.'}
function renderProfile(){
  $("#profileName").value=profile.name||""; $("#profileWelcome").textContent=`Welcome, ${profile.name||"Student"}.`;
  $("#topName").textContent=`Hi ${profile.name||"Student"} 👋`;
}
$("#profileForm")?.addEventListener("submit",e=>{e.preventDefault();profile.name=$("#profileName").value.trim()||"Student";saveProfile();renderProfile();alert("Profile saved!");show("home")});
$("#themeBtn")?.addEventListener("click",()=>{document.body.classList.toggle("light");$("#themeBtn").textContent=document.body.classList.contains("light")?'☀':'☾'});

renderProfile(); setupMic(); setupImage(); renderChat();
