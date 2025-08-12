// اتصال Socket.IO باستخدام السيرفر المحدد في config.js
const socket = io(window.SERVER_URL, { transports: ['websocket'] });

// الحالة العامة
let me = null;
let stage = [null, null, null, null];
let meOnStage = false;

// مساعدين
const qs  = (s, r=document) => r.querySelector(s);
const qsa = (s, r=document) => [...r.querySelectorAll(s)];

/* ======================== توب بار ======================== */
// خروج ← يرجع لواجهة الدخول
qs("#exitBtn").onclick = () => location.href = "index.html";

// زر المايك (أقصى اليمين) لفتح/قفل الاستيج
const stagePanel = qs("#stagePanel");
const stageFab   = qs("#stageFab");
stageFab.addEventListener("click", () => {
  const closing = !stagePanel.classList.contains("closed");
  // لو كنت فوق الاستيج وراح أسكّر اللوحة، نزّلني
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

// بعد التحقق
socket.on("auth:ok", ({ me: my }) => {
  me = my;

  // اسم المرسِل فوق خانة الكتابة
  const comp = qs("#composerName");
  if (comp) comp.textContent = `ترسل كـ: ${me.name}`;

  // ✅ لوحة التحكم: للأونر الرئيسي فقط (اسم الدخول يطابق MAIN_OWNER_NAME)
  const op = qs("#ownerPanel");
  if (op) {
    const isOwner = me.role === "owner";
    const loginName  = (me.name || "").trim();
    const mainOwner  = (window.MAIN_OWNER_NAME || "").trim(); // من config.js
    const isMainOwner = isOwner && !!mainOwner && loginName === mainOwner;

    // نُظهرها بالنص للأونر الرئيسي فقط
    op.style.display       = "inline-flex";     // دايمًا محجوزة بالنص
    op.style.visibility    = isMainOwner ? "visible" : "hidden";
    op.style.pointerEvents = isMainOwner ? "auto" : "none";

    // Debug للمطور: افحص المطابقة بالكونسول
    console.debug("[ownerPanel]", { role: me.role, loginName, mainOwner, isMainOwner });
  }
});

socket.on("auth:error", (m)=>{ alert(m||"خطأ في الدخول"); location.href="index.html"; });
socket.on("auth:kicked", (m)=>{ alert(m||"تم طردك"); location.href="index.html"; });

/* ======================== الرسائل ======================== */
function addMsgBox(text){
  const msgs = qs("#msgs");
  const box = document.createElement("div");
  box.className = "msg";
  box.textContent = text;
  msgs.appendChild(box);
  msgs.scrollTop = msgs.scrollHeight;
}
function addSystem(t){
  const msgs = qs("#msgs");
  const box = document.createElement("div");
  box.className = "msg system";
  box.textContent = t;
  msgs.appendChild(box);
  msgs.scrollTop = msgs.scrollHeight;
}

// استقبال
socket.on("chat:msg", (payload)=>{
  const text = typeof payload === "string" ? payload : (payload?.text || "");
  if (text) addMsgBox(text);
});

// إرسال + عرض فوري
function sendNow(){
  const t = qs("#text");
  const v = (t.value||"").trim();
  if(!v) return;
  addMsgBox(v);              // عرض فوري
  socket.emit("chat:msg", v);
  t.value = "";
}
qs("#send").addEventListener("click", sendNow);
qs("#text").addEventListener("keydown", e=>{ if(e.key==="Enter") sendNow(); });

/* ======================== الاستيج ======================== */
// الصعود/النزول بالضغط على أي خانة (إذا اللوحة مفتوحة)
qsa(".slot").forEach(el=>{
  el.addEventListener("click", ()=>{
    if (stagePanel.classList.contains("closed")) return;
    socket.emit("stage:toggle");
  });
});
socket.on("stage:update", (view)=>{
  stage = view;
  meOnStage = !!stage.find(s => s && me && s.id === me.id);
  qsa(".slot").forEach((el,idx)=> el.classList.toggle("filled", !!stage[idx]));
});

/* ======================== حالة الاتصال ======================== */
socket.on("connect_error", ()=> addSystem("⚠️ غير متصل بالسيرفر"));
socket.on("connect",      ()=> addSystem("✅ تم الاتصال بالسيرفر"));

/* ======================== إيموجي بسيط ======================== */
const emojiBtn   = qs("#emojiBtn");
const emojiPanel = qs("#emojiPanel");
const textInput  = qs("#text");
const emojis = "😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😇 🙃 🥲 😍 😘 😗 😚 😎 🤩 🥳 🤔 🤗 🤝 👍 👎 🙏 ❤️ 💙 💚 💛 💜 🖤 🤍 🔥 ✨ 💯 🎉 🎁".split(" ");

function buildEmojiPanel(){
  if (!emojiPanel) return;
  emojiPanel.innerHTML = "";
  emojis.forEach(e=>{
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = e;
    b.onclick = ()=> { insertAtCaret(textInput, e); textInput.focus(); };
    emojiPanel.appendChild(b);
  });
}
function insertAtCaret(input, str){
  const start = input.selectionStart ?? input.value.length;
  const end   = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0,start) + str + input.value.slice(end);
  const pos = start + str.length;
  input.setSelectionRange(pos, pos);
}
buildEmojiPanel();

let emojiOpen = false;
emojiBtn?.addEventListener("click", ()=>{
  emojiOpen = !emojiOpen;
  if (emojiPanel) emojiPanel.style.display = emojiOpen ? "grid" : "none";
});
document.addEventListener("click", (e)=>{
  if (emojiOpen && !e.target.closest("#emojiPanel") && !e.target.closest("#emojiBtn")){
    emojiOpen = false; if (emojiPanel) emojiPanel.style.display = "none";
  }
});
