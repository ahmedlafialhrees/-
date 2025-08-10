// مفاتيح التخزين المحلي
const CHAT_KEY = 'kw777_local_chat';
const STAGE_KEY = 'kw777_local_stage';

// تبديل الشاشات
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// إظهار حقول اليوزر/باسورد حسب الدور
const roleSel = document.getElementById('role');
const credWrap = document.getElementById('credWrap');
function toggleCred(){ credWrap.style.display = (roleSel.value==='member') ? 'none':'grid'; }
roleSel.addEventListener('change', toggleCred); toggleCred();

// دخول
document.getElementById('enterBtn').addEventListener('click', ()=>{
  const name=(document.getElementById('displayName').value||'مستخدم').trim();
  const role=roleSel.value;
  const u=(document.getElementById('loginUser').value||'').trim();
  const p=(document.getElementById('loginPass').value||'').trim();

  localStorage.setItem('displayName',name);
  localStorage.setItem('role',role);
  localStorage.setItem('loginUser',u);
  localStorage.setItem('loginPass',p);

  show('chat');
  bootChat();
});

function bootChat(){
  const name=localStorage.getItem('displayName')||'مستخدم';
  const role=localStorage.getItem('role')||'member';

  // شارة الرتبة
  const badgeBox=document.getElementById('roleBadge');
  badgeBox.innerHTML = role==='owner' ? '<span class="badge owner">owner</span>' :
                       role==='admin' ? '<span class="badge admin">admin</span>' : '';

  const messages=document.getElementById('messages');
  const msgInput=document.getElementById('msgInput');

  // تحميل الشات من التخزين المحلي
  messages.innerHTML = '';
  try{
    JSON.parse(localStorage.getItem(CHAT_KEY)||'[]')
      .forEach(m=>addRow(messages,{name:m.name,role:m.role},m.text));
  }catch{}

  // تحميل حالة الاستيج (للمعاينة)
  restoreStage(name);

  // إرسال رسالة (محلي)
  function send(){
    const t=(msgInput.value||'').trim(); if(!t) return;
    saveChat({name,role,text:t});
    addRow(messages,{name,role},t);
    msgInput.value='';
  }
  document.getElementById('sendBtn').onclick = send;
  msgInput.addEventListener('keydown',e=>{ if(e.key==='Enter') send(); });

  // تشغيل الاستيج محلي: المايك ينوّر بالضغط
  document.querySelectorAll('#stage .slot').forEach((slot,idx)=>{
    slot.onclick = ()=>{
      const on=slot.classList.toggle('on');
      slot.querySelector('.lab').textContent = on ? name : '';
      saveStageSnapshot();
    };
  });

  // زر نزول من الاستيج: يطفي كل المايكات + يمسح الشات (حسب طلبك)
  document.getElementById('leaveStage').onclick = ()=>{
    clearStage();
    clearChat();
  };

  // زر خروج: يمسح كل شيء ويرجع للدخول
  document.getElementById('logoutBtn').onclick = ()=>{
    clearStage(); clearChat();
    show('login');
  };
}

// —— وظائف مساعدة —— //
function addRow(container, from, text){
  const badge=(from.role==='owner')?'<span class="badge owner">owner</span>':(from.role==='admin')?'<span class="badge admin">admin</span>':'';
  const row=document.createElement('div'); row.className='row';
  row.innerHTML = `<div class="av"><span class="emo">🙂</span></div>
    <div class="bubble"><div class="meta"><span class="nick">${from.name} ${badge}</span></div><div>${esc(text)}</div></div>`;
  container.appendChild(row);
  container.scrollTop = container.scrollHeight; // يثبت تحت
}

function saveChat(m){
  const arr=JSON.parse(localStorage.getItem(CHAT_KEY)||'[]');
  arr.push({name:m.name,role:m.role,text:m.text,ts:Date.now()});
  localStorage.setItem(CHAT_KEY, JSON.stringify(arr.slice(-200)));
}
function clearChat(){ localStorage.removeItem(CHAT_KEY); document.getElementById('messages').innerHTML=''; }

// الاستيج (معاينة محلية)
function saveStageSnapshot(){
  const state = [...document.querySelectorAll('#stage .slot')].map(s=>({
    on: s.classList.contains('on'),
    lab: s.querySelector('.lab').textContent || ''
  }));
  localStorage.setItem(STAGE_KEY, JSON.stringify(state));
}
function restoreStage(myName){
  try{
    const state=JSON.parse(localStorage.getItem(STAGE_KEY)||'[]');
    const slots=[...document.querySelectorAll('#stage .slot')];
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
    s.querySelector('.lab').textContent='';
  });
  localStorage.removeItem(STAGE_KEY);
}

function esc(s){return String(s).replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
