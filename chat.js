// Socket.IO
const socket = io(window.SERVER_URL, {transports:['websocket']});

let me=null, stage=[null,null,null,null], meOnStage=false;

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
socket.on("connect_error", ()=> addSystem("⚠️ غير متصل بالسيرفر"));

// ===== الرسائل (بدون أسماء) =====
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

// استقبال رسائل من السيرفر (يدعم string أو object)
socket.on("chat:msg", (payload)=>{
  let text = typeof payload === "string" ? payload : (payload?.text || "");
  if (!text) return;
  // لو السيرفر يرسل from.id نفس معرفي، نتجاهلها لأننا أضفناها محلياً
  if (payload?.from?.id && me?.id && payload.from.id === me.id) return;
  addMsgBox(text);
});

// إرسال + عرض فوري
function sendNow(){
  const t=document.getElementById("text");
  const v=(t.value||"").trim();
  if(!v) return;
  addMsgBox(v);                 // عرض فوري
  socket.emit("chat:msg", v);   // إرسال للسيرفر
  t.value="";
}
document.getElementById("send").addEventListener("click", sendNow);
document.getElementById("text").addEventListener("keydown", e=>{ if(e.key==="Enter") sendNow(); });

// ===== الاستيج Overlay =====
document.querySelectorAll(".slot").forEach(el=>{
  el.addEventListener("click", ()=>{
    const panel=document.getElementById("stagePanel");
    if (panel.classList.contains("closed")) return; // مقفول
    socket.emit("stage:toggle");
  });
});
socket.on("stage:update", (view)=>{
  stage=view;
  meOnStage=!!stage.find(s=>s && me && s.id===me.id);
  document.querySelectorAll(".slot").forEach((el,idx)=>{
    el.classList.toggle("filled", !!stage[idx]);
  });
});

// زر المايك: يفتح/يقفل
const stagePanel=document.getElementById("stagePanel");
const stageFab=document.getElementById("stageFab");
function toggleStage(){
  const closing = !stagePanel.classList.contains("closed");
  if (closing && meOnStage) socket.emit("stage:toggle"); // نزّلني إذا كنت فوق
  stagePanel.classList.toggle("closed");
}
stageFab.addEventListener("click", toggleStage);
