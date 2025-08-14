/* chat.js — متناسق مع chat.html الأخير
   - الاستيج يسار تحت "فتح" بعرض الصفحة
   - شارات Owner/Admin بجانب الأسماء
   - شاشة ثابتة
*/

const SERVER_URL = (window.SERVER_URL || "https://kwpooop.onrender.com");
const OWNER_PASS = (window.OWNER_PASS || "6677") + "";

/* ====== هوية ====== */
const savedId = localStorage.getItem("myId");
window.myId = savedId || ("u" + Math.random().toString(36).slice(2,10));
if (!savedId) localStorage.setItem("myId", window.myId);

const qp = new URLSearchParams(location.search);
window.roomId = window.roomId || qp.get("room") || "lobby";

/* ====== Helpers ====== */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>r.querySelectorAll(s);
const esc = (t)=> (t||"").replace(/[&<>"']/g,s=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[s]));
const nowHHMM = ()=> new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});

function ensureDefaultName(){
  let n = localStorage.getItem("myName");
  if (!n || !n.trim()){
    n = "عضو-" + window.myId.slice(-4);
    localStorage.setItem("myName", n);
  }
  return n;
}
function currentName(){ return localStorage.getItem("myName") || ensureDefaultName(); }

function getRole(){
  if (localStorage.getItem("ownerOK")==="1" || localStorage.getItem("role")==="owner") return "owner";
  if (localStorage.getItem("role")==="admin") return "admin";
  return "member";
}
function badgeHTML(role){
  if (role==="owner") return '<span class="badge badge-owner" title="Owner">👑</span>';
  if (role==="admin") return '<span class="badge badge-admin" title="Admin">👑</span>';
  return "";
}

/* ====== رسائل ====== */
function updateAsLine(){ $("#asLine").textContent = `ترسل كـ: ${currentName()}`; }
function addMsg({from, text, me=false, role="member"}){
  const wrap = $("#messages");
  const b = document.createElement("div");
  b.className = "msg" + (me ? " me" : "");
  b.textContent = text;
  wrap.appendChild(b);

  const m = document.createElement("div");
  m.className = "meta";
  m.innerHTML = `${esc(from)} ${badgeHTML(role)} • ${nowHHMM()}`;
  wrap.appendChild(m);

  wrap.scrollTop = wrap.scrollHeight + 9999;
}

/* ====== Stage ====== */
const stage = { open:false, slots:[null,null,null,null], meOnStageIndex:null };

function renderStage(){
  const ov = $("#stageOverlay");
  const slotsRoot = $("#slots");
  const isOn = !!stage.open;

  if (!ov) return;
  ov.style.display = isOn ? "block" : "none";
  ov.setAttribute("aria-hidden", String(!isOn));

  if (slotsRoot){
    $$("#slots .slot").forEach(el=>{
      const i = +el.dataset.i;
      const s = stage.slots[i];
      const nameEl = $(".name", el);
      if (s){
        nameEl.innerHTML = `${esc(s.name)} ${badgeHTML(s.role||"member")}`;
        el.classList.add("active");
      }else{
        nameEl.textContent = "فارغ";
        el.classList.remove("active");
      }
    });
  }
  $("#micBtn")?.setAttribute("aria-expanded", String(isOn));
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
  stage.slots[pick] = { id:window.myId, name:currentName(), role:getRole() };
  stage.meOnStageIndex = pick;
  emitStageUpdate(); renderStage();
}

/* ====== Socket ====== */
let ioClient = null;
try{ ioClient = io(SERVER_URL, {transports:["websocket","polling"], path:"/socket.io"}); }
catch(e){ console.warn("Socket.IO غير متاح.", e); }

function joinRoom(){
  if (ioClient){
    ioClient.emit("room:join", { room:window.roomId, id:window.myId, name:currentName(), role:getRole() });
  }
}
function emitStageUpdate(){
  if (ioClient){
    ioClient.emit("stage:update", { room:window.roomId, open:stage.open, slots:stage.slots });
  }
}

/* ====== DOM Ready ====== */
window.addEventListener("DOMContentLoaded", ()=>{
  ensureDefaultName(); updateAsLine();

  const openBtn    = $("#openBtn");
  const openMenu   = $("#openMenu");
  const menuOwner  = $("#menuOwner");
  const menuExit   = $("#menuExit");

  const micBtn     = $("#micBtn");
  const stageOv    = $("#stageOverlay");
  const stageCard  = $("#stageCard");
  const slotsRoot  = $("#slots");

  const msgInput   = $("#msgInput");
  const sendBtn    = $("#sendBtn");
  const emojiBtn   = $("#emojiBtn");
  const emojiPanel = $("#emojiPanel");
  const messages   = $("#messages");

  document.body.style.overflow = "hidden";

  /* Socket */
  joinRoom();
  if (ioClient){
    ioClient.on("connect", ()=> joinRoom());
    ioClient.on("chat:msg", (p)=>{
      if (p.room !== window.roomId) return;
      addMsg({ from:p.name||"عضو", text:p.text, me:(p.id===window.myId), role:(p.role||"member") });
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

  /* قائمة "فتح" يسار */
  function placeMenuUnderOpen(){
    const r = openBtn.getBoundingClientRect();
    openMenu.style.top  = (r.bottom + 6) + "px";
    openMenu.style.left = "12px";  // يسار ثابت
    openMenu.style.right= "";
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

  /* عناصر القائمة */
  menuExit?.addEventListener("click", ()=>{ window.location.href = "index.html"; });
  menuOwner?.addEventListener("click", ()=>{
    if (localStorage.getItem("ownerOK") === "1" || localStorage.getItem("role")==="owner"){
      window.location.href = "owner.html"; return;
    }
    const p = prompt("كلمة سر الأونر:");
    if (p === OWNER_PASS){
      localStorage.setItem("ownerOK","1");
      window.location.href = "owner.html";
    }else if (p !== null){
      alert("غلط. للأونر فقط.");
    }
  });

  /* الاستيج يسار تحت فتح */
  function placeStageFromLeft(){
    if (!stageCard) return;
    const r = openBtn.getBoundingClientRect();
    stageOv.style.display = "block";
    stageCard.style.top  = (r.bottom + 6) + "px";
    stageCard.style.left = "12px";
    stageCard.style.width = "calc(100% - 24px)";
  }
  function toggleStage(){
    const willShow = !stage.open;
    if (willShow){
      if (openMenu.classList.contains("show")){
        openMenu.classList.remove("show");
        openMenu.setAttribute("aria-hidden","true");
      }
      placeStageFromLeft();
    }else if (stage.meOnStageIndex !== null){
      stage.slots[stage.meOnStageIndex] = null;
      stage.meOnStageIndex = null;
    }
    stage.open = willShow;
    renderStage(); emitStageUpdate();
  }
  micBtn.addEventListener("click", toggleStage);
  window.addEventListener("resize", ()=>{ if (stage.open) placeStageFromLeft(); });

  document.addEventListener("click", (e)=>{
    const inMenu  = e.target.closest("#openMenu") || e.target.closest("#openBtn");
    const inStage = e.target.closest("#stageCard") || e.target.closest("#micBtn");
    const inEmoji = e.target.closest("#emojiPanel") || e.target.closest("#emojiBtn");
    if (!inMenu && openMenu.classList.contains("show")){
      openMenu.classList.remove("show"); openMenu.setAttribute("aria-hidden","true");
    }
    if (!inStage && stage.open){
      stage.open = false;
      if (stage.meOnStageIndex !== null){ stage.slots[stage.meOnStageIndex] = null; stage.meOnStageIndex = null; }
      renderStage(); emitStageUpdate();
    }
    if (!inEmoji && $("#emojiPanel").classList.contains("show")){
      $("#emojiPanel").classList.remove("show"); $("#emojiPanel").setAttribute("aria-hidden","true");
    }
  });

  slotsRoot?.addEventListener("click", (e)=>{
    const s = e.target.closest(".slot"); if (!s) return;
    const idx = +s.dataset.i;
    const current = stage.slots[idx];
    if (current && current.id !== window.myId) return;
    tryJoinLeaveSlot(idx);
  });

  function send(){
    const text = msgInput.value.trim(); if (!text) return;
    const payload = { room:window.roomId, id:window.myId, name:currentName(), text, role:getRole() };
    if (ioClient) ioClient.emit("chat:msg", payload);
    addMsg({ from:payload.name, text:payload.text, me:true, role:payload.role });
    msgInput.value = ""; autoGrow(); msgInput.focus();
  }
  sendBtn?.addEventListener("click", send);
  msgInput?.addEventListener("keydown", (e)=>{
    if (e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); }
  });

  function autoGrow(){
    msgInput.style.height = "auto";
    msgInput.style.height = Math.min(msgInput.scrollHeight, window.innerHeight * 0.36) + "px";
    messages.scrollTop = messages.scrollHeight;
  }
  msgInput?.addEventListener("input", autoGrow);
  msgInput?.addEventListener("focus", ()=> setTimeout(()=> messages.scrollTop = messages.scrollHeight, 80));

  if (window.visualViewport){
    const vv = window.visualViewport;
    const onVV = ()=>{
      const composer = $(".composer"); if (!composer) return;
      const bottomInset = Math.max(0, (window.innerHeight - (vv.height + vv.offsetTop)));
      composer.style.transform = `translateY(-${bottomInset}px)`;
    };
    vv.addEventListener("resize", onVV);
    vv.addEventListener("scroll", onVV);
    onVV();
  }

  emojiBtn?.addEventListener("click", ()=>{
    const r = emojiBtn.getBoundingClientRect();
    const comp = $(".composer").getBoundingClientRect();
    const leftInside = Math.max(8, r.left - comp.left);
    emojiPanel.style.left = leftInside + "px";
    emojiPanel.classList.toggle("show");
    emojiPanel.setAttribute("aria-hidden", String(!emojiPanel.classList.contains("show")));
  });
  emojiPanel?.addEventListener("click", (e)=>{
    const t = e.target.closest(".emoji"); if (!t) return;
    const start = msgInput.selectionStart || msgInput.value.length;
    const end   = msgInput.selectionEnd   || msgInput.value.length;
    msgInput.value = msgInput.value.slice(0,start) + t.textContent + msgInput.value.slice(end);
    const caret = start + t.textContent.length;
    autoGrow(); msgInput.focus(); msgInput.setSelectionRange(caret, caret);
  });
});
