/* chat.js — StageChat (messages + emoji + stage 4 mics + owner panel)
   متوافق مع عناصر HTML:
   logoutLink / ownerLink / ownerBadge / micBtn
   messages / nameInput / passInput / asLine / msgInput / sendBtn
   emojiBtn / emojiPanel / stageOverlay / slots (.slot > .micCircle + .name)
*/

/* ====== إعدادات عامة ====== */
const SERVER_URL = (window.SERVER_URL || "https://kwpooop.onrender.com");
const OWNER_PASS = (window.OWNER_PASS || "6677") + "";

/* ====== هوية وروم ====== */
const savedId = localStorage.getItem("myId");
window.myId = savedId || ("u" + Math.random().toString(36).slice(2,10));
if (!savedId) localStorage.setItem("myId", window.myId);

const qp = new URLSearchParams(location.search);
window.roomId = window.roomId || qp.get("room") || "lobby";

/* ====== Helpers ====== */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => root.querySelectorAll(sel);

function nowHHMM(){
  const d = new Date();
  return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}
function addMsg({from, text, me=false}){
  const wrap = $("#messages");
  const b = document.createElement("div");
  b.className = "msg" + (me ? " me" : "");
  b.textContent = text;
  wrap.appendChild(b);
  const m = document.createElement("div");
  m.className = "meta";
  m.textContent = `${from} • ${nowHHMM()}`;
  wrap.appendChild(m);
  wrap.scrollTop = wrap.scrollHeight + 9999;
}
function updateAsLine(){
  const n = (localStorage.getItem("myName") || "مجهول");
  $("#asLine").textContent = `ترسل كـ: ${n}`;
}
function setOwnerUI(isOwnerMain){
  $("#ownerLink").style.display  = isOwnerMain ? "inline-flex" : "none";
  $("#ownerBadge").style.display = isOwnerMain ? "inline-flex" : "none";
}

/* ====== حالة الاستيج (عميل) ====== */
const stage = {
  open: false,
  slots: [null, null, null, null], // كل عنصر: { id, name }
  meOnStageIndex: null,
};

function renderStage(){
  const overlay = $("#stageOverlay");
  overlay.classList.toggle("show", stage.open);
  overlay.setAttribute("aria-hidden", String(!stage.open));

  $$("#slots .slot").forEach((el)=>{
    const i = +el.dataset.i;
    const s = stage.slots[i];
    const nameEl = $(".name", el);
    el.classList.toggle("active", !!s);
    if (s){
      nameEl.textContent = s.name;
    }else{
      nameEl.textContent = "فارغ";
    }
  });
}

function tryJoinLeaveSlot(slotIndex){
  // إذا أنا فوق، نزّلني
  if (stage.meOnStageIndex !== null){
    const idx = stage.meOnStageIndex;
    stage.slots[idx] = null;
    stage.meOnStageIndex = null;
    emitStageUpdate();
    renderStage();
    return;
  }
  // إذا أنا مو فوق، جرّب تركب بأي خانة (أولوية للضغط، وبعدها أول خانة فاضية)
  const pick = (typeof slotIndex === "number" ? slotIndex :
               stage.slots.findIndex(s=>!s));
  if (pick < 0) return; // ما في خانة
  stage.slots[pick] = { id: window.myId, name: (localStorage.getItem("myName") || "مجهول") };
  stage.meOnStageIndex = pick;
  emitStageUpdate();
  renderStage();
}

/* ====== Socket ====== */
let ioClient = null;
try{
  ioClient = io(SERVER_URL, { transports:["websocket"], path:"/socket.io" });
}catch(e){
  console.warn("Socket.IO غير متاح، سيعمل لوكال فقط.", e);
}

function joinRoom(){
  const name = (localStorage.getItem("myName") || "مجهول");
  if (ioClient){
    ioClient.emit("room:join", { room: window.roomId, id: window.myId, name });
  }
}

function emitStageUpdate(){
  if (ioClient){
    ioClient.emit("stage:update", {
      room: window.roomId,
      open: stage.open,
      slots: stage.slots
    });
  }
}

/* ====== تهيئة الواجهة ====== */
window.addEventListener("DOMContentLoaded", ()=>{
  // عناصر
  const logoutLink = $("#logoutLink");
  const ownerLink  = $("#ownerLink");
  const ownerBadge = $("#ownerBadge");
  const micBtn     = $("#micBtn");
  const stageOverlay = $("#stageOverlay");
  const slotsRoot    = $("#slots");
  const nameInput  = $("#nameInput");
  const passInput  = $("#passInput");
  const msgInput   = $("#msgInput");
  const sendBtn    = $("#sendBtn");
  const emojiBtn   = $("#emojiBtn");
  const emojiPanel = $("#emojiPanel");
  const messages   = $("#messages");

  // استعادة الاسم/الدور
  nameInput.value = localStorage.getItem("myName") || "";
  passInput.value = localStorage.getItem("enteredPass") || "";
  updateAsLine();

  // تفعيل مالك رئيسي (Owner Main) فقط إذا كلمة السر
