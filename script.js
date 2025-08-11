// اتصال
const socket = io("/", { path: "/socket.io", transports: ["websocket","polling"] });

// عناصر
const vLogin = document.getElementById("view-login");
const vRooms = document.getElementById("view-rooms");
const vChat  = document.getElementById("view-chat");

const nameI = document.getElementById("name");
const roleI = document.getElementById("role");
const passI = document.getElementById("pass");
const goLogin = document.getElementById("go-login");

const roomsBox = document.getElementById("rooms");
const ownerTools = document.getElementById("owner-tools");
const newRoomI = document.getElementById("newRoom");
const addRoomB = document.getElementById("addRoom");
const backToLogin = document.getElementById("backToLogin");

const roomTitle = document.getElementById("roomTitle");
const msgs = document.getElementById("msgs");
const typingBar = document.getElementById("typing");
const text = document.getElementById("text");
const sendB = document.getElementById("send");
const leaveB = document.getElementById("leave");

// حالة
let me = { name: "", role: "member", pass: "" };
let currentRoom = null;

function show(view){
  [vLogin, vRooms, vChat].forEach(v => v.classList.add("hidden"));
  view.classList.remove("hidden");
}
function addMsg(html, klass=""){
  const d = document.createElement("div");
  if (klass) d.className = klass;
  d.innerHTML = html;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

/* 1) بعد إدخال الاسم/الدور ننتقل لشاشة الرومات */
goLogin.addEventListener("click", () => {
  me = {
    name: (nameI.value || "").trim() || "ضيف",
    role: roleI.value,
    pass: passI.value.trim()
  };
  // إظهار أدوات الأونر
  ownerTools.classList.toggle("hidden", me.role !== "owner");
  // طلب قائمة الغرف
  socket.emit("rooms:list", (list) => renderRooms(list));
  show(vRooms);
});

function renderRooms(list){
  roomsBox.innerHTML = "";
  list.forEach(r => {
    const btn = document.createElement("button");
    btn.textContent = r;
    btn.onclick = () => joinRoom(r);
    roomsBox.appendChild(btn);
  });
}
socket.on("rooms:update", renderRooms);

addRoomB.addEventListener("click", () => {
  const r = (newRoomI.value || "").trim();
  if (!r) return;
  socket.emit("rooms:add", { room: r, pass: me.pass }, (res) => {
    if (!res?.ok) alert(res?.error || "ما تمّت الإضافة");
    else newRoomI.value = "";
  });
});

backToLogin.addEventListener("click", ()=> show(vLogin));

/* 2) الدخول للروم المحدد */
function joinRoom(roomName){
  socket.emit("join", { ...me, room: roomName }, (res) => {
    if (res?.ok) {
      currentRoom = roomName;
      roomTitle.textContent = `الروم: ${roomName} — أنا: ${res.me.name} (${res.me.role})`;
      msgs.innerHTML = "";
      res.messages.forEach(m => addMsg(`<b>${m.name}</b>: ${m.text}${m.name==="النظام"?"":" "}`, m.name==="النظام"?"sys":""));
      show(vChat);
    }
  });
}
socket.on("join-denied", (t)=> alert(t));
socket.on("joined", (info)=> {
  // إذا جاية بدون ack
  currentRoom = info.room;
  roomTitle.textContent = `الروم: ${info.room} — أنا: ${info.me.name} (${info.me.role})`;
  msgs.innerHTML = "";
  (info.messages||[]).forEach(m => addMsg(`<b>${m.name}</b>: ${m.text}`, m.name==="النظام"?"sys":""));
  show(vChat);
});

/* 3) مراسلة داخل الروم */
sendB.addEventListener("click", () => {
  const t = (text.value || "").trim();
  if (!t) return;
  socket.emit("msg", t);
  addMsg(`<b>أنا</b>: ${t}`);
  text.value = "";
  text.focus();
});
socket.on("msg", ({name, text}) => {
  addMsg(`<b>${name}</b>: ${text}`, name==="النظام"?"sys":"");
});

/* مؤشر كتابة */
text.addEventListener("input", () => {
  socket.emit("typing", true);
  clearTimeout(window.__tt);
  window.__tt = setTimeout(()=> socket.emit("typing", false), 800);
});
socket.on("typing", ({name, typing}) => {
  typingBar.textContent = typing ? `${name} قاعد يكتب…` : "";
});

/* خروج من الروم */
leaveB.addEventListener("click", () => {
  // أبسط شكل: ري فريش يرجّعك لشاشة الرومات
  location.reload();
});
