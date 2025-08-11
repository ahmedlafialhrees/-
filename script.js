// script.js — client
const $ = s => document.querySelector(s);

// غيّر هذا الرابط لو بتفتح من GitHub Pages أو أي دومين خارجي:
const SERVER_FALLBACK = "https://YOUR-APP.onrender.com"; // ← حط رابط Render هنا
const USE_SAME_ORIGIN = location.hostname.endsWith("onrender.com") || location.hostname === "localhost";

let socket = null;
let me = { name: "", role: "member" };
let lastTyping = 0;
const typingHints = new Map();

const login = document.querySelector(".login");
const app = document.querySelector(".app");
const nameI = $("#name"), roleI = $("#role"), passI = $("#pass");
const joinB = $("#join"), msgs = $("#msgs"), text = $("#text"), sendB = $("#send");
const stage = $("#stage");

const room = new URLSearchParams(location.search).get("room") || "مجلس-١";

// رسم الاستيج (5 خانات أفقية)
function drawStage(data) {
  stage.innerHTML = "";
  (data || []).forEach((s, i) => {
    const el = document.createElement("button");
    el.className = "slot" + (s ? " on" : "");
    el.innerHTML = `<div class="ped"></div><div class="mic">🎤</div><div class="nm">${s ? s.name : ""}</div>`;
    el.onclick = () => socket.emit("stage:occupy", i);
    stage.appendChild(el);
  });
}

// إضافة رسالة
function addMsg(name, body) {
  const row = document.createElement("div");
  row.className = "msg";
  row.dataset.name = name;
  row.innerHTML = `<div class="meta">${name}</div><div>${body}</div>`;
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

// اتصال وانضمام
joinB.onclick = () => {
  const name = nameI.value.trim();
  const role = roleI.value;
  const pass = passI.value;

  socket = USE_SAME_ORIGIN ? io() : io(SERVER_FALLBACK, { transports: ["websocket", "polling"] });

  socket.on("join-denied", (m) => alert(m || "رفض الدخول"));
  socket.on("joined", (u) => { me = u; login.style.display = "none"; app.style.display = "block"; });
  socket.on("state", (st) => {
    msgs.innerHTML = "";
    (st.messages || []).forEach(m => addMsg(m.name, m.text));
    drawStage(st.stage);
  });
  socket.on("msg", (m) => addMsg(m.name, m.text));
  socket.on("stage", (st) => drawStage(st));
  socket.on("typing", ({ name }) => {
    // لمحة "…يكتب"
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

sendB.onclick = () => {
  const t = text.value.trim();
  if (!t) return;
  socket.emit("msg", t);
  text.value = "";
};

text.addEventListener("input", () => {
  const now = Date.now();
  if (!socket || now - lastTyping < 800) return;
  lastTyping = now;
  socket.emit("typing");
});
