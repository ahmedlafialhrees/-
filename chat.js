// اتصال بالسيرفر
const socket = io(window.SERVER_URL, {transports:['websocket']});

let me=null, users=[], stage=[null,null,null,null], meOnStage=false, actionMenuOpenFor=null;

// خروج
document.getElementById("exitBtn").onclick = ()=> location.href="index.html";

// دخول تلقائي
(function(){
  const name = sessionStorage.getItem("loginName")||"";
  const adminPass = sessionStorage.getItem("adminPass")||"";
  const ownerPass = sessionStorage.getItem("ownerPass")||"";
  if (!name) { alert("ادخل اسمك أول"); location.href="index.html"; return; }
  socket.emit("auth:login", { name, adminPass, ownerPass });
})();

socket.on("auth:ok", ({me: my}) => {
  me = my;
  if (me.role === "owner" && (!window.MAIN_OWNER_NAME || me.name === window.MAIN_OWNER_NAME)) {
    document.getElementById("ownerPanel").style.display = "inline-flex";
  }
});
socket.on("auth:error", (m)=>{ alert(m||"خطأ في الدخول"); location.href="index.html"; });
socket.on("auth:kicked", (m)=>{ alert(m||"تم طردك"); location.href="index.html"; });

/* ===== الرسائل (بدون أسماء) ===== */
function addMsg({text}){
  const msgs = document.getElementById("msgs");
  const box = document.createElement("div");
  box.className = "msg";
  const textEl = document.createElement("div");
  textEl.textContent = text;
  box.appendChild(textEl);
  msgs.appendChild(box);
  msgs.scrollTop = msgs.scrollHeight;
}
function addSystem(t){
  const msgs = document.getElementById("msgs");
  const box = document.createElement("div");
  box.className = "msg system";
  box.textContent = t;
  msgs.appendChild(box);
  msgs.scrollTop = msgs.scrollHeight;
}
socket.on("chat:system", addSystem);
socket.on("chat:msg", addMsg);

// إرسال
const sendNow = ()=>{
  const t = document.getElementById("text");
  const v = (t.value||"").trim();
  if(!v) return;
  socket.emit("chat:msg", v);
  t.value = "";
};
document.getElementById("send").addEventListener("click", sendNow);
document.getElementById("text").addEventListener("keydown", e=>{ if(e.key==="Enter") sendNow(); });

/* ===== الاستيج Overlay ===== */
// ضغط على أي خانة = صعود/نزول
document.querySelectorAll(".slot").forEach(el=>{
  el.addEventListener("click", ()=>{
    if (document.getElementById("stagePanel").classList.contains("closed")) return;
    socket.emit("stage:toggle");
  });
});
socket.on("stage:update", (view)=>{
  stage = view;
  meOnStage = !!stage.find(s => s && me && s.id === me.id);
  document.querySelectorAll(".slot").forEach((el,idx)=> el.classList.toggle("filled", !!stage[idx]));
});

// فتح/إغلاق الاستيج (مع زر مايك)
const stagePanel = document.getElementById("stagePanel");
const stageToggleBtn = document.getElementById("stageToggleBtn");
const stageFab = document.getElementById("stageFab");

function openStage(){ stagePanel.classList.remove("closed"); stageFab.style.display="none"; }
function closeStage(){
  if (meOnStage) socket.emit("stage:toggle"); // ينزلك لو كنت فوق
  stagePanel.classList.add("closed");
  stageFab.style.display="inline-flex";
}
stageToggleBtn.addEventListener("click", closeStage);
stageFab.addEventListener("click", openStage);

/* ===== قائمة الأعضاء/الأوامر (إن رغبت تستخدمها لاحقاً) ===== */
socket.on("users:list", (list)=>{
  users = list;
  const wrap = document.getElementById("users");
  if (!wrap) return;
  wrap.innerHTML = "";
  list.forEach(u=>{
    const row = document.createElement("div");
    row.className = "user";
    row.dataset.uid = u.id;
    row.innerHTML = `<div>•</div><div class="r"></div>`;
    row.addEventListener("click", ()=>{
      if (actionMenuOpenFor === u.id) hideActionMenu();
      else showActionMenuFor(u);
    });
    wrap.appendChild(row);
  });
});

const am = document.getElementById("actionMenu");
function hideActionMenu(){ am.classList.remove("show"); actionMenuOpenFor = null; }
function showActionMenuFor(u){
  actionMenuOpenFor = u.id;
  document.getElementById("amTitle").textContent = "أوامر";
  const grid = document.getElementById("amBtns");
  grid.innerHTML = "";

  const isOwner = me?.role === "owner";
  const isAdmin = me?.role === "admin";
  const isSelf  = me?.id === u.id;

  if (isSelf || isAdmin || isOwner){
    grid.appendChild(btn("تغيير الاسم", ()=>{
      const newName = prompt("الاسم الجديد؟", "");
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
    grid.appendChild(btn("إعطاء أدمن", ()=> act(u.id,"grantAdmin")));
    grid.appendChild(btn("إزالة أدمن", ()=> act(u.id,"revokeAdmin")));
    grid.appendChild(btn("إعطاء أونر", ()=> act(u.id,"grantOwner")));
    grid.appendChild(btn("إزالة أونر", ()=> act(u.id,"revokeOwner")));
  }
  am.classList.add("show");
}
function btn(text, onClick){ const b=document.createElement("button"); b.textContent=text; b.onclick=()=>{onClick(); hideActionMenu();}; return b; }
function act(targetId, action, payload){ socket.emit("user:action", { targetId, action, payload }); }
document.addEventListener("click", (e)=>{ if (actionMenuOpenFor && !e.target.closest(".action-menu") && !e.target.closest(".user")) hideActionMenu(); });
