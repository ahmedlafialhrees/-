// ===== KW777 front: dual-mode (Static Preview for GitHub Pages / Realtime for server) =====
const isStatic = /github\.io$/.test(location.hostname) || location.protocol === 'file:';

// ===== Common state =====
let username = localStorage.getItem("username") || "مستخدم";
let role = localStorage.getItem("role") || "member";
const CHAT_KEY = "kw777_local_chat"; // للمعاينة فقط

// شارة الرتبة
function roleBadge(r){
  if(r === "owner") return '<span class="owner">owner</span>';
  if(r === "admin") return '<span class="admin">admin</span>';
  return '';
}

// رسم رسالة على الصفحة
function pushMessageLocally(name, role, text){
  const box = document.getElementById("chatBox");
  const row = document.createElement("div");
  row.innerHTML = `${roleBadge(role)} <b>${name}</b>: ${escapeHtml(text)}`;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

// ===== Static Preview mode (GitHub Pages) =====
function loadStaticHistory(){
  const arr = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
  arr.forEach(m => pushMessageLocally(m.name, m.role, m.text));
}
function saveStaticMessage(name, role, text){
  const arr = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
  arr.push({ name, role, text, ts: Date.now() });
  localStorage.setItem(CHAT_KEY, JSON.stringify(arr.slice(-200))); // آخر 200 بس
}

// ===== Realtime (Socket.IO) =====
let socket = null;
function initRealtime(){
  // يحاول الاتصال بالسيرفر إذا الصفحة مو على GitHub Pages
  try {
    // /socket.io/socket.io.js لازم يكون متوفر من السيرفر
    socket = io();
    socket.on('connect', ()=> {
      // نرسل دخول (سيرفرنا الحالي البسيط يسوي echo للرسائل فقط – ما يتطلب join)
      console.log('connected realtime');
    });
    socket.on('chat message', (msg)=>{
      pushMessageLocally(msg.name || "مستخدم", msg.role || "member", msg.text || String(msg));
    });
  } catch(e){
    console.warn('Realtime unavailable, falling back to static mode.');
  }
}

// إرسال رسالة (يدعم الوضعين)
function sendMessage(){
  const input = document.getElementById("message");
  const text = (input.value || "").trim();
  if(!text) return;

  if(!isStatic && typeof io !== "undefined" && socket){
    // Realtime
    socket.emit('chat message', { name: username, role, text });
  } else {
    // Static Preview
    saveStaticMessage(username, role, text);
    pushMessageLocally(username, role, text);
  }

  input.value = "";
  input.focus();
}

// أدوات
function escapeHtml(s){
  return String(s).replace(/[&<>\"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// ===== boot =====
document.addEventListener('DOMContentLoaded', ()=>{
  // لو داخلين على chat.html مباشرة بدون ما نخزن اسم – نخزّن افتراضي
  if(!localStorage.getItem("username")){
    localStorage.setItem("username", username);
    localStorage.setItem("role", role);
  }
  // حمّل تاريخ محلي للمعاينة
  if(isStatic) loadStaticHistory();
  // جرّب الريل تايم إذا مو GitHub Pages
  if(!isStatic) initRealtime();

  // زر الإرسال
  const btn = document.querySelector('button[onclick="sendMessage()"]');
  const input = document.getElementById('message');
  if(input){
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') sendMessage(); });
  }
});
