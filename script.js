// ========== إعدادات اتصال ==========
const SERVER_FALLBACK = "https://kwpooop.onrender.com"; // دومين Render حقك

function getServerURL() {
  // لو أنت على نفس الدومين (Render) نستخدم "/"
  const sameOrigin =
    location.hostname.endsWith("onrender.com") ||
    location.hostname === "localhost";
  return sameOrigin ? "/" : SERVER_FALLBACK;
}

let socket = null;
let me = { name: "", role: "member" };

// ========== عناصر الواجهة ==========
const $ = (s) => document.querySelector(s);

const login = $(".login") || $("#login");
const app   = $(".app")   || $("#app");

const nameI = $("#name");
const roleI = $("#role");
const passI = $("#pass");

const joinB = $("#join");
const msgs  = $("#msgs") || $(".messages") || document.body;
const text  = $("#text") || $('input[placeholder*="اكتب"]');
const sendB = $("#send");
const stage = $("#stage");

// ========== أدوات عرض ==========
function addLine(html) {
  const box = msgs || document.body;
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = html;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function renderIncoming(m) {
  const who = m.user || "ضيف";
  const t = new Date(m.ts || Date.now()).toLocaleTimeString();
  addLine(`<b>${who}</b> • ${t}<br>${m.text}`);
}

function renderMine(txt) {
  addLine(`<b>أنا</b> • الآن<br>${txt}`);
}

// ========== اتصال Socket.io ==========
function connectSocket() {
  if (socket && socket.connected) return socket;

  socket = io(getServerURL(), {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    withCredentials: false
  });

  socket.on("connect", () => {
    console.log("🟢 connected", socket.id);
    login?.classList?.add?.("hidden");
    app?.classList?.remove?.("hidden");
  });

  socket.on("disconnect", () => {
    console.log("🔴 disconnected");
  });

  // السيرفر يبث بهذا الحدث
  socket.on("chat:new", (m) => {
    renderIncoming(m);
  });

  // اختياري: رسائل نظام
  socket.on("system", (t) => addLine(`🛈 ${t}`));

  return socket;
}

// ========== تصرفات الدخول والإرسال ==========
joinB?.addEventListener("click", (e) => {
  e.preventDefault();
  me.name = (nameI?.value || "ضيف").trim() || "ضيف";
  connectSocket();
  addLine(`✅ دخلت باسم <b>${me.name}</b>`);
});

sendB?.addEventListener("click", (e) => {
  e.preventDefault();
  const txt = (text?.value || "").trim();
  if (!txt) return;
  connectSocket();
  socket.emit("chat:send", { text: txt, user: me.name || "ضيف" }); // <-- مهم: chat:send
  renderMine(txt);
  text.value = "";
  text.focus();
});

// احتياط: إرسال بالفورم إن وجد
document.querySelector("form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  sendB?.click();
});

// لو ما عندك شاشة دخول، اتصل تلقائي
window.addEventListener("load", () => {
  if (!joinB) {
    me.name = (nameI?.value || "ضيف").trim() || "ضيف";
    connectSocket();
  }
});
