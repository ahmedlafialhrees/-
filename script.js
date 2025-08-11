// script.js — client (مربوط على سيرفرك)
const $ = s => document.querySelector(s);

// ✅ رابط السيرفر على Render (مثل ما عطيتني)
const SERVER_FALLBACK = "https://kwpooop.onrender.com";

// لو كنت فاتح من نفس سيرفر Render ما تحتاج الرابط، غير كذا بنستخدم SERVER_FALLBACK
const USE_SAME_ORIGIN =
  location.hostname.endsWith("onrender.com") || location.hostname === "localhost";

let socket = null;
let me = { name: "", role: "member" };
let lastTyping = 0;
const typingHints = new Map();

const login = document.querySelector(".login");
const app = document.querySelector(".app");
const nameI = document.querySelector("#name");
const roleI = document.querySelector("#role");
const passI = document.querySelector("#pass");
const joinB = document.querySelector("#join");
const msgs  = document.querySelector("#msgs");
const text  = document.querySelector("#text");
const sendB = document.querySelector("#send");
const stage = document.querySelector("#stage");

// الغرفة (تقدر تغيّرها من الكويري ?room=اسم-الغرفة)
const room = new URLSearchParams(location.search).get("room") || "مجلس-١";

// ـــــــــــــــ UI مساعدات ـــــــــــــــ
function drawStage(data) {
  stage.innerHTML = "";
  (data || []).forEach((s, i) => {
    const el = document.createElement("button");
    el.className = "slot" + (s ? " on" : "");
    el.innerHTML = `
      <div class="ped"></div>
      <div class="mic">🎤</div>
      <div class="nm">${s ? s.name : ""}</div>`;
    // اضغط على الخانة: يصعد/ينزل
    el.onclick = () => socket.emit("stage:occupy", i);
    stage.appendChild(el);
  });
}

function addMsg(name, body) {
  const row = document.createElement("div");
  row.className = "msg";
  row.dataset.name = name;
  row.innerHTML = `<div class="meta">${name}</div><div>${body}</div>`;
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

// ـــــــــــــــ اتصال وانضمام ـــــــــــــــ
joinB.onclick = () => {
  const name = (nameI.value || "").trim();
  const role = roleI.value;
  const pass = passI.value;

  // اتصال
  socket = USE_SAME_ORIGIN
    ? io()
    : io(SERVER_FALLBACK, { transports: ["websocket", "polling"] });

  socket.on("join-denied", (m) => alert(m || "رفض الدخول"));

  socket.on("joined", (u) => {
    me = u;
    login.style.display = "none";
    app.style.display = "block";
  });

  socket.on("state", (st) => {
    msgs.innerHTML = "";
    (st.messages || []).forEach(m => addMsg(m.name, m.text));
    drawStage(st.stage);
  });

  socket.on("msg",   (m)  => addMsg(m.name, m.text));
  socket.on("stage", (st) => drawStage(st));

  socket.on("typing", ({ name }) => {
    if (typingHints.get(name)) clearTimeout(typingHints.get(name));
    let hint = msgs.querySelector(`.msg.typing[data-name="${name}"]`);
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "msg typing";
      hint.dataset.name = name;
      hint.innerHTML = `<div class="meta">${name}</div><div>…يكتب</div>`;
      msgs.appendChild(hint);
    }
    msgs.scrollTop = msgs.scrollHeight;
    const t = setTimeout(() => { hint.remove(); typingHints.delete(name); }, 3000);
    typingHints.set(name, t);
  });

  socket.emit("join", { name, role, pass, room });
};

// إرسال رسالة
sendB.onclick = () => {
  const t = text.value.trim();
  if (!t) return;
  socket.emit("msg", t);
  text.value = "";
};

// إشارة "يكتب..."
text.addEventListener("input", () => {
  const now = Date.now();
  if (!socket || now - lastTyping < 800) return;
  lastTyping = now;
  socket.emit("typing");
});
