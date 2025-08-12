import { SERVER_URL, OWNER_NAME } from "./config.js?v=12";

/* تثبيت الارتفاع للجوال */
const setVh = () => document.documentElement.style.setProperty('--vh', `${window.innerHeight*0.01}px`);
setVh(); addEventListener('resize', setVh);

/* الهوية */
const name = (localStorage.getItem("name")||"").trim();
const role = localStorage.getItem("role") || "user";
const pass = localStorage.getItem("pass") || "";
if(!name){ location.href="index.html"; }
const isOwnerMain = role==="ownerMain" && name===OWNER_NAME;

/* عناصر UI */
const messagesEl = document.getElementById("messages");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const asLine = document.getElementById("asLine");
asLine.textContent = `ترسل كـ: ${name}`;

const emojiBtn = document.getElementById("emojiBtn");
const emojiPanel = document.getElementById("emojiPanel");
emojiBtn.addEventListener("click",()=> emojiPanel.classList.toggle("hidden"));
emojiPanel.addEventListener("click",(e)=>{
  const el = e.target.closest(".emoji"); if(!el) return;
  msgInput.value += el.textContent; msgInput.focus();
});
document.addEventListener("click",(e)=>{
  if(!emojiBtn.contains(e.target) && !emojiPanel.contains(e.target)) emojiPanel.classList.add("hidden");
});

/* زر «افتح» (يمين) */
const openBtn   = document.getElementById("openBtn");
const menuDrop  = document.getElementById("menuDrop");
const ownerLink = document.getElementById("ownerLink");
const logoutLink= document.getElementById("logoutLink");
if (isOwnerMain) ownerLink.classList.remove("hidden");
openBtn.addEventListener("click", ()=> menuDrop.classList.toggle("hidden"));
document.addEventListener("click",(e)=>{
  if(!openBtn.contains(e.target) && !menuDrop.contains(e.target)) menuDrop.classList.add("hidden");
});
logoutLink.addEventListener("click", ()=>{ localStorage.clear(); location.href="index.html"; });

/* Socket */
const socket = io(SERVER_URL, { transports:["websocket"] });
socket.on("connect", ()=>{
  socket.emit("join", { name, role, pass });
  socket.emit("stage:request");
});

/* رسائل */
socket.on("message", (p)=> addMessage(p, p.name===name));
function send(){
  const text = (msgInput.value||"").trim();
  if(!text) return;
  addMessage({ name, text, ts: Date.now() }, true);
  try { socket.emit("message",{ text }); } catch(e){}
  msgInput.value=""; msgInput.focus();
}
sendBtn.addEventListener("click", send);
msgInput.addEventListener("keydown", (e)=>{ if(e.key==="Enter") send(); });

function addMessage({ name:n, text, ts }, mine=false){
  const div = document.createElement("div");
  div.className = "msg" + (mine?" me":"");
  const when = ts ? new Date(ts) : new Date();
  div.innerHTML = `<div class="meta"><span class="name">${esc(n)}</span> • ${when.toLocaleTimeString()}</div>${esc(text)}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function esc(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* الاستيج: ٤ خانات — يفتح/يغلق من زر المايك (يسار) */
const micBtn = document.getElementById("micBtn");
const stageOverlay = document.getElementById("stageOverlay");
const slotsEl = document.getElementById("slots");
let stageVisible = false;
let lastStage = { slots:[null,null,null,null] };

const toggleStage = ()=>{
  stageVisible = !stageVisible;
  stageOverlay.style.display = stageVisible ? "flex" : "none";
  if (stageVisible) socket.emit("stage:request");
};
micBtn.addEventListener("click", toggleStage);

socket.on("stage:update",(stage)=> renderStage(stage));

function renderStage(stage){
  lastStage = stage || lastStage;
  slotsEl.innerHTML = "";
  lastStage.slots.forEach((slot, i)=>{
    const isMe = slot && slot.name===name;
    const state = slot ? (isMe ? "me" : "on") : "off";
    const d = document.createElement("div");
    d.className = `slot ${state}`;
    d.innerHTML = `
      <div class="micCircle">🎙️</div>
      <div class="name">${slot ? esc(slot.name) : "فارغ"}</div>
    `;
    d.title = slot ? (isMe ? "اضغط للنزول" : "اضغط لتبديل مقعدك") : "اضغط للصعود";
    d.addEventListener("click", ()=> socket.emit("stage:toggle",{ index:i }));
    slotsEl.appendChild(d);
  });
}

/* طرد/حظر */
socket.on("kicked", (reason)=> { alert(`تم طردك: ${reason||""}`); localStorage.clear(); location.href="index.html"; });
socket.on("banned", (untilTs)=> { alert(`تم حظرك حتى ${new Date(untilTs).toLocaleString()}`); localStorage.clear(); location.href="index.html"; });
