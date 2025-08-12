import { SERVER_URL, OWNER_NAME } from "./config.js";

/* الهوية */
const name = (localStorage.getItem("name")||"").trim();
const role = localStorage.getItem("role") || "user";
const pass = localStorage.getItem("pass") || "";
if(!name){ location.href="index.html"; }
const isOwnerMain = (role==="ownerMain" && name===OWNER_NAME);

/* عناصر أساسية */
const messagesEl = document.getElementById("messages");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const asLine = document.getElementById("asLine");
asLine.textContent = `ترسل كـ: ${name}`;

/* إيموجي */
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

/* Bottom Sheet: افتح */
const openBtn = document.getElementById("openBtn");
const sheet = document.getElementById("sheet");
const sheetBack = document.getElementById("sheetBack");
const closeSheet = document.getElementById("closeSheet");
const ownerPanel = document.getElementById("ownerPanel");
const logoutBtn = document.getElementById("logoutBtn");

function openSheet(){
  if (isOwnerMain) ownerPanel.classList.remove("hidden");
  else ownerPanel.classList.add("hidden");
  sheet.classList.add("open"); sheetBack.classList.add("show");
}
function closeSheetFn(){ sheet.classList.remove("open"); sheetBack.classList.remove("show"); }
openBtn.addEventListener("click", openSheet);
closeSheet.addEventListener("click", closeSheetFn);
sheetBack.addEventListener("click", closeSheetFn);
logoutBtn.addEventListener("click", ()=>{
  localStorage.clear(); location.href="index.html";
});

/* Socket */
const socket = io(SERVER_URL, { transports: ["websocket"] });

socket.on("connect", ()=>{
  socket.emit("join", { name, role, pass }); // نرسل كلمة السر للتحقق من الأدمن/الأونر
  socket.emit("stage:request");
  if (isOwnerMain) socket.emit("roles:request");
});

/* رسائل */
socket.on("message",(p)=> addMessage(p, p.name===name));
function send(){
  const text = (msgInput.value||"").trim();
  if(!text) return;
  addMessage({ name, text, ts: Date.now() }, true);   // إرسال متفائل
  try { socket.emit("message",{ text }); } catch(e){}
  msgInput.value=""; msgInput.focus();
}
sendBtn.addEventListener("click",send);
msgInput.addEventListener("keydown",(e)=>{ if(e.key==="Enter") send(); });

function addMessage({ name:n, text, ts }, mine=false){
  const div = document.createElement("div");
  div.className = "msg" + (mine?" me":"");
  const when = ts ? new Date(ts) : new Date();
  div.innerHTML = `<div class="meta"><span class="name">${escape(n)}</span> • ${when.toLocaleTimeString()}</div>${escape(text)}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function escape(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* الاستيج (لو تبغاه لاحقًا نفس السابق) — محجوز */
socket.on("stage:update",()=>{}); // نتركه فاضي للروم الواحد بدون صوت فعلي الآن

/* إدارة الصلاحيات داخل الشيت (للأونر الرئيسي) */
const roleName = document.getElementById("roleName");
const roleType = document.getElementById("roleType");
const rolePass = document.getElementById("rolePass");
const grantBtn = document.getElementById("grantBtn");
const revokeBtn = document.getElementById("revokeBtn");
const refreshRoles = document.getElementById("refreshRoles");
const rolesList = document.getElementById("rolesList");

if (isOwnerMain) {
  grantBtn.addEventListener("click", ()=>{
    const target = (roleName.value||"").trim();
    const r = roleType.value;
    const p = (rolePass.value||"").trim();
    if(!target || !p) { alert("اكتب الاسم وكلمة السر"); return; }
    socket.emit("roles:grant", { target, role:r, pass:p });
  });
  revokeBtn.addEventListener("click", ()=>{
    const target = (roleName.value||"").trim();
    if(!target){ alert("اكتب اسم المستخدم لإزالته"); return; }
    socket.emit("roles:revoke", { target });
  });
  refreshRoles.addEventListener("click", ()=> socket.emit("roles:request"));
  socket.on("roles:list",(list)=>{
    rolesList.innerHTML = "";
    list.forEach(({name, role})=>{
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = `${name} — ${role}`;
      pill.addEventListener("click", ()=> roleName.value = name);
      rolesList.appendChild(pill);
    });
  });
}

/* طرد/حظر رسائل */
socket.on("kicked", (reason)=> { alert(`تم طردك: ${reason||""}`); localStorage.clear(); location.href="index.html"; });
socket.on("banned", (untilTs)=> { alert(`تم حظرك حتى ${new Date(untilTs).toLocaleString()}`); localStorage.clear(); location.href="index.html"; });
