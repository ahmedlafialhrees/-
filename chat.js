// اتصال Socket.IO باستخدام السيرفر المحدد في config.js
const socket = io(window.SERVER_URL, { transports: ['websocket'] });

// معلوماتي + حالة الاستيج
let me = null;
let stage = [null, null, null, null];
let meOnStage = false;

/* ======================== وظائف عامة ======================== */
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function addMsgBox(text) {
  const msgs = qs("#msgs");
  const box = document.createElement("div");
  box.className = "msg";
  box.textContent = text;
  msgs.appendChild(box);
  msgs.scrollTop = msgs.scrollHeight;
}
function addSystem(text) {
  const msgs = qs("#msgs");
  const box = document.createElement("div");
  box.className = "msg system";
  box.textContent = text;
  msgs.appendChild(box);
  msgs.scrollTop = msgs.scrollHeight;
}

/* ======================== تحكم أعلى الصفحة ======================== */
// خروج ← يرجع لواجهة الدخول
qs("#exitBtn").onclick = () => location.href = "index.html";

// زر المايك (أقصى اليمين) لفتح/قفل الاستيج
const stagePanel = qs("#stagePanel");
const stageFab   = qs("#stageFab");
stageFab.addEventListener("click", () => {
  const closing = !stagePanel.classList.contains("closed");
  // لو أنا فوق الاستيج وراح أسكّر اللوحة، نزّلني
  if (closing && meOnStage) socket.emit("stage:toggle");
  stagePanel.classList.toggle("closed");
});

/* ======================== دخول الشات ======================== */
(function initAuth(){
  const name = sessionStorage.getItem("loginName") || "";
  const adminPass = sessionStorage.getItem("adminPass") || "";
  const ownerPass = sessionStorage.getItem("ownerPass") || "";
  if (!name) { alert("ادخل اسمك أول"); location.href = "index.html"; return; }
  socket.emit("auth:login", { name, adminPass, ownerPass });
})();

socket.on("auth:ok", ({ me: my }) => {
  me = my;

  // اسم المرسل فوق خانة الكتابة
  const composerName = qs("#composerName");
  if (composerName) composerName.textContent = `ترسل كـ: ${me.name}`;

  // إظهار "لوحة التحكم" فقط للأونر الرئيسي
  const op = qs("#ownerPanel");
  if (op) {
    const isOwner = me.role === "owner";
    const isMainOwner = isOwner && (!window.MAIN_OWNER_NAME || me.name === window.MAIN_OWNER_NAME);
    op.style.display = isMainOwner ? "inline-flex" : "none";
  }
});

socket.on("auth:error", (m) => {
  alert(m || "خطأ في الدخول");
  location.href = "index.html";
});
socket.on("auth:kicked", (m) => {
  alert(m || "تم طردك");
  location.href = "index.html";
});

/* ======================== رسائل ======================== */
socket.on("chat:msg", (payload) => {
  const text = typeof payload === "string" ? payload : (payload?.text || "");
  if (text) addMsgBox(text);
});

// إرسال + عرض فوري
function sendNow() {
  const t = qs("#text");
  const v = (t.value || "").trim();
  if (!v) return;
  addMsgBox(v);              // عرض فوري في واجهتك
  socket.emit("chat:msg", v);
  t.value = "";
}
qs("#send").addEventListener("click", sendNow);
qs("#text").addEventListener("keydown", (e) => { if (e.key === "Enter") sendNow(); });

/* ======================== الاستيج ======================== */
// الصعود/النزول بالضغط على أي خانة من خانات الاستيج
qsa(".slot").forEach((el) => {
  el.addEventListener("click", () => {
    if (stagePanel.classList.contains("closed")) return; // مقفلة
    socket.emit("stage:toggle");
  });
});

socket.on("stage:update", (view) => {
  stage = view;
  meOnStage = !!stage.find((s) => s && me && s.id === me.id);
  qsa(".slot").forEach((el, idx) => el.classList.toggle("filled", !!stage[idx]));
});

/* ======================== حالة الاتصال ======================== */
socket.on("connect_error", () => addSystem("⚠️ غير متصل بالسيرفر"));
socket.on("connect",       () => addSystem("✅ تم الاتصال بالسيرفر"));

/* ======================== إيموجي بسيط ======================== */
const emojiBtn   = qs("#emojiBtn");
const emojiPanel = qs("#emojiPanel");
const textInput  = qs("#text");

const emojis = "😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😇 🙃 🥲 😍 😘 😗 😚 😎 🤩 🥳 🤔 🤗 🤝 👍 👎 🙏 ❤️ 💙 💚 💛 💜 🖤 🤍 🔥 ✨ 💯 🎉 🎁".split(" ");

function buildEmojiPanel(){
  if (!emojiPanel) return;
  emojiPanel.innerHTML = "";
  emojis.forEach((e) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = e;
    b.onclick = () => { insertAtCaret(textInput, e); textInput.focus(); };
    emojiPanel.appendChild(b);
  });
}
function insertAtCaret(input, str){
  const start = input.selectionStart ?? input.value.length;
  const end   = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + str + input.value.slice(end);
  const pos = start + str.length;
  input.setSelectionRange(pos, pos);
}
buildEmojiPanel();

let emojiOpen = false;
if (emojiBtn) {
  emojiBtn.addEventListener("click", () => {
    emojiOpen = !emojiOpen;
    emojiPanel.style.display = emojiOpen ? "grid" : "none";
  });
  document.addEventListener("click", (e) => {
    if (emojiOpen && !e.target.closest("#emojiPanel") && !e.target.closest("#emojiBtn")) {
      emojiOpen = false; emojiPanel.style.display = "none";
    }
  });
}
