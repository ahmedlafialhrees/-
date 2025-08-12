// اتصال بالسيرفر
const socket = io(window.SERVER_URL, {transports:['websocket']});

let me = null;
let users = [];
let stage = [null,null,null,null];
let meOnStage = false;
let actionMenuOpenFor = null;

// خروج يرجّع للواجهة
document.getElementById("exitBtn").onclick = () => {
  location.href = "index.html";
};

// دخول تلقائي
(function(){
  const name = sessionStorage.getItem("loginName") || "";
  const adminPass = sessionStorage.getItem("adminPass") || "";
  const ownerPass = sessionStorage.getItem("ownerPass") || "";
  if (!name) { alert("ادخل اسمك أول"); location.href="index.html"; return; }
  socket.emit("auth:login", { name, adminPass, ownerPass });
})();

socket.on("auth:ok", ({me: my}) => {
  me = my;
  // لوحة التحكم للمالك الرئيسي فقط
  if (me.role === "owner" && (!window.MAIN_OWNER_NAME || me.name === window.MAIN_OWNER_NAME)) {
    document.getElementById("ownerPanel").style.display = "inline-flex";
  }
  addSystem(`مرحباً ${me.name} — دورك: ${me.role}`);
});
socket.on("auth:error", (m)=>{ alert(m||"خطأ في الدخول"); location.href="index.html"; });
socket.on("auth:kicked", (m)=>{ alert(m||"تم طردك"); location.href="index.html"; });

function roleChip(role){
  if (role === "owner") return `<span class="rolechip owner">اونر</span>`;
  if (role === "admin") return `<span class="rolechip admin">ادمن</span>`;
  return "";
}

function addSystem(t){
  const msgs = document.getElementById("msgs");
  const div = document.createElement("div");
  div.className = "msg system";
  div.textContent = t;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}
function addMsg({from, text}){
  const msgs = document.getElementById("msgs");
  const box = document.createElement("div");
  box.className = "msg";
  const fromEl = document.createElement("div");
  fromEl.className = "from";
  fromEl.innerHTML = `${from.name} ${roleChip(from.role)}`;
  const textEl = document.createElement("div");
  textEl.textContent = text;
  box.appendChild(fromEl); box.appendChild(textEl);
  msgs.appendChild(box);
  msgs.scrollTop = msgs.scrollHeight;
}
socket.on("chat:system", addSystem);
socket.on("chat:msg", addMsg);

// إرسال
document.getElementById("send").onclick = () => {
  const t = document.getElementById("text");
  const v = t.value.trim();
  if (!v) return;
  socket.emit("chat:msg", v);
  t.value = "";
};
document.getElementById("text").addEventListener("keydown",(e)=>{
  if(e.key==="Enter") document.getElementById("send").click();
});

// الاستيج: الضغط على أي خانة = صعود/نزول
document.querySelectorAll(".slot").forEach(el=>{
  el.addEventListener("click", ()=> {
    // لو الإستيج مخفي ما نسوي شيء
    if (document.getElementById("stagePanel").classList.contains("closed")) return;
    socket.emit("stage:toggle");
  });
});

// تحديث الاستيج
socket.on("stage:update", (view)=>{
  stage = view;
  meOnStage = !!stage.find(s => s && me && s.id === me.id);

  document.querySelectorAll(".slot").forEach((el,idx)=>{
    const s = stage[idx];
    const nameEl = el.querySelector(".name");
    const chipEl = el.querySelector(".rolechip");
    if (s) {
      el.classList.add("filled");
      nameEl.textContent = s.name;
      nameEl.style.display = "block";
      chipEl.style.display = "inline-flex";
      chipEl.textContent = s.role==="owner"?"اونر":(s.role==="admin"?"ادمن":"");
      chipEl.className = "rolechip " + (s.role==="owner"?"owner":(s.role==="admin"?"admin":""));
    } else {
      el.classList.remove("filled");
      nameEl.textContent = "";
      nameEl.style.display = "none";
      chipEl.style.display = "none";
    }
  });
});

// فتح/إغلاق نافذة الاستيج
const stagePanel = document.getElementById("stagePanel");
const stageToggleBtn = document.getElementById("stageToggleBtn");
stageToggleBtn.addEventListener("click", ()=>{
  const closing = !stagePanel.classList.contains("closed") && stagePanel.classList.contains("open");
  if (closing && meOnStage) {
    // لو كنت فوق وانغلقت، نزّلني
    socket.emit("stage:toggle");
  }
  stagePanel.classList.toggle("closed");
  stagePanel.classList.toggle("open");
  stageToggleBtn.textContent = stagePanel.classList.contains("closed") ? "إظهار" : "إخفاء";
});

// قائمة الأعضاء + المنيو
socket.on("users:list", (list)=>{
  users = list;
  const wrap = document.getElementById("users");
  wrap.innerHTML = "";
  list.forEach(u=>{
    const row = document.createElement("div");
    row.className = "user";
    row.dataset.uid = u.id;

    const l = document.createElement("div");
    l.innerHTML = `${u.name} ${roleChip(u.role)}`;

    const r = document.createElement("div");
    r.className = "r";
    const role = document.createElement("span");
    role.className = "role "+u.role;
    role.textContent = u.role==="owner"?"Owner":(u.role==="admin"?"Admin":"");
    r.appendChild(role);

    row.appendChild(l); row.appendChild(r);
    wrap.appendChild(row);

    row.addEventListener("click", ()=>{
      if (actionMenuOpenFor === u.id) hideActionMenu();
      else showActionMenuFor(u);
    });
  });
});

const am = document.getElementById("actionMenu");
function hideActionMenu(){ am.classList.remove("show"); actionMenuOpenFor = null; }
function showActionMenuFor(u){
  actionMenuOpenFor = u.id;
  document.getElementById("amTitle").textContent = "أوامر: " + u.name;
  const grid = document.getElementById("amBtns");
  grid.innerHTML = "";

  const isOwner = me?.role === "owner";
  const isAdmin = me?.role === "admin";
  const isSelf  = me?.id === u.id;

  if (isSelf || isAdmin || isOwner){
    grid.appendChild(btn("تغيير الاسم", ()=>{
      const newName = prompt("الاسم الجديد؟", u.name);
      if (!newName) return;
      act(u.id, "rename", {name:newName});
    }));
  }
  if (isOwner || isAdmin){
    grid.appendChild(btn("إنزال من الاستيج", ()=> act(u.id,"removeFromStage")));
    grid.appendChild(btn("طرد", ()=> act(u.id,"kick")));
    grid.appendChild(btn("طرد ساعتين", ()=> act(u.id,"tempban2h")));
  }
  if (isOwner){
    if (u.role !== "admin") grid.appendChild(btn("إعطاء أدمن", ()=> act(u.id,"grantAdmin")));
    if (u.role === "admin") grid.appendChild(btn("إزالة أدمن", ()=> act(u.id,"revokeAdmin")));
    if (u.role !== "owner") grid.appendChild(btn("إعطاء أونر", ()=> act(u.id,"grantOwner")));
    if (u.role === "owner") grid.appendChild(btn("إزالة أونر", ()=> act(u.id,"revokeOwner")));
  }

  am.classList.add("show");
}
function btn(text, onClick){
  const b = document.createElement("button");
  b.textContent = text;
  b.onclick = ()=>{ onClick(); hideActionMenu(); };
  return b;
}
function act(targetId, action, payload){
  socket.emit("user:action", { targetId, action, payload });
}
document.addEventListener("click", (e)=>{
  if (actionMenuOpenFor && !e.target.closest(".action-menu") && !e.target.closest(".user")) hideActionMenu();
});
