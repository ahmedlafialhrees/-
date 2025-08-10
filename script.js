// تبديل الشاشات
function show(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// دخول
document.getElementById('enterBtn').addEventListener('click', ()=>{
  const name=(document.getElementById('displayName').value||'مستخدم').trim();
  const role=document.getElementById('role').value;
  localStorage.setItem('displayName',name);
  localStorage.setItem('role',role);
  show('chat');
  bootChat();
});

function bootChat(){
  const name=localStorage.getItem('displayName')||'مستخدم';
  const role=localStorage.getItem('role')||'member';
  const badgeBox=document.getElementById('roleBadge');
  badgeBox.innerHTML = role==='owner' ? '<span class="badge owner">owner</span>' :
                       role==='admin' ? '<span class="badge admin">admin</span>' : '';

  const messages=document.getElementById('messages');
  const msgInput=document.getElementById('msgInput');
  const LOCAL_KEY='kw777_local_chat';

  // إظهار سطر
  function addRow(from,text){
    const row=document.createElement('div'); row.className='row';
    const badge=(from.role==='owner')?'<span class="badge owner">owner</span>':(from.role==='admin')?'<span class="badge admin">admin</span>':'';
    row.innerHTML = `<div class="av"><span class="emo">🙂</span></div>
      <div class="bubble"><div class="meta"><span class="nick">${from.name} ${badge}</span></div><div>${esc(text)}</div></div>`;
    messages.appendChild(row);
    messages.scrollTop=messages.scrollHeight;
  }
  function saveLocal(n,r,t){
    const arr=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');
    arr.push({name:n,role:r,text:t,ts:Date.now()});
    localStorage.setItem(LOCAL_KEY, JSON.stringify(arr.slice(-200)));
  }
  function loadLocal(){
    try{ JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]').forEach(m=>addRow({name:m.name,role:m.role},m.text)); }catch{}
  }

  // تشغيل الاستيج محلي (ينور بالضغط)
  document.querySelectorAll('#stage .slot').forEach(slot=>{
    slot.addEventListener('click', ()=>{
      const on=slot.classList.toggle('on');
      slot.querySelector('.lab').textContent = on ? name : '';
    });
  });
  document.getElementById('reqStage').onclick=()=>{}; // للعرض
  document.getElementById('leaveStage').onclick=()=>{
    document.querySelectorAll('#stage .slot.on .lab').forEach(l=>l.textContent='');
    document.querySelectorAll('#stage .slot.on').forEach(s=>s.classList.remove('on'));
  };

  // إرسال
  function send(){
    const t=(msgInput.value||'').trim(); if(!t) return;
    saveLocal(name,role,t); addRow({name,role},t); msgInput.value='';
  }
  document.getElementById('sendBtn').addEventListener('click', send);
  msgInput.addEventListener('keydown', e=>{ if(e.key==='Enter') send(); });

  // تحميل التاريخ
  loadLocal();

  function esc(s){return String(s).replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
}
