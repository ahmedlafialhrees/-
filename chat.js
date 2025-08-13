/* chat.js — تموضع قاطع + اسم افتراضي + قوائم مضبوطة */

const SERVER_URL = (window.SERVER_URL || "https://kwpooop.onrender.com");
const OWNER_PASS = (window.OWNER_PASS || "6677") + "";

/* هوية */
const savedId = localStorage.getItem("myId");
window.myId = savedId || ("u" + Math.random().toString(36).slice(2,10));
if (!savedId) localStorage.setItem("myId", window.myId);

const qp = new URLSearchParams(location.search);
window.roomId = window.roomId || qp.get("room") || "lobby";

/* Helpers */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => root.querySelectorAll(sel);

function nowHHMM(){ return new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }
function ensureDefaultName(){
  let n = localStorage.getItem("myName");
  if (!n || !n.trim()){
    const suf = window.myId.slice(-4);
    n = `عضو-${suf}`;
    localStorage.setItem("myName", n);
  }
  return n;
}
function currentName(){ return localStorage.getItem("myName") || ensureDefaultName(); }
function updateAsLine(){ $("#asLine").textContent = `ترسل كـ: ${currentName()}`; }

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

/* ====== الاستيج ====== */
const stage = { open:false, slots:[null,null,null,null], meOnStageIndex:null };
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
  stage.slots[pick] = { id:window.myId, name:currentName() };
  stage.meOnStageIndex = pick;
  emitStageUpdate(); renderStage();
}

/* ====== Socket ====== */
let ioClient = null;
try{ ioClient = io(SERVER_URL, {transports:["websocket"], path:"/socket.io"}); }
catch(e){ console.warn("Socket.IO غير متاح.", e); }

function joinRoom(){ if (ioClient) ioClient.emit("room:join", { room:window.roomId, id:window.myId, name:currentName() }); }
function emitStageUpdate(){ if (ioClient) ioClient.emit("stage:update", { room:window.roomId, open:stage.open, slots:stage.slots }); }

/* ====== UI ====== */
window.addEventListener("DOMContentLoaded", ()=>{
  const openBtn   = $("#openBtn");
  const openMenu  = $("#openMenu");
  const menuOwner = $("#menuOwner");
  const menuExit  = $("#menuExit");

  const micBtn    = $("#micBtn");
  const stagePanel= $("#stagePanel");
  const slotsRoot = $("#slots");

  const passInput = $("#passInput");
  const msgInput  = $("#msgInput");
  const sendBtn   = $("#sendBtn");
  const emojiBtn  = $("#emojiBtn");
  const emojiPanel= $("#emojiPanel");

  ensureDefaultName(); updateAsLine();

  // Socket
  joinRoom();
  if (ioClient){
    ioClient.on("connect", ()=> joinRoom());
    ioClient.on("chat:msg", (p)=>{ if (p.room===window.roomId) addMsg({ from:p.name||"عضو", text:p.text, me:(p.id===window.myId) }); });
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

  /* ====== ضع قائمة فتح تحت زر فتح (يسار دايم) ====== */
  function placeMenuUnderOpen(){
    const r = openBtn.getBoundingClientRect();
    openMenu.style.top  = (r.bottom + 6) + "px";
    openMenu.style.left = (r.left) + "px";
    openMenu.style.right= ""; // نتأكد ما فيه right
  }
  function toggleMenu(){
    const willShow = !openMenu.classList.contains("show");
    if (willShow){
      placeMenuUnderOpen();
      if (stage.open){ stage.open=false; renderStage(); emitStageUpdate(); micBtn.setAttribute("aria-expanded","false"); }
    }
    openMenu.classList.toggle("show", willShow);
    openMenu.setAttribute("aria-hidden", String(!willShow));
  }
  openBtn.addEventListener("click", toggleMenu);
  window.addEventListener("resize", ()=>{ if (openMenu.classList.contains("show")) placeMenuUnderOpen(); });

  // عناصر القائمة
  menuExit.addEventListener("click", ()=>{ window.location.href = "index.html"; });
  menuOwner.addEventListener("click", ()=>{
    const ok = (passInput.value === OWNER_PASS);
    if (!ok){ alert("لوحة التحكم للأونر فقط."); return; }
    window.location.href = "owner.html";
  });

  /* ====== الاستيج تحت زر المايك يمين ====== */
  function placeStageRight(){
    const r = micBtn.getBoundingClientRect();
    stagePanel.style.top   = (r.bottom + 6) + "px";
    stagePanel.style.right = "12px";
    stagePanel.style.left  = ""; // تأكيد
  }
  function toggleStage(){
    const willShow = !stage.open;
    if (willShow){
      placeStageRight();
      if (openMenu.classList.contains("show")){ openMenu.classList.remove("show"); openMenu.setAttribute("aria-hidden","true"); }
    }else if (stage.meOnStageIndex !== null){
      stage.slots[stage.meOnStageIndex] = null;
      stage.meOnStageIndex = null;
    }
    stage.open = willShow;
    renderStage(); emitStageUpdate();
    micBtn.setAttribute("aria-expanded", String(willShow));
  }
  micBtn.addEventListener("click", toggleStage);
  window.addEventListener("resize", ()=>{ if (stage.open) placeStageRight(); });

  // ضغط على خانة استيج
  slotsRoot.addEventListener("click", (e)=>{
    const s = e.target.closest(".slot"); if (!s) return;
    const idx = +s.dataset.i;
    const current = stage.slots[idx];
    if (current && current.id !== window.myId) return;
    tryJoinLeaveSlot(idx);
  });

  /* ====== إرسال ====== */
  passInput.addEventListener("input", ()=> localStorage.setItem("enteredPass", passInput.value));
  function send(){
    const text = msgInput.value.trim(); if (!text) return;
    const name = currentName();
    const payload = { room:window.roomId, id:window.myId, name, text };
    if (ioClient) ioClient.emit("chat:msg", payload);
    addMsg({ from:name, text, me:true });
    msgInput.value = ""; msgInput.focus();
  }
  sendBtn.addEventListener("click", send);
  msgInput.addEventListener("keydown", (e)=>{ if (e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } });

  /* ====== إيموجي (فوق الزر) ====== */
  emojiBtn.addEventListener("click", ()=>{
    const r = emojiBtn.getBoundingClientRect();
    const composerRect = document.querySelector(".composer").getBoundingClientRect();
    const leftInside = Math.max(8, r.left - composerRect.left);
    emojiPanel.style.left = leftInside + "px";
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

  /* ====== إغلاق خارجي ====== */
  document.addEventListener("click", (e)=>{
    const inMenu  = e.target.closest("#openMenu") || e.target.closest("#openBtn");
    const inStage = e.target.closest("#stagePanel") || e.target.closest("#micBtn");
    const inEmoji = e.target.closest("#emojiPanel") || e.target.closest("#emojiBtn");

    if (!inMenu && openMenu.classList.contains("show")){
      openMenu.classList.remove("show"); openMenu.setAttribute("aria-hidden","true");
    }
    if (!inStage && stage.open){
      stage.open = false;
      if (stage.meOnStageIndex !== null){ stage.slots[stage.meOnStageIndex] = null; stage.meOnStageIndex = null; }
      renderStage(); emitStageUpdate(); micBtn.setAttribute("aria-expanded","false");
    }
    if (!inEmoji && emojiPanel.classList.contains("show")){
      emojiPanel.classList.remove("show"); emojiPanel.setAttribute("aria-hidden","true");
    }
  });

  updateAsLine();
});
