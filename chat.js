/* chat.js — Ahmed room wire (messages + emoji + stage 4 mics + owner menu)
   متوافق مع HTML المرسل: micBtn / openBtn / menuDrop / ownerLink / messages / msgInput / sendBtn
   stageOverlay + #slots (.slot) + emojiPanel(.hidden) + emojiBtn
*/

// ====== إعدادات عامة ======
const SERVER_URL = (window.SERVER_URL || "https://kwpooop.onrender.com");
const OWNER_PASS = (window.OWNER_PASS || "6677") + "";

// هوية وروم
const savedId = localStorage.getItem("myId");
window.myId = savedId || ("u" + Math.random().toString(36).slice(2,10));
if (!savedId) localStorage.setItem("myId", window.myId);
const qp = new URLSearchParams(location.search);
window.roomId = qp.get("room") || "lobby";

// ====== Socket.IO ======
(function connectSocket(){
  if (typeof io === "undefined") { console.error("Socket.IO not loaded"); return; }
  const socket = io(SERVER_URL, { transports:["websocket","polling"], path:"/socket.io" });
  window.socket = socket;

  socket.on("connect", () => {
    socket.emit("joinRoom", { roomId: window.roomId, userId: window.myId });
  });

  socket.on("chat:msg", ({ from, text, at }) => {
    appendMessage({ from, text, self: from === window.myId, at });
  });

  socket.on("stage:update", (payload) => {
    Stage.applyUpdate(payload);
  });
})();

// ====== مساعدات DOM ======
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => root.querySelectorAll(sel);
document.addEventListener("click", (e) => {
  // إغلاق قائمة "افتح" إذا نقرت برّه
  const menu = $("#menuDrop"), btn = $("#openBtn");
  if (menu && !menu.classList.contains("hidden")) {
    if (!menu.contains(e.target) && e.target !== btn) menu.classList.add("hidden");
  }
});

// ====== قائمة "افتح" + لوحة التحكم ======
(function wireMenu(){
  const openBtn   = $("#openBtn");
  const menuDrop  = $("#menuDrop");
  const ownerLink = $("#ownerLink"); // رابط لوحة التحكم (مخفي بكلاس hidden)
  let ownerOK = localStorage.getItem("ownerOK") === "1";

  if (ownerOK && ownerLink) ownerLink.classList.remove("hidden");

  openBtn?.addEventListener("click", () => {
    menuDrop?.classList.toggle("hidden");
  });

  // دبل كليك على "افتح" يطلب باس الأونر ويفعّل الرابط
  openBtn?.addEventListener("dblclick", () => {
    if (ownerOK) return;
    const p = prompt("أدخل كلمة سر الأونر:");
    if (p === OWNER_PASS) {
      ownerOK = true;
      localStorage.setItem("ownerOK","1");
      ownerLink?.classList.remove("hidden");
      alert("تم تفعيل لوحة التحكم.");
    } else if (p != null) {
      alert("كلمة السر غير صحيحة");
    }
  });

  // لو الرابط ظاهر لكن تبينا نحميه بعد
  ownerLink?.addEventListener("click", (e) => {
    if (!ownerOK) {
      e.preventDefault();
      const p = prompt("أدخل كلمة سر الأونر:");
      if (p === OWNER_PASS) {
        ownerOK = true; localStorage.setItem("ownerOK","1");
        ownerLink.classList.remove("hidden");
        location.href = ownerLink.getAttribute("href");
      } else if (p != null) alert("كلمة السر غير صحيحة");
    }
  });

  // زر خروج (اختياري لو موجود)
  $("#logoutLink")?.addEventListener("click", () => {
    localStorage.removeItem("ownerOK");
    location.href = "index.html";
  });
})();

// ====== الرسائل + حقل ثابت ======
(function wireMessages(){
  const list   = $("#messages");
  const input  = $("#msgInput");
  const send   = $("#sendBtn");
  const asLine = $("#asLine");

  if (asLine) {
    const nick = localStorage.getItem("nickname") || ("ضيف-" + window.myId.slice(-4));
    asLine.textContent = "ترسل كـ: " + nick;
  }

  function sendNow() {
    const text = (input?.value || "").trim();
    if (!text) return;
    window.socket?.emit("chat:msg", { roomId: window.roomId, from: window.myId, text });
    appendMessage({ from: window.myId, text, self:true, at: Date.now() });
    input.value = ""; input.focus();
  }

  // زر الإرسال
  send?.addEventListener("click", (e) => { e.preventDefault(); sendNow(); });
  // Enter للإرسال
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); sendNow(); }
  });

  // دالة إضافة رسالة (ما نغيّر الستايل عندك)
  window.appendMessage = function({ from, text, self=false }){
    if (!list) return;
    const box = document.createElement("div");
    box.className = self ? "msg me" : "msg";
    box.textContent = text;
    list.appendChild(box);
    try { list.scrollTo({ top: list.scrollHeight, behavior: "smooth" }); } catch {}
  };
})();

// ====== لوحة الإيموجي ======
(function wireEmoji(){
  const btn   = $("#emojiBtn");
  const panel = $("#emojiPanel");
  const input = $("#msgInput");
  if (!btn || !panel || !input) return;

  const toggle = () => panel.classList.toggle("hidden");
  btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
  panel.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.classList.contains("emoji")) {
      const emoji = t.textContent;
      const s = input.selectionStart ?? input.value.length;
      const en = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0,s) + emoji + input.value.slice(en);
      input.focus(); input.setSelectionRange(s+emoji.length, s+emoji.length);
    }
  });
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.add("hidden");
  });
})();

// ====== الاستيج: ٤ مايكات (micBtn + stageOverlay + #slots .slot) ======
const Stage = (() => {
  const state = { open:false, slots:[null,null,null,null] };
  let overlay, slotsWrap, micBtn, slotEls;

  // يبني ٤ خانات إذا ناقصة
  function buildSlotsIfNeeded() {
    if (!slotsWrap) return;
    if (slotsWrap.children.length >= 4) return;
    slotsWrap.innerHTML = "";
    for (let i=0;i<4;i++){
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.innerHTML = `
        <div class="micCircle">🎤</div>
        <div class="name">فارغ</div>
      `;
      slotsWrap.appendChild(slot);
    }
  }

  function bind() {
    overlay   = $("#stageOverlay");
    slotsWrap = $("#slots");
    micBtn    = $("#micBtn"); // مهم: id مطابق لصفحتك
    if (!overlay || !slotsWrap || !micBtn) return;

    buildSlotsIfNeeded();
    slotEls = $$(".slot", slotsWrap);

    // فتح/قفل الاستيج (نستخدم display:flex لأنه متوافق مع CSS الحالي)
    micBtn.addEventListener("click", () => {
      state.open ? close() : open();
    });

    // التبديل يكون فقط على "صورة المايك" داخل الخانة
    slotsWrap.addEventListener("click", (e) => {
      const micIcon = e.target.closest(".micCircle");
      if (!micIcon) return;                    // تجاهل أي ضغط خارج الأيقونة
      const slot = micIcon.closest(".slot");
      if (!slot) return;
      const idx = [...slotEls].indexOf(slot);
      if (idx === -1) return;

      const mine  = slot.dataset.uid === window.myId;
      const empty = !slot.dataset.uid;

      if (mine)       leave();
      else if (empty) join(idx);
    });

    render();
  }

  function open(){ if (!overlay) return; overlay.style.display = "flex"; state.open = true; }
  function close(){
    if (!overlay) return;
    overlay.style.display = "none";
    state.open = false;
    // نزّلني لو كنت فوق
    const i = state.slots.indexOf(window.myId);
    if (i > -1) leave();
  }

  function render(){
    if (!slotEls) return;
    slotEls.forEach((el, i) => {
      const uid = state.slots[i];
      el.dataset.uid = uid || "";
      el.classList.toggle("on",  !!uid);
      el.classList.toggle("me",  uid === window.myId);
      const name = $(".name", el);
      if (name) name.textContent = uid ? (uid === window.myId ? "أنت" : "مشغول") : "فارغ";
    });
  }

  function join(i){
    const idx = Math.max(0, Math.min(3, i|0));
    const prev = state.slots.indexOf(window.myId);
    if (prev > -1) state.slots[prev] = null;
    if (!state.slots[idx]) state.slots[idx] = window.myId;
    render();
    window.socket?.emit("stage:join", { roomId: window.roomId, slotIndex: idx });
  }

  function leave(){
    const i = state.slots.indexOf(window.myId);
    if (i > -1) state.slots[i] = null;
    render();
    window.socket?.emit("stage:leave", { roomId: window.roomId });
  }

  function applyUpdate(payload){
    if (!payload || !Array.isArray(payload.slots)) return;
    state.slots = payload.slots;
    render();
  }

  window.addEventListener("beforeunload", () => {
    const i = state.slots.indexOf(window.myId);
    if (i > -1) window.socket?.emit("stage:leave", { roomId: window.roomId });
  });

  document.addEventListener("DOMContentLoaded", bind);

  return { open, close, join, leave, applyUpdate };
})();
