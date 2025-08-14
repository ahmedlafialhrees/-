/* chat.js — إرسال/استقبال + استيج + صلاحيات + تخفيف حمل */

const SERVER_URL = (window.SERVER_URL || "https://kwpooop.onrender.com");
const OWNER_PASS = (window.OWNER_PASS || "6677") + "";

/* هوية */
const savedId = localStorage.getItem("myId");
window.myId = savedId || ("u" + Math.random().toString(36).slice(2,10));
if (!savedId) localStorage.setItem("myId", window.myId);
const qp = new URLSearchParams(location.search);
window.roomId = window.roomId || qp.get("room") || "lobby";

/* Helpers */
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

/* رسائل */
function updateAsLine(){ $("#asLine").textContent = `ترسل كـ: ${currentName()}`; }
function addMsg({id, from, text, me=false, role="member"}){
  const wrap = $("#messages");
  const b = document.createElement("div");
  b.className = "msg" + (me ? " me" : "");
  b.textContent = text.slice(0, 1000);
  wrap.appendChild(b);

  const m = document.createElement("div");
  m.className = "meta";
  m.dataset.uid = id || "";
  m.innerHTML = `${esc(from)} ${badgeHTML(role)} • ${nowHHMM()}`;
  wrap.appendChild(m);

  wrap.scrollTop = wrap.scrollHeight + 9999;
}

/* استيج */
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

function tryJoinLeaveSlot(slotIndex){
  if (stage.meOnStageIndex !== null){
    const idx = stage.meOnStageIndex;
    stage.slots[idx] = null;
    stage.meOnStageIndex = null;
    emitStageUpdateDebounced(); renderStage(); return;
  }
  const pick = (typeof slotIndex==="number" ? slotIndex : stage.slots.findIndex(s=>!s));
  if (pick < 0) return;
  stage.slots[pick] = { id:window.myId, name:currentName(), role:getRole() };
  stage.meOnStageIndex = pick;
  emitStageUpdateDebounced(); renderStage();
}

/* Socket */
let ioClient = null;
try{ ioClient = io(SERVER_URL, {transports:["websocket","polling"], path:"/socket.io"}); }
catch(e){ console.warn("Socket.IO غير متاح.", e); }

function joinRoom(){
  if (ioClient){
    ioClient.emit("room:join", { room:window.roomId, id:window.myId, name:currentName(), role:getRole() });
  }
}
function emitStageUpdate(){ ioClient?.emit("stage:update", { room:window.roomId, open:stage.open, slots:stage.slots }); }
let stageDebTimer=null;
function emitStageUpdateDebounced(){
  clearTimeout(stageDebTimer);
  stageDebTimer = setTimeout(()=> emitStageUpdate(), 120);
}

/* أكشن شيت للمود */
let holdTimer=null;
function longPress(el, cb){
  el.addEventListener("touchstart", ()=>{ holdTimer = setTimeout(()=>cb(), 400); }, {passive:true});
  el.addEventListener("touchend", ()=> clearTimeout(holdTimer), {passive:true});
  el.addEventListener("mousedown", ()=>{ holdTimer = setTimeout(()=>cb(), 400); });
  el.addEventListener("mouseup", ()=> clearTimeout(holdTimer));
}
function openActionSheet({x=20,y=80, targetId, targetName, targetRole}){
  const meRole = getRole();
  if (meRole === "member") return;
  let items = [
    {k:"pull",t:"سحب للمسرح"},
    {k:"remove",t:"إنزال من المسرح"},
    {k:"mute5",t:"كتم 5 د"},
    {k:"mute30",t:"كتم 30 د"},
    {k:"kick",t:"طرد"},
    {k:"ban",t:"حظر 120 د"}
  ];
  if (meRole === "owner"){
    if (targetRole === "admin") items.push({k:"revoke",t:"سحب أدمن"});
    else items.push({k:"grant",t:"منح أدمن"});
  }
  let sheet = $("#actionSheet");
  if (!sheet){
    sheet = document.createElement("div");
    sheet.id = "actionSheet";
    sheet.style.cssText = "position:fixed; z-index:80; background:#0b1220; border:1px solid #1f2740; border-radius:12px; padding:8px; min-width:180px; box-shadow:0 10px 30px rgba(0,0,0,.35)";
    document.body.appendChild(sheet);
  }
  sheet.innerHTML = `<div style="color:#b7c7e6; padding:6px 8px; font-size:13px">${esc(targetName||"مستخدم")}</div>` +
    items.map(i=>`<button data-k="${i.k}" style="display:block;width:100%;text-align:right;padding:10px 12px;margin:6px 0;border:1px solid #27314a;background:#0e1422;color:#e9edf5;border-radius:10px">${i.t}</button>`).join("");
  sheet.style.left = x + "px"; sheet.style.top = y + "px"; sheet.style.display = "block";
  function close(){ sheet.style.display = "none"; document.removeEventListener("click", outside, true); }
  function outside(e){ if (!sheet.contains(e.target)) close(); }
  document.addEventListener("click", outside, true);
  sheet.onclick = (e)=>{
    const k = e.target?.dataset?.k; if (!k) return;
    const room = window.roomId, byId = window.myId;
    switch(k){
      case "pull":  ioClient.emit("mod:stage:pull",   {room, byId, targetId}); break;
      case "remove":ioClient.emit("mod:stage:remove", {room, byId, targetId}); break;
      case "mute5": ioClient.emit("mod:mute",         {room, byId, targetId, minutes:5}); break;
      case "mute30":ioClient.emit("mod:mute",         {room, byId, targetId, minutes:30}); break;
      case "kick":  ioClient.emit("mod:kick",         {room, byId, targetId}); break;
      case "ban":   ioClient.emit("mod:tempban",      {room, byId, targetId, minutes:120}); break;
      case "grant": ioClient.emit("mod:admin:grant",  {room, byId, targetId}); break;
      case "revoke":ioClient.emit("mod:admin:revoke", {room, byId, targetId}); break;
    }
    close();
  };
}

/* DOM Ready */
window.addEventListener("DOMContentLoaded", ()=>{
  ensureDefaultName(); updateAsLine();
  const openBtn=$("#openBtn"), openMenu=$("#openMenu"), menuOwner=$("#menuOwner"), menuExit=$("#menuExit");
  const micBtn=$("#micBtn"), stageOv=$("#stageOverlay"), stageCard=$("#stageCard"), slotsRoot=$("#slots");
  const msgInput=$("#msgInput"), sendBtn=$("#sendBtn"), emojiBtn=$("#emojiBtn"), emojiPanel=$("#emojiPanel"), messages=$("#messages");

  document.body.style.overflow = "hidden";

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
      renderStage();
    });

    ioClient.on("stage:update", (s)=>{
      if (s.room !== window.roomId) return;
      stage.open = !!s.open; stage.slots = s.slots;
      const i = stage.slots.findIndex(x=> x && x.id === window.myId);
      stage.meOnStageIndex = (i>=0? i : null);
      renderStage();
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
        // ممكن تعرض توست صغير بدل alert
        console.warn("تم تقييد الإرسال مؤقتًا.");
      }
    });
  }

  /* قائمة "فتح" يسار */
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
      if (stage.open){ stage.open=false; renderStage(); emitStageUpdateDebounced(); micBtn.setAttribute("aria-expanded","false"); }
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
    stageCard.style.position = "absolute";
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
    renderStage(); emitStageUpdateDebounced();
  }
  $("#micBtn").addEventListener("click", toggleStage);
  window.addEventListener("resize", ()=>{ if (stage.open) placeStageFromLeft(); });

  // طقة على خانة استيج (أنا فقط/الفارغ)
  $("#slots")?.addEventListener("click", (e)=>{
    const s = e.target.closest(".slot"); if (!s) return;
    const idx = +s.dataset.i;
    const current = stage.slots[idx];
    if (current && current.id !== window.myId) return;
    tryJoinLeaveSlot(idx);
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

  /* أوامر بالضغط المطوّل */
  $("#messages").addEventListener("pointerdown", (e)=>{
    const meta = e.target.closest(".meta"); if (!meta) return;
    const uid = meta.dataset.uid; if (!uid || uid === window.myId) return;
    const name = meta.textContent.split("•")[0].trim();
    const rect = meta.getBoundingClientRect();
    longPress(meta, ()=> openActionSheet({ x: rect.left, y: rect.bottom+6, targetId: uid, targetName: name, targetRole: "member" }));
  });
  $("#slots")?.addEventListener("pointerdown", (e)=>{
    const slot = e.target.closest(".slot"); if (!slot || !slot.dataset.uid) return;
    const uid = slot.dataset.uid; if (uid === window.myId) return;
    const name = slot.querySelector(".name")?.textContent?.replace("👑","").trim() || "مستخدم";
    const rect = slot.getBoundingClientRect();
    longPress(slot, ()=> openActionSheet({ x: rect.left, y: rect.bottom+6, targetId: uid, targetName: name, targetRole: "member" }));
  });
});
