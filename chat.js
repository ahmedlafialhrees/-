const socket = io();
let me = null;
let users = [];
let stage = [null,null,null,null];
let actionMenuOpenFor = null;

// دخول تلقائي من sessionStorage
(function(){
  const name = sessionStorage.getItem("loginName") || "";
  const adminPass = sessionStorage.getItem("adminPass") || "";
  const ownerPass = sessionStorage.getItem("ownerPass") || "";
  if (!name) { alert("ادخل اسمك أول"); location.href="/"; return; }
  socket.emit("auth:login", { name, adminPass, ownerPass });
})();

socket.on("auth:ok", ({me: my}) => {
  me = my;
  if (me.role === "owner") document.getElementById("ownerPanel").style.display = "inline-flex";
  addSystem(`مرحباً ${me.name} — دورك: ${me.role}`);
});
socket.on("auth:error", (m)=>{ alert(m||"خطأ في الدخول"); location.href="/"; });
socket.on("auth:kicked", (m)=>{ alert(m||"تم طردك"); location.href="/"; });

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

// الاستيج
document.getElementById("toggleStage").onclick = ()=> socket.emit("stage:toggle");
document.querySelectorAll(".slot").forEach(el=>{
  el.addEventListener("click", ()=> socket.emit("stage:toggle"));
});
socket.on("stage:update", (view)=>{
  stage = view;
  document.querySelectorAll(".slot").forEach((el,idx)=>{
    const s = stage[idx];
    const nameEl = el.querySelector(".name");
    const pinEl  = el.querySelector(".pin");
    const chipEl = el.querySelector(".rolechip");
    if (s) {
      el.classList.add("filled");
      nameEl.textContent = s.name;
      pinEl.style.display = "none";
      chipEl.style.display = "inline-flex";
      chipEl.textContent = s.role==="owner"?"اونر":(s.role==="admin"?"ادمن":"");
      chipEl.className = "rolechip " + (s.role==="owner"?"owner":(s.role==="admin"?"admin":""));
    } else {
      el.classList.remove("filled");
      nameEl.textContent = "فارغ";
      pinEl.style.display = "inline";
      chipEl.style.display = "none";
    }
  });
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
