/* chat.js — تصميم جديد:
   - زر فتح (يسار) يفتح قائمة فيها خروج + لوحة التحكم
   - زر 🎙️ (يمين) يفتح نافذة الاستيج تسقط لتحت من اليمين (4 خانات)
   - رسايل/كتابة/إيموجي طبيعية
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

/* ====== حالة الاستيج ====== */
const stage = {
  open:false,
  slots:[null,null,null,null],
  meOnStageIndex:null,
};
function renderStage(){
  const p = $("#stagePanel");
  p.classList.toggle("show", stage.open);
  p.setAttribute("aria-hidden", String(!stage.open));

  $$("#slots .slot").forEach(el=>{
    const i = +el.dataset.i;
    const s = stage.slots[i];
    $(".name", el).textContent = s ? s.name : "فارغ";
    el.classList.toggle("active", !!s);
  });
}
function tryJoinLeaveSlot(slotIndex){
  if (stage.meOnStageIndex !== null){
    const idx = stage.meOnStageIndex;
    stage.slots[idx] = null;
    stage.meOnStageIndex = null;
    emitStageUpdate(); renderStage(); return;
  }
  const pick = (typeof slotIndex==="number" ? slotIndex : stage.slots.findIndex(s=>!s));
  if (pick < 0) return;
  stage.slots[pick] = { id:window.myId, name:(localStorage.getItem("myName")||"مجهول") };
  stage.meOnStageIndex = pick;
  emitStageUpdate(); renderStage();
}

/* ====== Socket ====== */
let ioClient = null;
try{ ioClient = io(SERVER_URL, {transports:["websocket"], path:"/socket.io"}); }
catch(e){ console.warn("Socket.IO غير متاح.", e); }

function joinRoom(){
  const name = (localStorage.getItem("myName") || "مجهول");
  if (ioClient){
    ioClient.emit("room:join", { room:window.roomId, id:window.myId, name });
  }
}
function emitStageUpdate(){
  if (ioClient){
    ioClient.emit("stage:update", { room:window.roomId, open:stage.open, slots:stage.slots });
  }
}

/* ====== UI ====== */
window.addEventListener("DOMContentLoaded", ()=>{
  // عناصر عامة
  const openBtn   = $("#openBtn");
  const openMenu  = $("#openMenu");
  const menuOwner = $("#menuOwner");
  const menuExit  = $("#menuExit");

  const micBtn    = $("#micBtn");
  const stagePanel= $("#stagePanel");
  const slotsRoot = $("#slots");

  const nameInput = $("#nameInput");
  const passInput = $("#passInput");
  const msgInput  = $("#msgInput");
  const sendBtn   = $("#sendBtn");
  const messages  = $("#messages");

  const emojiBtn  = $("#emojiBtn");
  const emojiPanel= $("#emojiPanel");

  // استعادة الاسم/الباس
  nameInput.value = localStorage.getItem("myName") || "";
  passInput.value = localStorage.getItem("enteredPass") || "";
  updateAsLine();

  // دخول روم + Socket
  joinRoom();
  if (ioClient){
    ioClient.on("connect", ()=> joinRoom());

    ioClient.on("chat:msg", (p)=>{
      if (p.room !== window.roomId) return;
      addMsg({ from:p.name||"عضو", text:p.text, me:(p.id===window.myId) });
    });

    ioClient.on("stage:state", (s)=>{
      if (s.room !== window.roomId) return;
      stage.open = !!s.open; stage.slots = Array.isArray(s.slots)? s.slots : [null,null,null,null];
      const i = stage.slots.findIndex(x=> x && x.id === window.myId);
      stage.meOnStageIndex = (i>=0? i : null);
      renderStage();
    });

    ioClient.on("stage:update", (s)=>{
      if (s.room !== window.roomId) return;
      stage.open = !!s.open; stage.slots = s.slots;
      const i = stage.slots.findIndex(x=> x && x.id === window.myId);
      stage.meOnStageIndex = (i>=0? i : null);
      renderStage();
    });
  }

  /* ====== فتح (قائمة يسار) ====== */
  function toggleMenu(){
    const show = !openMenu.classList.contains("show");
    // اقفل الاستيج إذا فتحنا القائمة (تجنّب تداخل)
    if (show && stage.open){ stage.open=false; renderStage(); emitStageUpdate(); micBtn.setAttribute("aria-expanded","false"); }
    openMenu.classList.toggle("show", show);
    openMenu.setAttribute("aria-hidden", String(!show));
  }
  openBtn.addEventListener("click", toggleMenu);

  // عناصر القائمة
  menuExit.addEventListener("click", ()=>{ window.location.href = "index.html"; });
  menuOwner.addEventListener("click", ()=>{
    const ok = (passInput.value === OWNER_PASS);
    if (!ok){ alert("لوحة التحكم للأونر فقط."); return; }
    window.location.href = "owner.html";
  });

  /* ====== الاستيج (يمين) ====== */
  function toggleStage(){
    const show = !stage.open;
    // اقفل القائمة إذا فتحنا الاستيج
    if (show && openMenu.classList.contains("show")){ openMenu.classList.remove("show"); openMenu.setAttribute("aria-hidden","true"); }
    stage.open = show;
    if (!show && stage.meOnStageIndex !== null){
      stage.slots[stage.meOnStageIndex] = null;
      stage.meOnStageIndex = null;
    }
    renderStage(); emitStageUpdate();
    micBtn.setAttribute("aria-expanded", String(show));
  }
  micBtn.addEventListener("click", toggleStage);

  // الضغط على خانة استيج
  slotsRoot.addEventListener("click", (e)=>{
    const s = e.target.closest(".slot"); if (!s) return;
    const idx = +s.dataset.i;
    const current = stage.slots[idx];
    if (current && current.id !== window.myId) return;
    tryJoinLeaveSlot(idx);
  });

  /* ====== الكتابة ====== */
  nameInput.addEventListener("input", ()=>{
    localStorage.setItem("myName", nameInput.value.trim());
    updateAsLine();
    if (ioClient) ioClient.emit("user:rename", { room:window.roomId, id:window.myId, name:nameInput.value.trim() || "مجهول" });
  });
  passInput.addEventListener("input", ()=>{
    localStorage.setItem("enteredPass", passInput.value);
  });

  function send(){
    const text = msgInput.value.trim(); if (!text) return;
    const name = (localStorage.getItem("myName") || "مجهول");
    const payload = { room:window.roomId, id:window.myId, name, text };
    if (ioClient) ioClient.emit("chat:msg", payload);
    addMsg({ from:name, text, me:true });
    msgInput.value = ""; msgInput.focus();
  }
  sendBtn.addEventListener("click", send);
  msgInput.addEventListener("keydown", (e)=>{
    if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); send(); }
  });

  /* ====== إيموجي ====== */
  emojiBtn.addEventListener("click", ()=>{
    emojiPanel.classList.toggle("show");
    emojiPanel.setAttribute("aria-hidden", String(!emojiPanel.classList.contains("show")));
  });
  emojiPanel.addEventListener("click", (e)=>{
    const t = e.target.closest(".emoji"); if (!t) return;
    const start = msgInput.selectionStart || msgInput.value.length;
    const end   = msgInput.selectionEnd   || msgInput.value.length;
    const before = msgInput.value.slice(0, start);
    const after  = msgInput.value.slice(end);
    msgInput.value = before + t.textContent + after;
    const caret = start + t.textContent.length;
    msgInput.focus(); msgInput.setSelectionRange(caret, caret);
  });

  /* ====== إغلاق بالنقر خارج ====== */
  document.addEventListener("click", (e)=>{
    const inMenu  = e.target.closest("#openMenu") || e.target.closest("#openBtn");
    const inStage = e.target.closest("#stagePanel") || e.target.closest("#micBtn");
    if (!inMenu && openMenu.classList.contains("show")){
      openMenu.classList.remove("show"); openMenu.setAttribute("aria-hidden","true");
    }
    if (!inStage && stage.open){
      stage.open = false;
      if (stage.meOnStageIndex !== null){ stage.slots[stage.meOnStageIndex] = null; stage.meOnStageIndex = null; }
      renderStage(); emitStageUpdate(); micBtn.setAttribute("aria-expanded","false");
    }
  });
});

/* ====== مرجع أحداث للسيرفر ====== */
/*
io.on("connection",(s)=>{
  s.on("room:join", ({room,id,name})=>{
    s.join(room); s.data = {room,id,name};
    const st = rooms[room]?.stage || {open:false, slots:[null,null,null,null]};
    s.emit("stage:state", { room, ...st });
  });
  s.on("chat:msg", (p)=> io.to(p.room).emit("chat:msg", p));
  s.on("user:rename", ({room,id,name})=>{});
  s.on("stage:update", ({room,open,slots})=>{
    rooms[room] = rooms[room] || {};
    rooms[room].stage = {open, slots};
    io.to(room).emit("stage:update", {room, open, slots});
  });
});
*/
