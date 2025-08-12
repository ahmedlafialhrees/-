import { SERVER_URL, OWNER_NAME } from "./config.js";

// الهوية
const name = (localStorage.getItem("name")||"").trim();
const role = localStorage.getItem("role") || "user";
if(!name){ location.href="index.html"; }
const isOwnerMain = role==="ownerMain" && name===OWNER_NAME;

// عناصر
const menuBtn = document.getElementById("menuBtn");
const dropdown = document.getElementById("dropdown");
const controlLink = document.getElementById("controlLink");
const toggleStageLink = document.getElementById("toggleStage");
const logoutLink = document.getElementById("logoutLink");

const messagesEl = document.getElementById("messages");
const msgInput   = document.getElementById("msgInput");
const sendBtn    = document.getElementById("sendBtn");
const asLine     = document.getElementById("asLine");

const emojiBtn   = document.getElementById("emojiBtn");
const emojiPanel = document.getElementById("emojiPanel");

const stageOverlay = document.getElementById("stageOverlay");
const closeStage   = document.getElementById("closeStage");
const slotsEl      = document.getElementById("slots");

asLine.textContent = `ترسل كـ: ${name}`;
if (isOwnerMain) controlLink.classList.remove("hidden");

// قائمة
menuBtn.addEventListener("click", ()=> dropdown.classList.toggle("hidden"));
document.addEventListener("click",(e)=>{
  if(!menuBtn.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.add("hidden");
});
logoutLink.addEventListener("click", ()=>{
  localStorage.clear(); location.href="index.html";
});

// إيموجي
emojiBtn.addEventListener("click",()=> emojiPanel.classList.toggle("hidden"));
emojiPanel.addEventListener("click",(e)=>{
  const el = e.target.closest(".emoji"); if(!el) return;
  msgInput.value += el.textContent; msgInput.focus();
});
document.addEventListener("click",(e)=>{
  if(!emojiBtn.contains(e.target) && !emojiPanel.contains(e.target)) emojiPanel.classList.add("hidden");
});

// Socket
const socket = io(SERVER_URL, { transports: ["websocket"] });

// انضمام (روم واحد)
socket.on("connect", ()=>{
  socket.emit("join", { name, role }); // روم افتراضي واحد
  socket.emit("stage:request");
});

// رسائل
socket.on("message",(p)=> addMessage(p, p.name===name));

// الاستيج
let lastStage = { slots:[null,null,null,null] };
socket.on("stage:update",(stage)=> renderStage(stage));

// عقوبات
socket.on("kicked",(reason)=>{
  alert(`تم طردك: ${reason||""}`); localStorage.clear(); location.href="index.html";
});
socket.on("banned",(untilTs)=>{
  alert(`تم حظرك حتى ${new Date(untilTs).toLocaleString()}`);
  localStorage.clear(); location.href="index.html";
});

// إرسال
function send(){
  const text = (msgInput.value||"").trim();
  if(!text) return;
  socket.emit("message",{ text });
  msgInput.value="";
}
sendBtn.addEventListener("click",send);
msgInput.addEventListener("keydown",(e)=>{ if(e.key==="Enter") send(); });

// إضافة رسالة
function addMessage({ name:n, text, ts, role:r }, mine=false){
  const div = document.createElement("div");
  div.className = "msg" + (mine?" me":"");
  const isOwner = n===OWNER_NAME;
  const metaName = `<span class="name ${isOwner?'owner':''}">${escape(n)}</span>`;
  const when = ts ? new Date(ts) : new Date();
  const time = when.toLocaleTimeString();
  div.innerHTML = `<div class="meta">${metaName} • ${time}</div>${escape(text)}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function escape(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// الاستيج
function renderStage(stage){
  lastStage = stage || lastStage;
  slotsEl.innerHTML = "";
  lastStage.slots.forEach((slot, i)=>{
    const d = document.createElement("div");
    const isMe = slot && slot.name===name;
    d.className = "slot"+(isMe?" me":"");
    d.textContent = slot ? `🎤 ${slot.name}` : "— فارغ —";
    d.title = isMe ? "اضغط للنزول" : "اضغط للصعود";
    d.addEventListener("click", ()=> socket.emit("stage:toggle",{ index:i }));
    slotsEl.appendChild(d);
  });
}

// فتح/إغلاق الاستيج
toggleStageLink.addEventListener("click", ()=>{
  stageOverlay.style.display = "flex";
  dropdown.classList.add("hidden");
  socket.emit("stage:request");
});
closeStage.addEventListener("click", ()=>{
  const myIdx = (lastStage.slots||[]).findIndex(x=>x && x.name===name);
  if (myIdx!==-1) socket.emit("stage:toggle",{ index: myIdx, forceDown:true });
  stageOverlay.style.display = "none";
});
