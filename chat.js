/* chat.js — واجهة شات صوتي مع الاستيج، الأوامر، وتعديلات الاسم */
const SERVER_URL = (window.SERVER_URL || "https://kwpooop.onrender.com");
const OWNER_PASS = (window.OWNER_PASS || "6677") + "";

/* ====== هوية المستخدم والروم ====== */
const savedId = localStorage.getItem("myId");
window.myId = savedId || ("u" + Math.random().toString(36).slice(2, 10));
if (!savedId) localStorage.setItem("myId", window.myId);
const qp = new URLSearchParams(location.search);
window.roomId = qp.get("room") || "lobby";

/* ====== عناصر ====== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => root.querySelectorAll(sel);

const messages = $("#messages");
const msgInput = $("#msgInput");
const sendBtn = $("#sendBtn");
const asLine = $("#asLine");
const emojiBtn = $("#emojiBtn");
const emojiPanel = $("#emojiPanel");
const openBtn = $("#openBtn");
const menuOwner = $("#menuOwner");
const menuExit = $("#menuExit");
const micBtn = $("#micBtn");
const stageOverlay = $("#stageOverlay");
const stageSlots = $$("#slots .slot");

/* ====== حالة الاستيج ====== */
let stage = { open: false, slots: [null, null, null, null], meOnStageIndex: null };

/* ====== Socket.IO ====== */
const ioClient = io(SERVER_URL, { transports: ["websocket"] });

function currentName() {
  return localStorage.getItem("myName") || "عضو";
}

function getRole() {
  return localStorage.getItem("myRole") || "member";
}

function updateAsLine() {
  asLine.textContent = `ترسل كـ: ${currentName()}`;
}

/* ====== تعديل الاسم ====== */
function renameSelfFlow() {
  const cur = currentName();
  const n = prompt("اكتب اسمك:", cur || "");
  if (n === null) return;
  const name = (n || "").trim().slice(0, 24);
  if (!name) return;

  localStorage.setItem("myName", name);
  updateAsLine();

  if (stage.meOnStageIndex !== null) {
    stage.slots[stage.meOnStageIndex].name = name;
    renderStage();
  }

  if (window.roomId && window.myId && ioClient) {
    ioClient.emit("room:rename", { room: window.roomId, id: window.myId, name });
  }
}

/* ====== رسائل ====== */
function addMessage({ text, me, meta }) {
  const msgEl = document.createElement("div");
  msgEl.className = "msg" + (me ? " me" : "");
  msgEl.textContent = text;

  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "meta";
    metaEl.textContent = meta;
    msgEl.appendChild(metaEl);
  }

  messages.appendChild(msgEl);
  messages.scrollTop = messages.scrollHeight;
}

/* ====== الاستيج ====== */
function renderStage() {
  stageSlots.forEach((slotEl, i) => {
    const data = stage.slots[i];
    const micCircle = slotEl.querySelector(".micCircle");
    const nameEl = slotEl.querySelector(".name");

    if (data) {
      nameEl.textContent = data.name || "—";
      if (data.id === window.myId) {
        slotEl.classList.add("active");
        stage.meOnStageIndex = i;
      } else {
        slotEl.classList.remove("active");
      }
    } else {
      nameEl.textContent = "فارغ";
      slotEl.classList.remove("active");
    }
  });
}

function toggleStage(open) {
  stage.open = open !== undefined ? open : !stage.open;
  stageOverlay.style.display = stage.open ? "flex" : "none";
  micBtn.setAttribute("aria-expanded", stage.open);
  if (!stage.open && stage.meOnStageIndex !== null) {
    ioClient.emit("stage:leave", { room: window.roomId });
    stage.meOnStageIndex = null;
  }
}

/* ====== أحداث DOM ====== */
document.addEventListener("DOMContentLoaded", () => {
  updateAsLine();

  asLine.addEventListener("click", renameSelfFlow);

  sendBtn.addEventListener("click", () => {
    const text = msgInput.value.trim();
    if (!text) return;
    ioClient.emit("chat:msg", { room: window.roomId, text });
    msgInput.value = "";
  });

  emojiBtn.addEventListener("click", () => {
    emojiPanel.classList.toggle("show");
  });

  emojiPanel.addEventListener("click", (e) => {
    if (e.target.classList.contains("emoji")) {
      msgInput.value += e.target.textContent;
      msgInput.focus();
    }
  });

  openBtn.addEventListener("click", () => {
    $("#openMenu").classList.toggle("show");
  });

  menuExit.addEventListener("click", () => {
    location.href = "index.html";
  });

  micBtn.addEventListener("click", () => {
    toggleStage();
  });

  stageSlots.forEach((slotEl, i) => {
    slotEl.addEventListener("click", () => {
      if (stage.meOnStageIndex === i) {
        ioClient.emit("stage:leave", { room: window.roomId });
        stage.meOnStageIndex = null;
      } else {
        ioClient.emit("stage:join", { room: window.roomId, index: i, name: currentName() });
      }
    });
  });

  // إظهار لوحة التحكم للأونر فقط
  if (getRole() === "owner") {
    menuOwner.style.display = "";
  } else {
    menuOwner.style.display = "none";
  }
});

/* ====== Socket Events ====== */
ioClient.on("connect", () => {
  ioClient.emit("room:join", { room: window.roomId, id: window.myId, name: currentName() });
});

ioClient.on("chat:msg", (msg) => {
  addMessage({ text: msg.text, me: msg.id === window.myId, meta: msg.meta });
});

ioClient.on("sys:notice", (text) => {
  addMessage({ text, meta: "النظام" });
});

ioClient.on("stage:update", (data) => {
  stage.slots = data.slots;
  renderStage();
});
