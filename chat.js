// Socket.IO
const socket = io(window.SERVER_URL, {transports:['websocket']});

let me=null, stage=[null,null,null,null], meOnStage=false;

// خروج
document.getElementById("exitBtn").onclick = ()=> location.href="index.html";

// دخول
(function(){
  const name = sessionStorage.getItem("loginName")||"";
  const adminPass = sessionStorage.getItem("adminPass")||"";
  const ownerPass = sessionStorage.getItem("ownerPass")||"";
  if (!name) { alert("ادخل اسمك أول"); location.href="index.html"; return; }
  socket.emit("auth:login", { name, adminPass, ownerPass });
})();

socket.on("auth:ok", ({me: my}) => {
  me = my;
  document.getElementById("composerName").textContent = `ترسل كـ: ${me.name}`;
  if (me.role === "owner" && (!window.MAIN_OWNER_NAME || me.name === window.MAIN_OWNER_NAME)) {
    document.getElementById("ownerPanel").style.display = "inline-flex";
  }
});
socket.on("auth:error", (m)=>{ alert(m||"خطأ في الدخول"); location.href="index.html"; });
socket.on("auth:kicked", (m)=>{ alert(m||"تم طردك"); location.href="index.html"; });

// حالة الاتصال
socket.on("connect_error", ()=> addSystem("⚠️ غير متصل بالسيرفر"));
socket.on("connect", ()=> addSystem("✅ تم الاتصال بالسيرفر"));

/* رسائل */
function addMsgBox(text){
  const msgs=document.getElementById("msgs");
  const box=document.createElement("div");
  box.className="msg";
  box.textContent=text;
  msgs.appendChild(box);
  msgs.scrollTop=msgs.scrollHeight;
}
function addSystem(t){
  const msgs=document.getElementById("msgs");
  const box=document.createElement("div");
  box.className="msg system";
  box.textContent=t;
  msgs.appendChild(box);
  msgs.scrollTop=msgs.scrollHeight;
}
socket.on("chat:msg", (payload)=>{
  const text = typeof payload==="string" ? payload : (payload?.text || "");
  if(text) addMsgBox(text);
});

// إرسال + عرض فوري
function sendNow(){
  const t=document.getElementById("text");
  const v=(t.value||"").trim();
  if(!v) return;
  addMsgBox(v);          // عرض فوري
  socket.emit("chat:msg", v);
  t.value="";
}
document.getElementById("send").addEventListener("click", sendNow);
document.getElementById("text").addEventListener("keydown", e=>{ if(e.key==="Enter") sendNow(); });

/* الاستيج */
document.querySelectorAll(".slot").forEach(el=>{
  el.addEventListener("click", ()=>{
    if (document.getElementById("stagePanel").classList.contains("closed")) return;
    socket.emit("stage:toggle");
  });
});
socket.on("stage:update", (view)=>{
  stage=view;
  meOnStage=!!stage.find(s=>s && me && s.id===me.id);
  document.querySelectorAll(".slot").forEach((el,idx)=> el.classList.toggle("filled", !!stage[idx]));
});

// زر المايك أعلى اليمين: فتح/قفل الاستيج
const stagePanel=document.getElementById("stagePanel");
const stageFab=document.getElementById("stageFab");
stageFab.addEventListener("click", ()=>{
  const closing = !stagePanel.classList.contains("closed");
  if (closing && meOnStage) socket.emit("stage:toggle");
  stagePanel.classList.toggle("closed");
});
