/* =========================
   KW777 — script.js (Static)
   يعمل على GitHub Pages (تخزين محلي)
   ========================= */

/* مفاتيح التخزين */
const CHAT_KEY  = 'kw777_local_chat';
const STAGE_KEY = 'kw777_local_stage';
const INFO_KEY  = 'kw777_login_info';

/* عناصر عامة */
const roleSel   = document.getElementById('role');
const credWrap  = document.getElementById('credWrap');
const enterBtn  = document.getElementById('enterBtn');
const logoutBtn = document.getElementById('logoutBtn');
const reqBtn    = document.getElementById('reqStage');
const leaveBtn  = document.getElementById('leaveStage');
const messages  = document.getElementById('messages');
const msgInput  = document.getElementById('msgInput');
const roleBadge = document.getElementById('roleBadge');

/* تبديل الشاشات */
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* إظهار/إخفاء حقول اليوزر/الباس حسب الدور */
function toggleCred(){ credWrap.style.display = (roleSel.value === 'member') ? 'none' : 'grid'; }
roleSel && roleSel.addEventListener('change', toggleCred); toggleCred();

/* حفظ/قراءة معلومات الدخول */
function saveLoginInfo(obj){ localStorage.setItem(INFO_KEY, JSON.stringify(obj)); }
function loadLoginInfo(){ try{ return JSON.parse(localStorage.getItem(INFO_KEY)||'{}'); }catch{ return {}; } }

/* دخول */
enterBtn && enterBtn.addEventListener('click', ()=>{
  const name = (document.getElementById('displayName').value || 'مستخدم').trim();
  const role = roleSel.value;
  const lu   = (document.getElementById('loginUser')?.value || '').trim();
  const lp   = (document.getElementById('loginPass')?.value || '').trim();

  saveLoginInfo({ name, role, lu, lp });
  show('chat');
  bootChat();
});

/* تهيئة شاشة الشات */
function bootChat(){
  const info = loadLoginInfo();
  const name = info.name || 'مستخدم';
  const role = info.role || 'member';

  // شارة الرتبة
  roleBadge.innerHTML = role==='owner' ? '<span class="badge owner">owner</span>'
                     : role==='admin' ? '<span class="badge admin">admin</span>' : '';

  // حمّل الرسائل السابقة إلى الصندوق
  messages.innerHTML = '';
  try {
    JSON.parse(localStorage.getItem(CHAT_KEY)||'[]')
      .forEach(m => addRow({name:m.name, role:m.role}, m.text, false));
    // نزّل لأسفل بعد التحميل
    messages.scrollTop = messages.scrollHeight;
  } catch {}

  // استرجاع حالة الاستيج
  restoreStage();

  // إرسال رسالة
  function send(){
    const t = (msgInput.value || '').trim(); if(!t) return;
    saveChat({name, role, text:t});
    addRow({name, role}, t, true);
    msgInput.value = '';
  }
  document.getElementById('sendBtn').onclick = send;
  msgInput.addEventListener('keydown', e=>{ if(e.key==='Enter') send(); });

  // تفعيل الاستيج: الضغط على المايك يطلّع/ينزل اسمك
  document.querySelectorAll('#stage .slot').forEach((slot)=>{
    slot.addEventListener('click', ()=>{
      const isOn = slot.classList.toggle('on');
      slot.querySelector('.lab').textContent = isOn ? name : '';
      saveStageSnapshot();
    });
  });

  // زر صعود/نزول رمزي (معاينة)
  reqBtn && (reqBtn.onclick = ()=>{
    // أول خانة فاضية يصير عليها اسمك
    const empty = [...document.querySelectorAll('#stage .slot')].find(s=>!s.classList.contains('on'));
    if(empty){ empty.classList.add('on'); empty.querySelector('.lab').textContent = name; saveStageSnapshot(); }
  });

  // عند النزول من الاستيج: امسح الاستيج + امسح الشات (حسب طلبك)
  leaveBtn && (leaveBtn.onclick = ()=>{
    clearStage();
    clearChat();
  });

  // خروج تام: امسح كل شيء وارجع للدخول
  logoutBtn && (logoutBtn.onclick = ()=>{
    clearStage();
    clearChat();
    show('login');
  });
}

/* إضافة رسالة للصندوق */
function addRow(from, text, scroll=true){
  const badge = from.role==='owner' ? '<span class="badge owner">owner</span>'
              : from.role==='admin' ? '<span class="badge admin">admin</span>' : '';
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <div class="av"><span class="emo">🙂</span></div>
    <div class="bubble">
      <div class="meta"><span class="nick">${esc(from.name)} ${badge}</span></div>
      <div>${esc(text)}</div>
    </div>`;
  messages.appendChild(row);
  if(scroll) messages.scrollTop = messages.scrollHeight; // يبقى تحت
}

/* حفظ/مسح شات */
function saveChat(m){
  const arr = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
  arr.push({ name:m.name, role:m.role, text:m.text, ts:Date.now() });
  localStorage.setItem(CHAT_KEY, JSON.stringify(arr.slice(-300)));
}
function clearChat(){
  localStorage.removeItem(CHAT_KEY);
  messages.innerHTML = '';
}

/* حفظ/استرجاع/مسح حالة الاستيج */
function saveStageSnapshot(){
  const state = [...document.querySelectorAll('#stage .slot')].map(s=>({
    on:  s.classList.contains('on'),
    lab: s.querySelector('.lab').textContent || ''
  }));
  localStorage.setItem(STAGE_KEY, JSON.stringify(state));
}
function restoreStage(){
  try{
    const state = JSON.parse(localStorage.getItem(STAGE_KEY) || '[]');
    const slots = [...document.querySelectorAll('#stage .slot')];
    state.forEach((s,i)=>{
      if(!slots[i]) return;
      slots[i].classList.toggle('on', !!s.on);
      slots[i].querySelector('.lab').textContent = s.lab || '';
    });
  }catch{}
}
function clearStage(){
  document.querySelectorAll('#stage .slot').forEach(s=>{
    s.classList.remove('on');
    s.querySelector('.lab').textContent = '';
  });
  localStorage.removeItem(STAGE_KEY);
}

/* أدوات */
function esc(s){ return String(s).replace(/[&<>\"']/g, c=>({"&":"&amp;","<":"&lt;","&gt;":">","\"":"&quot;","'":"&#39;"}[c])); }

/* لو رجّعك مباشرة على شاشة الشات بالريلود */
(() => {
  if (document.getElementById('chat') && document.getElementById('chat').classList.contains('active')) {
    bootChat();
  }
})();
