// اتصال
const socket = io("/", { path: "/socket.io", transports: ["websocket","polling"] });

// عناصر عامة
const statusEl = document.getElementById("status");
const vLogin = document.getElementById("view-login");
const vRooms = document.getElementById("view-rooms");
const vChat  = document.getElementById("view-chat");

// عناصر الدخول
const nameI = document.getElementById("name");
const roleI = document.getElementById("role");
const passI = document.getElementById("pass");
const goLogin = document.getElementById("go-login");

// عناصر الرومات
const roomsBox = document.getElementById("rooms");
const ownerTools = document.getElementById("owner-tools");
const newRoomI = document.getElementById("newRoom");
const addRoomB = document.getElementById("addRoom");
const backToLogin = document.getElementById("backToLogin");

// عناصر الشات
const roomTitle = document.getElementById("roomTitle");
const usersBox  = document.getElementById("users");
const msgs      = document.getElementById("msgs");
const typingBar = document.getElementById("typing");
const text      = document.getElementById("text");
const sendB     = document.getElementById("send");
const leaveB    = document.getElementById("leave");

// حالة
let me = { name:"", role:"member", pass:"" };
let currentRoom = null;

// helpers
const show = (v)=>[vLogin,vRooms,vChat].forEach(x=>x.classList.toggle("hidden",x!==v));
const addMsg = (html, cls="") => {
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.innerHTML = html;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
};
const renderUsers = (list=[])=>{
  usersBox.innerHTML = "";
  list.forEach(u=>{
    const p = document.createElement("div");
    p.className = "pill";
    p.textContent = `${u.name} • ${u.role}`;
    usersBox.appendChild(p);
  });
};

// حالة الاتصال
socket.on("connect", ()=> statusEl.textContent = "🟢 متصل");
socket.on("disconnect", ()=> statusEl.textContent = "🔴 غير متصل");

// ــــــــــــــــــــــ 1) دخول → الرومات ــــــــــــــــــــــ
goLogin.addEventListener("click", ()=>{
  me = {
    name: (nameI.value||"").trim() || "ضيف",
    role: roleI.value,
    pass: (passI.value||"").trim()
  };
  ownerTools.classList.toggle("hidden", me.role !== "owner");
  socket.emit("rooms:list", renderRooms);
  show(vRooms);
});

function renderRooms(list){
  roomsBox.innerHTML = "";
  list.forEach(r=>{
    const btn = document.createElement("button");
    btn.className = "room-btn";
    btn.textContent = r;
    btn.onclick = ()=> joinRoom(r);
    roomsBox.appendChild(btn);
  });
}
socket.on("rooms:update", renderRooms);

addRoomB.addEventListener("click", ()=>{
  const r = (newRoomI.value||"").trim();
  if(!r) return;
  socket.emit("rooms:add", { room:r, pass: me.pass }, (res)=>{
    if(!res?.ok) alert(res?.error || "ما تمّت الإضافة");
    else newRoomI.value = "";
  });
});

backToLogin.addEventListener("click", ()=> show(vLogin));

// ــــــــــــــــــــــ 2) الانضمام للروم ــــــــــــــــــــــ
function joinRoom(roomName){
  socket.emit("join", { ...me, room: roomName }, (res)=>{
    if(res?.ok){
      currentRoom = roomName;
      roomTitle.textContent = `الروم: ${roomName} — أنا: ${res.me.name} (${res.me.role})`;
      msgs.innerHTML = "";
      (res.messages||[]).forEach(m=> addMsg(`<b>${m.name}</b>: ${m.text}`, m.name==="النظام"?"sys":""));
      renderUsers(res.users);
      show(vChat);
    }
  });
}
socket.on("join-denied",(t)=> alert(t));
socket.on("joined",(info)=>{
  currentRoom = info.room;
  roomTitle.textContent = `الروم: ${info.room} — أنا: ${info.me.name} (${info.me.role})`;
  msgs.innerHTML = "";
  (info.messages||[]).forEach(m=> addMsg(`<b>${m.name}</b>: ${m.text}`, m.name==="النظام"?"sys":""));
  show(vChat);
});

// تحديث قائمة المستخدمين
socket.on("users", renderUsers);

// ــــــــــــــــــــــ 3) الشات داخل الروم ــــــــــــــــــــــ
sendB.addEventListener("click", ()=>{
  const t = (text.value||"").trim();
  if(!t) return;
  socket.emit("msg", t);
  addMsg(`<b>أنا</b>: ${t}`, "me");
  text.value = ""; text.focus();
});
text.addEventListener("keydown", (e)=>{
  if(e.key === "Enter"){ e.preventDefault(); sendB.click(); }
});

socket.on("msg", ({name, text})=>{
  addMsg(`<b>${name}</b>: ${text}`, name==="النظام"?"sys":"");
});

// typing
text.addEventListener("input", ()=>{
  socket.emit("typing", true);
  clearTimeout(window.__tt);
  window.__tt = setTimeout(()=> socket.emit("typing", false), 700);
});
socket.on("typing", ({name, typing})=>{
  typingBar.textContent = typing ? `${name} قاعد يكتب…` : "";
});

// خروج
leaveB.addEventListener("click", ()=> location.reload());
