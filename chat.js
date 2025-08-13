/* chat.js — room wire (messages + emoji + stage 4 mics + owner menu, race-safe)
   متوافق مع HTML: micBtn / openBtn / menuDrop / ownerLink / logoutLink
   messages / msgInput / sendBtn / asLine / emojiBtn / emojiPanel / stageOverlay / slots (.slot> .micCircle + .name)
*/

/* ====== إعدادات عامة ====== */
const SERVER_URL = (window.SERVER_URL || "https://kwpooop.onrender.com");
const OWNER_PASS = (window.OWNER_PASS || "6677") + "";

/* ====== هوية وروم ====== */
const savedId = localStorage.getItem("myId");
window.myId = savedId || ("u" + Math.random().toString(36).slice(2,10));
if (!savedId) localStorage.setItem("myId", window.myId);
const qp = new URLSearchParams(location.search);
window.roomId = qp.get("room") || "lobby";

/* ====== Helpers ====== */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => root.querySelectorAll(sel);

/* ====== Socket.IO (مع طابور رسائل احتياطي) ====== */
(function connectSocket(){
  if (typeof io === "undefined") { console.error("Socket.IO not loaded"); return; }

  // طابور مؤقت لأي رسائل توصل قبل تعريف appendMessage
  window.__msgQueue = [];

  const socket = io(SERVER_URL, { transports:["websocket","polling"], path:"/socket.io" });
  window.socket = socket;

  socket.on("connect", () => {
    socket.emit("joinRoom", { roomId: window.roomId, userId: window.myId });
  });

  socket.on("chat:msg", (m) => {
    if (typeof window.appendMessage === "function") {
      window.appendMessage({ from: m.from, text: m.text, self: m.from === window.myId, at: m.at });
    } else {
      window.__msgQueue.push(m);
    }
  });

  // لو وصل تحديث بدري: استدعِ فقط لو Stage جاهز
  socket.on("stage:update", (payload) => {
    if (window.Stage && typeof window.Stage.applyUpdate === "function") {
      window.Stage.applyUpdate(payload);
    }
  });
})();

/* ====== إغلاق قائمة "افتح" عند الضغط خارجها ====== */
document.addEventListener("click", (e) => {
  const menu = $("#menuDrop"), btn = $("#openBtn");
  if (menu && !menu.classList.contains("hidden")) {
    if (!menu.contains(e.target) && e.target !== btn) menu.classList.add("hidden");
  }
});

/* ====== قائمة "افتح" + لوحة التحكم (يمين + للأونر فقط) ====== */
(function wireMenuV2(){
  const openBtn   = $("#openBtn");
  const menuDrop  = $("#menuDrop");
  const ownerLink = $("#ownerLink");
  const logout    = $("#logoutLink");

  let isOwner = localStorage.getItem("ownerOK") === "1";
  const PASS  = OWNER_PASS;

  function refreshMenu() {
    if (menuDrop) { menuDrop.style.left = "auto"; menuDrop.style.right = "0"; }
    if (ownerLink) ownerLink.classList.toggle("hidden", !isOwner);
  }

  openBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!menuDrop) return;
    refreshMenu();
    menuDrop.classList.toggle("hidden");
  });

  // تفعيل أونر: ضغطة مطوّلة للموبايل + دبل كلك للديسكتوب
  let pressTimer = null;
  function askOwnerPass() {
    if (isOwner) return refreshMenu();
    const p = prompt("أدخل كلمة سر الأونر:");
    if (p === PASS) {
      isOwner = true; localStorage.setItem("ownerOK","1");
      refreshMenu(); alert("تم تفعيل لوحة التحكم للأونر.");
    } else if (p != null) { alert("كلمة السر غير صحيحة"); }
  }
  openBtn?.addEventListener("touchstart", () => { pressTimer = setTimeout(askOwnerPass, 600); });
  openBtn?.addEventListener("touchend",   () => { if (pressTimer) clearTimeout(pressTimer); });
  openBtn?.addEventListener("dblclick", askOwnerPass);

  ownerLink?.addEventListener("click", (e) => {
    if (!isOwner) {
      e.preventDefault();
      askOwnerPass();
      if (isOwner) location.href = ownerLink.getAttribute("href");
    }
  });

  logout?.addEventListener("click", () => {
    localStorage.removeItem("ownerOK");
    isOwner = false;
    refreshMenu();
    // اختياري: رجّع لواجهة عامة
    // location.href = "index.html";
  });

  refreshMenu();
})();

/* ====== الرسائل + حقل ثابت ====== */
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

  send?.addEventListener("click", (e) => { e.preventDefault(); sendNow(); });
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); sendNow(); }
  });

  window.appendMessage = function({ from, text, self=false }){
    if (!list) return;
    const box = document.createElement("div");
    box.className = self ? "msg me" : "msg";
    box.textContent = text;
    list.appendChild(box);
    try { list.scrollTo({ top: list.scrollHeight, behavior: "smooth" }); } catch {}
  };

  // تفريغ أي رسائل وصلت قبل تعريف appendMessage
  if (Array.isArray(window.__msgQueue) && window.__msgQueue.length) {
    window.__msgQueue.forEach((m) => {
      window.appendMessage({ from: m.from, text: m.text, self: m.from === window.myId, at: m.at });
    });
    window.__msgQueue.length = 0;
  }
})();

/* ====== لوحة الإيموجي ====== */
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

/* ====== الاستيج: ٤ مايكات (زر 🎤 يفتح/يقفل — الضغط على 🎤 داخل الخانة فقط يبدّل) ====== */
const Stage = (() => {
  const state = { open:false, slots:[null,null,null,null] };
  let overlay, slotsWrap, micBtn, slotEls;

  // ——— ربط قوي + إعادة محاولة حتى يجد العناصر ———
  function onReady(cb){
    if (document.readyState !== 'loading') cb();
    else document.addEventListener('DOMContentLoaded', cb, { once:true });
  }
  function getEls(){
    overlay   = document.getElementById("stageOverlay");
    slotsWrap = document.getElementById("slots");
    micBtn    = document.getElementById("micBtn");
    return !!(overlay && slotsWrap && micBtn);
  }
  function ensureFourSlots() {
    if (!slotsWrap) return;
    if (slotsWrap.children.length >= 4) return;
    slotsWrap.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.innerHTML = `
        <div class="micCircle">🎤</div>
        <div class="name">فارغ</div>
      `;
      slotsWrap.appendChild(slot);
    }
  }
  function bindHandlers(){
    slotEls = slotsWrap.querySelectorAll(".slot");

    // فتح/قفل من زر 🎤
    micBtn.addEventListener("click", () => (state.open ? close() : open()));

    // التبديل: فقط الضغط على أيقونة المايك داخل الخانة
    slotsWrap.addEventListener("click", (e) => {
      const micIcon = e.target.closest(".micCircle");
      if (!micIcon) return; // تجاهل الضغط على غير الأيقونة
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
    console.log("[Stage] bound.");
  }
  function tryBind(tries = 30){
    if (getEls()) {
      ensureFourSlots();
      bindHandlers();
    } else if (tries > 0) {
      setTimeout(() => tryBind(tries - 1), 200);
    } else {
      console.warn("[Stage] elements not found (#stageOverlay / #slots / #micBtn).");
    }
  }

  function open(){ if (!overlay) return; overlay.style.display = "flex"; state.open = true; }
  function close(){
    if (!overlay) return;
    overlay.style.display = "none";
    state.open = false;
    // نزّلني إذا كنت فوق
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
    const idx  = Math.max(0, Math.min(3, i|0));
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

  onReady(() => tryBind()); // يربط حتى لو DOM جاهز قبل السكربت
  return { open, close, join, leave, applyUpdate };
})();
