/* ========= إعداد الاتصال =========
   إذا أنت فاتح من Render نفسه خله "/"
   وإذا فاتح من GitHub Pages غيّر SERVER_URL إلى رابط سيرفرك على Render
*/
const SERVER_URL = "https://kwpooop-ycxq.onrender.com"; // عدّله إذا لزم
const sameOrigin = location.hostname.endsWith("onrender.com") || location.hostname === "localhost";
const ioURL = sameOrigin ? "/" : SERVER_URL;

const socket = io(ioURL, {
  path: "/socket.io",
  transports: ["websocket","polling"],
  withCredentials: false
});

/* ========= عناصر الواجهة ========= */
const viewLogin = document.getElementById("view-login");
const viewRooms = document.getElementById("view-rooms");
const viewChat  = document.getElementById("view-chat");

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
const usersBox  = document.getElementById("users");
const msgs      = document.getElementById("msgs");
const typingBar = document.getElementById("typing");
const text      = document.getElementById("text");
const sendB     = document.getElementById("send");
const leaveB    = document.getElementById("leave");

let me = { name:"", role:"member", pass:"" };
let currentRoom = null;

/* ========= Helpers ========= */
const show = (v)=>[viewLogin,viewRooms,viewChat].forEach(x=>x.classList.toggle("hidden",x!==v));
const addMsg = (html, cls="")=>{
  const d = document.createElement("div");
  d.className = "msg " + cls;
  d.innerHTML = html;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
};
const renderUsers = (list=[])=>{
  usersBox.innerHTML = "";
  list.forEach(u=>{
    const p = document.createElement("span");
    p.className = "pill";
    p.textContent = `${u.name} • ${u.role}`;
    usersBox.appendChild(p);
  });
};

/* ========= اتصال ========= */
socket.on("connect", ()=> console.log("connected:", socket.id));
socket.on("disconnect", ()=> console.log("disconnected"));

/* ========= 1) دخول → صفحة الرومات ========= */
goLogin.addEventListener("click", ()=>{
  me = {
    name: (nameI.value||"").trim() || "ضيف",
    role: roleI.value,
    pass: (passI.value||"").trim()
  };
  ownerTools.classList.toggle("hidden", me.role !== "owner");
  socket.emit("rooms:list", renderRooms);
  show(viewRooms);
});

function renderRooms(list){
  roomsBox.innerHTML = "";
  list.forEach(r=>{
    const b = document.createElement("button");
    b.className = "room-card";
    b.textContent = r;
    b.onclick = ()=> joinRoom(r);
    roomsBox.appendChild(b);
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

backToLogin.addEventListener("click", ()=> show(viewLogin));

/* ========= 2) الانضمام للروم ========= */
function joinRoom(room){
  socket.emit("join", { ...me, room }, (res)=>{
    if(res?.ok){
      currentRoom = room;
      roomTitle.textContent = `الروم: ${room} — أنا: ${res.me.name} (${res.me.role})`;
      msgs.innerHTML = "";
      (res.messages||[]).forEach(m=> addMsg(`<b>${m.name}</b>: ${m.text}`, m.name==="النظام"?"sys":""));
      renderUsers(res.users);
      show(viewChat);
    }
  });
}
socket.on("join-denied",(t)=> alert(t));
socket.on("joined",(info)=>{
  currentRoom = info.room;
  roomTitle.textContent = `الروم: ${info.room} — أنا: ${info.me.name} (${info.me.role})`;
  msgs.innerHTML = "";
  (info.messages||[]).forEach(m=> addMsg(`<b>${m.name}</b>: ${m.text}`, m.name==="النظام"?"sys":""));
  show(viewChat);
});
socket.on("users", renderUsers);

/* ========= 3) الشات داخل الروم ========= */
sendB.addEventListener("click", ()=>{
  const t = (text.value||"").trim();
  if(!t) return;
  socket.emit("msg", t);
  addMsg(`<b>أنا</b>: ${t}`,"me");
  text.value=""; text.focus();
});
text.addEventListener("keydown",(e)=>{ if(e.key==="Enter"){ e.preventDefault(); sendB.click(); } });

socket.on("msg", ({name, text})=>{
  addMsg(`<b>${name}</b>: ${text}`, name==="النظام"?"sys":"");
});

/* مؤشر "قاعد يكتب…" */
text.addEventListener("input", ()=>{
  socket.emit("typing", true);
  clearTimeout(window.__tt);
  window.__tt = setTimeout(()=> socket.emit("typing", false), 700);
});
socket.on("typing", ({name, typing})=>{
  typingBar.textContent = typing ? `${name} قاعد يكتب…` : "";
});

/* خروج */
leaveB.addEventListener("click", ()=> location.reload());
