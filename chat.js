// chat.js
import { SERVER_URL, OWNER_NAME } from "./config.js";

// --- قراءة الهوية ---
const role = localStorage.getItem("role") || "user";
const name = (localStorage.getItem("name") || "").trim();
if (!name) {
  window.location.href = "index.html";
}
const isOwnerMain = role === "ownerMain" && name === OWNER_NAME;

// --- UI عناصر عامة ---
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const asLine = document.getElementById("asLine");

const exitBtn = document.getElementById("exitMenuBtn");
const exitDropdown = document.getElementById("exitDropdown");
const controlPanelLink = document.getElementById("controlPanelLink");
const logoutLink = document.getElementById("logoutLink");

const emojiBtn = document.getElementById("emojiBtn");
const emojiPanel = document.getElementById("emojiPanel");

const stageOverlay = document.getElementById("stageOverlay");
const toggleStageBtn = document.getElementById("toggleStageBtn");
const closeStageBtn = document.getElementById("closeStageBtn");
const slotsEl = document.getElementById("slots");

asLine.textContent = `ترسل كـ: ${name}`;

// --- إظهار رابط لوحة التحكم للأونر الرئيسي فقط ---
if (isOwnerMain) controlPanelLink.classList.remove("hidden");

// --- منيو الخروج ---
exitBtn.addEventListener("click", () => {
  exitDropdown.classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!exitBtn.contains(e.target) && !exitDropdown.contains(e.target)) {
    exitDropdown.classList.add("hidden");
  }
});
logoutLink.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.clear();
  window.location.href = "index.html";
});

// --- إيموجي ---
emojiBtn.addEventListener("click", () => {
  emojiPanel.classList.toggle("hidden");
});
emojiPanel.addEventListener("click", (e) => {
  const el = e.target.closest(".emoji");
  if (!el) return;
  inputEl.value += el.textContent;
  inputEl.focus();
});
document.addEventListener("click", (e) => {
  if (!emojiBtn.contains(e.target) && !emojiPanel.contains(e.target)) {
    emojiPanel.classList.add("hidden");
  }
});

// --- اتصال Socket.IO ---
const socket = io(SERVER_URL, { transports: ["websocket"] });

// إرسال هوية عند الاتصال
socket.on("connect", () => {
  socket.emit("join", { name, role });
});

// استقبال رسائل
socket.on("message", (payload) => {
  addMessage(payload, payload.name === name);
});

// تحديث الاستيج
socket.on("stage:update", (stage) => {
  renderStage(stage);
});

// حالات طرد/حظر
socket.on("kicked", (reason) => {
  alert(`تم طردك: ${reason || "بدون سبب"}`);
  localStorage.clear();
  window.location.href = "index.html";
});
socket.on("banned", (untilTs) => {
  const d = new Date(untilTs);
  alert(`تم حظرك مؤقتاً حتى: ${d.toLocaleString()}`);
  localStorage.clear();
  window.location.href = "index.html";
});

// --- إرسال رسالة ---
function sendMessage() {
  const text = (inputEl.value || "").trim();
  if (!text) return;
  socket.emit("message", { text });
  inputEl.value = "";
}
sendBtn.addEventListener("click", sendMessage);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// --- عرض الرسائل ---
function addMessage({ name: n, text, ts }, mine=false) {
  const div = document.createElement("div");
  div.className = "msg" + (mine ? " me" : "");
  const when = ts ? new Date(ts) : new Date();
  div.innerHTML = `<div style="font-size:12px;color:#666;margin-bottom:4px">${n} • ${when.toLocaleTimeString()}</div>${escapeHtml(text)}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// --- الاستيج Overlay ---
let lastStage = { slots: [null,null,null,null] };

function renderStage(stage) {
  lastStage = stage || lastStage;
  slotsEl.innerHTML = "";
  lastStage.slots.forEach((slot, idx) => {
    const d = document.createElement("div");
    const isMe = slot && slot.name === name;
    d.className = "slot" + (isMe ? " me" : "");
    d.dataset.index = String(idx);
    d.innerHTML = slot ? (`🎤 ${slot.name}`) : "— فارغ —";
    d.title = isMe ? "اضغط للنزول" : "اضغط للصعود";
    d.addEventListener("click", () => {
      socket.emit("stage:toggle", { index: idx });
    });
    slotsEl.appendChild(d);
  });
}

toggleStageBtn.addEventListener("click", () => {
  stageOverlay.style.display = "flex";
  socket.emit("stage:request"); // اطلب آخر حالة
});
closeStageBtn.addEventListener("click", () => {
  // إذا كنت فوق، نزّلني تلقائياً
  const myIndex = (lastStage.slots || []).findIndex(x => x && x.name === name);
  if (myIndex !== -1) socket.emit("stage:toggle", { index: myIndex, forceDown:true });
  stageOverlay.style.display = "none";
});

// أول ما تفتح الصفحة اطلب حالة الاستيج
socket.emit("stage:request");
