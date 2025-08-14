/* chat.js — شات + استيج + صلاحيات + WebRTC صوت */
const SERVER_URL = (window.SERVER_URL || "https://kwpooop.onrender.com");
const OWNER_PASS = (window.OWNER_PASS || "6677") + "";

/* ===== هوية ===== */
const savedId = localStorage.getItem("myId");
window.myId = savedId || ("u" + Math.random().toString(36).slice(2,10));
if (!savedId) localStorage.setItem("myId", window.myId);
const qp = new URLSearchParams(location.search);
window.roomId = window.roomId || qp.get("room") || "lobby";

/* ===== Helpers ===== */
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

/* ===== رسائل UI ===== */
function updateAsLine(){ $("#asLine").textContent = `ترسل كـ: ${currentName()}`; }
function addMsg({id, from, text, me=false, role="member"}){
  const wrap = $("#messages");
  const b = document.createElement("div");
  b.className = "msg" + (me ? " me" : "");
  b.textContent = (text||"").slice(0, 1000);
  wrap.appendChild(b);

  const m = document.createElement("div");
  m.className = "meta";
  m.dataset.uid = id || "";
  m.innerHTML = `${esc(from)} ${badgeHTML(role)} • ${nowHHMM()}`;
  wrap.appendChild(m);

  wrap.scrollTop = wrap.scrollHeight + 9999;
}

/* ===== استيج ===== */
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
        el.dataset.uid = s.id || "";
      }else{
        nameEl.textContent = "فارغ";
        el.classList.remove("active");
        el.dataset.uid = "";
      }
    });
  }
  $("#micBtn")?.setAttribute("aria-expanded", String(isOn));
}

/* ===== Socket ===== */
let ioClient = null;
try{ ioClient = io(SERVER_URL, {transports:["websocket","polling"], path:"/socket.io"}); }
catch(e){ console.warn("Socket.IO غير متاح.", e); }

function joinRoom(){
  if (ioClient){
    ioClient.emit("room:join", { room:window.roomId, id:window.myId, name:currentName(), role:getRole() });
  }
}

/* ===== WebRTC Audio ===== */
const peers = new Map();           // remoteId -> RTCPeerConnection
const remoteAudios = new Map();    // remoteId -> HTMLAudioElement
let localStream = null;
const RTC_CONFIG = { iceServers: [{urls:"stun:stun.l.google.com:19302"}] };

async function ensureMic(){
  if (localStream) return localStream;
  // نطلب المايك فقط إذا أنا على الاستيج
  localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
  return localStream;
}
function stopMic(){
  if (localStream){
    localStream.getTracks().forEach(t=> t.stop());
    localStream = null;
  }
}

function attachRemoteAudio(remoteId, ev){
  let el = remoteAudios.get(remoteId);
  if (!el){
    el = document.createElement("audio");
    el.autoplay = true; el.playsInline = true; el.controls = false; el.hidden = true;
    remoteAudios.set(remoteId, el);
    document.body.appendChild(el);
  }
  el.srcObject = ev.streams[0];
}

function closePeer(remoteId){
  const pc = peers.get(remoteId);
  if (pc){ try{ pc.ontrack=null; pc.onicecandidate=null; pc.close(); }catch{} }
  peers.delete(remoteId);
  const el = remoteAudios.get(remoteId);
  if (el){ try{ el.srcObject=null; el.remove(); }catch{} }
  remoteAudios.delete(remoteId);
}

async function createPeer(remoteId, isCaller){
  if (peers.has(remoteId)) return peers.get(remoteId);
  const pc = new RTCPeerConnection(RTC_CONFIG);
  peers.set(remoteId, pc);

  pc.ontrack = (ev)=> attachRemoteAudio(remoteId, ev);
  pc.onicecandidate = (ev)=>{
    if (ev.candidate){
      ioClient.emit("rtc:ice", { room:window.roomId, to:remoteId, from:window.myId, candidate:ev.candidate });
    }
  };

  // لو أنا على الاستيج وعندي مايك فعّال، نضيف التراكات
  if (stage.meOnStageIndex !== null){
    const stream = await ensureMic();
    stream.getAudioTracks().forEach(tr=> pc.addTrack(tr, stream));
  }

  if (isCaller){
    const offer = await pc.createOffer({ offerToReceiveAudio:true, offerToReceiveVideo:false });
    await pc.setLocalDescription(offer);
    ioClient.emit("rtc:offer", { room:window.roomId, to:remoteId, from:window.myId, sdp:offer });
  }
  return pc;
}

/* ===== الربط بناءً على الاستيج ===== */
function currentSpeakersIds(){
  return stage.slots.filter(Boolean).map(s=> s.id);
}
async function refreshAudioLinks(){
  const speakers = new Set(currentSpeakersIds());

  // لو أنا فوق: فعّل المايك وابدأ ربط مع الجميع (سبيكر ومستمعين)
  if (stage.meOnStageIndex !== null){
    try{ await ensureMic(); }catch(e){ alert("اذن المايك مرفوض"); }
    // وصل مع كل الموجودين في الحضور (يُبث لهم المايك)
    // لو ما عندنا presence، على الأقل نربط مع كل السبيكرز الآخرين
    roomUsers.forEach(u=>{
      if (u.id !== window.myId) createPeer(u.id, true);
    });
  }else{
    // أنا مستمع: مايك طافي، اربط فقط مع السبيكرز لاستقبال الصوت
    stopMic();
    roomUsers.forEach(u=>{
      if (speakers.has(u.id) && u.id !== window.myId) createPeer(u.id, true);
    });
  }

  // سكّر أي Peer ما عاد نحتاجه
  for (const rid of Array.from(peers.keys())){
    const stillNeed =
      (stage.meOnStageIndex !== null && rid!==window.myId) // أنا متحدث: أبث للجميع
      || (speakers.has(rid));                              // أنا مستمع: أحتاج السبيكرز فقط
    if (!stillNeed) closePeer(rid);
  }
}

/* presence من السيرفر */
let roomUsers = []; // [{id,name,role}]
function updatePresence(list){
  roomUsers = list || [];
  refreshAudioLinks();
}

/* ===== DOM Ready ===== */
window.addEventListener("DOMContentLoaded", ()=>{
  ensureDefaultName(); updateAsLine();

  const openBtn    = $("#openBtn");
  const openMenu   = $("#openMenu");
  const menuOwner  = $("#menuOwner");
  const menuExit   = $("#menuExit");

  const micBtn     = $("#micBtn");
  const stageOv    = $("#stageOverlay");
  const stageCard  = $("#stageCard");

  const msgInput   = $("#msgInput");
  const sendBtn    = $("#sendBtn");
  const emojiBtn   = $("#emojiBtn");
  const emojiPanel = $("#emojiPanel");
  const messages   = $("#messages");
  const asLine     = $("#asLine");

  document.body.style.overflow = "hidden";

  // لوحة التحكم للأونر فقط
  if (menuOwner){ menuOwner.style.display = (getRole()==="owner") ? "" : "none"; }
  asLine?.addEventListener("click", renameSelfFlow);

  /* Socket */
  joinRoom();
  if (ioClient){
    ioClient.on("connect", ()=> joinRoom());

    ioClient.on("chat:msg", (p)=>{
      if (p.room !== window.roomId) return;
      addMsg({ id:p.id, from:p.name||"عضو", text:p.text, me:(p.id===window.myId), role:(p.role||"member") });
    });

    ioClient.on("stage:state", (s)=>{
      if (s.room !== window.roomId) return;
      stage.open = !!s.open; stage.slots = Array.isArray(s.slots)? s.slots : [null,null,null,null];
      const i = stage.slots.findIndex(x=> x && x.id === window.myId);
      stage.meOnStageIndex = (i>=0? i : null);
      renderStage(); refreshAudioLinks();
    });

    ioClient.on("stage:update", (s)=>{
      if (s.room !== window.roomId) return;
      stage.open = !!s.open; stage.slots = s.slots;
      const i = stage.slots.findIndex(x=> x && x.id === window.myId);
      stage.meOnStageIndex = (i>=0? i : null);
      renderStage(); refreshAudioLinks();
    });

    ioClient.on("room:presence", (p)=>{
      if (p.room !== window.roomId) return;
      updatePresence(p.users);
    });

    ioClient.on("sys:notice", (n)=>{
      if (n.room !== window.roomId) return;
      addMsg({ id:"sys", from:"النظام", text:n.text, me:false, role:"member" });
    });

    ioClient.on("sys:error", (e)=>{
      if (e.code === "banned"){
        alert("محظور مؤقتاً حتى: " + new Date(e.until).toLocaleString());
      }else if (e.code === "muted"){
        alert("أنت مكتوم حتى: " + new Date(e.until).toLocaleTimeString());
      }else if (e.code === "ratelimited"){
        console.warn("تم تقييد الإرسال مؤقتًا.");
      }
    });

    /* ===== WebRTC signaling ===== */
    ioClient.on("rtc:offer", async ({room, from, sdp})=>{
      if (room !== window.roomId) return;
      const pc = await createPeer(from, false);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      // أضف تراكات المايك إذا أنا متحدث
      if (stage.meOnStageIndex !== null){
        const stream = await ensureMic();
        const have = pc.getSenders().some(s=> s.track && s.track.kind==="audio");
        if (!have) stream.getAudioTracks().forEach(tr=> pc.addTrack(tr, stream));
      }
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      ioClient.emit("rtc:answer", { room:window.roomId, to:from, from:window.myId, sdp:ans });
    });

    ioClient.on("rtc:answer", async ({room, from, sdp})=>{
      if (room !== window.roomId) return;
      const pc = peers.get(from); if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    ioClient.on("rtc:ice", async ({room, from, candidate})=>{
      if (room !== window.roomId) return;
      const pc = peers.get(from); if (!pc || !candidate) return;
      try{ await pc.addIceCandidate(candidate); }catch(e){ console.warn("ICE add error", e); }
    });
  }

  /* UI: قائمة "فتح" يسار */
  function placeMenuUnderOpen(){
    const r = openBtn.getBoundingClientRect();
    openMenu.style.top  = (r.bottom + 6) + "px";
    openMenu.style.left = "12px";
    openMenu.style.right= "";
  }
  function toggleMenu(){
    const willShow = !openMenu.classList.contains("show");
    if (willShow){
      placeMenuUnderOpen();
      if (stage.open){ stage.open=false; renderStage(); micBtn.setAttribute("aria-expanded","false"); }
    }
    openMenu.classList.toggle("show", willShow);
    openMenu.setAttribute("aria-hidden", String(!willShow));
  }
  openBtn.addEventListener("click", toggleMenu);
  window.addEventListener("resize", ()=>{ if (openMenu.classList.contains("show")) placeMenuUnderOpen(); });

  /* عناصر القائمة */
  menuExit?.addEventListener("click", ()=>{ window.location.href = "index.html"; });
  menuOwner?.addEventListener("click", ()=>{
    if (getRole() !== "owner") return;
    window.location.href = "owner.html";
  });

  /* الاستيج يسار تحت فتح */
  function placeStageFromLeft(){
    const r = openBtn.getBoundingClientRect();
    $("#stageOverlay").style.display = "block";
    $("#stageCard").style.position = "absolute";
    $("#stageCard").style.top  = (r.bottom + 6) + "px";
    $("#stageCard").style.left = "12px";
    $("#stageCard").style.width = "calc(100% - 24px)";
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
      // نزول ذاتي من المسرح
      const idx = stage.meOnStageIndex;
      stage.slots[idx] = null;
      stage.meOnStageIndex = null;
    }
    stage.open = willShow;
    renderStage();
    // بث التحديث للسيرفر
    ioClient.emit("stage:update", { room:window.roomId, open:stage.open, slots:stage.slots });
    refreshAudioLinks();
  }
  $("#micBtn").addEventListener("click", toggleStage);
  window.addEventListener("resize", ()=>{ if (stage.open) placeStageFromLeft(); });

  // صعود/نزول ذاتي على خانة فارغة أو خانتي
  $("#slots")?.addEventListener("click", (e)=>{
    const s = e.target.closest(".slot"); if (!s) return;
    const idx = +s.dataset.i;
    const current = stage.slots[idx];
    if (current && current.id !== window.myId) return;
    if (stage.meOnStageIndex !== null){
      // نزول
      stage.slots[stage.meOnStageIndex] = null;
      stage.meOnStageIndex = null;
    }else{
      // صعود
      stage.slots[idx] = { id:window.myId, name:currentName(), role:getRole() };
      stage.meOnStageIndex = idx;
    }
    renderStage();
    ioClient.emit("stage:update", { room:window.roomId, open:true, slots:stage.slots });
    refreshAudioLinks();
  });

  /* إرسال */
  function send(){
    const text = msgInput.value.trim(); if (!text) return;
    const payload = { room:window.roomId, id:window.myId, name:currentName(), text, role:getRole() };
    ioClient?.emit("chat:msg", payload);
    addMsg({ id:payload.id, from:payload.name, text:payload.text, me:true, role:payload.role });
    msgInput.value = ""; autoGrow(); msgInput.focus();
  }
  $("#sendBtn")?.addEventListener("click", send);
  $("#msgInput")?.addEventListener("keydown", (e)=>{
    if (e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); }
  });

  /* Auto-grow */
  function autoGrow(){
    msgInput.style.height = "auto";
    msgInput.style.height = Math.min(msgInput.scrollHeight, window.innerHeight * 0.36) + "px";
    $("#messages").scrollTop = $("#messages").scrollHeight;
  }
  $("#msgInput")?.addEventListener("input", autoGrow);
  $("#msgInput")?.addEventListener("focus", ()=> setTimeout(()=> $("#messages").scrollTop = $("#messages").scrollHeight, 80));

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

  /* إيموجي */
  $("#emojiBtn")?.addEventListener("click", ()=>{
    const r = $("#emojiBtn").getBoundingClientRect();
    const comp = $(".composer").getBoundingClientRect();
    const leftInside = Math.max(8, r.left - comp.left);
    $("#emojiPanel").style.left = leftInside + "px";
    $("#emojiPanel").classList.toggle("show");
    $("#emojiPanel").setAttribute("aria-hidden", String(!$("#emojiPanel").classList.contains("show")));
  });
  $("#emojiPanel")?.addEventListener("click", (e)=>{
    const t = e.target.closest(".emoji"); if (!t) return;
    const start = msgInput.selectionStart || msgInput.value.length;
    const end   = msgInput.selectionEnd   || msgInput.value.length;
    msgInput.value = msgInput.value.slice(0,start) + t.textContent + msgInput.value.slice(end);
    const caret = start + t.textContent.length;
    autoGrow(); msgInput.focus(); msgInput.setSelectionRange(caret, caret);
  });

  /* أوامر بالضغط المطوّل (تبقى كما هي لو حاب) — محذوفة هنا للاختصار */
});

/* ==== Rename flow ==== */
function renameSelfFlow(){
  const cur = currentName();
  const n = prompt("اكتب اسمك:", cur || "");
  if (n === null) return;
  const name = (n || "").trim().slice(0,24);
  if (!name) return;
  localStorage.setItem("myName", name);
  updateAsLine();
  if (stage.meOnStageIndex !== null){
    stage.slots[stage.meOnStageIndex].name = name; renderStage();
    ioClient?.emit("stage:update", { room:window.roomId, open:true, slots:stage.slots });
  }
  ioClient?.emit("room:rename", { room:window.roomId, id:window.myId, name });
}
