/* chat.js — All-in-One + Offline Fallback (رسائل + إيموجي + استيج)
   يعمل حتى لو السيرفر مو شغال/غلط — وضع طوارئ محلي.
   المتطلبات (للعمل أونلاين):
   1) Socket.IO قبل هذا الملف:
      <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
   2) config.js فيه:
      window.SERVER_URL = "https://YOUR-RENDER-OR-SERVER";
*/

/* ================== Helpers ================== */
function onReady(cb){ if (document.readyState!=='loading') cb(); else document.addEventListener('DOMContentLoaded', cb, {once:true}); }
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return root.querySelectorAll(sel); }
function ensureEl(tag, id, parent=document.body, setup){
  let el = id ? document.getElementById(id) : null;
  if (!el){ el = document.createElement(tag); if (id) el.id = id; setup && setup(el); parent.appendChild(el); }
  return el;
}

/* ============== Identity (قبل السوكِت) ============== */
const stored = localStorage.getItem('myId');
window.myId  = stored || ('u' + Math.random().toString(36).slice(2, 10));
if (!stored) localStorage.setItem('myId', window.myId);
const params = new URLSearchParams(location.search);
window.roomId = params.get('room') || 'lobby';

/* ============== Local Bus (للطوارئ) ============== */
const LocalBus = {
  _h: {},
  on(evt, fn){ (this._h[evt] ??= []).push(fn); },
  emit(evt, payload){ (this._h[evt]||[]).forEach(fn => { try{ fn(payload); }catch(e){ console.error(e); } }); }
};

/* ============== Socket (مع Fallback) ============== */
(function initSocket(){
  function useFallback(reason){
    console.warn('[Socket] Using offline fallback:', reason || 'unknown');
    const fake = {
      connected: true,
      on(evt, fn){ LocalBus.on(evt, fn); },
      emit(evt, payload){
        // محاكاة بسيطة محلية
        if (evt === 'chat:msg'){
          // بث الرسالة محلياً
          LocalBus.emit('chat:msg', { from: payload.from, text: payload.text, at: Date.now() });
        } else if (evt === 'stage:join'){
          // تحديث محلي للاستيج
          window.__stageLocal = window.__stageLocal || { slots:[null,null,null,null] };
          const s = window.__stageLocal.slots;
          const uid = window.myId;
          const prev = s.indexOf(uid);
          if (prev>-1) s[prev] = null;
          const i = Math.max(0, Math.min(3, payload.slotIndex|0));
          if (!s[i]) s[i] = uid;
          LocalBus.emit('stage:update', { slots: s.slice(), forceClose:false });
        } else if (evt === 'stage:leave'){
          window.__stageLocal = window.__stageLocal || { slots:[null,null,null,null] };
          const s = window.__stageLocal.slots;
          const i = s.indexOf(window.myId);
          if (i>-1) s[i] = null;
          LocalBus.emit('stage:update', { slots: s.slice(), forceClose:false });
        } else if (evt === 'joinRoom'){
          // تجاهل محلياً
        }
      },
      close(){},
    };
    window.socket = fake;
    // اربط سماعات محلية
    LocalBus.on('stage:update', (p)=> window.Stage?.applyUpdate(p));
  }

  // إذا Socket.IO مو محمّل أو SERVER_URL مو محدد → طوارئ
  if (typeof io === 'undefined' || !window.SERVER_URL) return useFallback('io missing or SERVER_URL missing');

  let connected = false;
  try {
    const socket = io(window.SERVER_URL, {
      transports:['websocket','polling'],
      path:'/socket.io',
      withCredentials:false,
    });
    window.socket = socket;

    const timeout = setTimeout(() => {
      if (!connected) {
        try{ socket.close(); }catch{}
        useFallback('connect timeout');
      }
    }, 3500);

    socket.on('connect', () => {
      connected = true; clearTimeout(timeout);
      console.log('[Socket] connected:', socket.id);
      socket.emit('joinRoom', { roomId: window.roomId, userId: window.myId });
    });

    socket.on('disconnect', (r)=> console.warn('[Socket] disconnect:', r));
    socket.on('chat:msg', (m)=> LocalBus.emit('chat:msg', m));
    socket.on('stage:update', (p)=> LocalBus.emit('stage:update', p));

  } catch (e){
    console.error('[Socket] error:', e);
    useFallback('exception');
  }
})();

/* ============== واجهة الرسائل ============== */
onReady(() => {
  // لو ناقص عناصر الرسائل، نبني بديل بسيط (ما يتدخل إذا موجود)
  const messages = ensureEl('div', 'messages', document.body, (el)=>{
    el.style.minHeight='40vh'; el.style.maxHeight='50vh'; el.style.overflow='auto';
    el.style.padding='10px'; el.style.background='#0f0f0f'; el.style.color='#eee'; el.style.margin='10px';
  });
  const formWrap = ensureEl('div', 'composerWrap', document.body, (el)=>{
    el.style.display='flex'; el.style.gap='8px'; el.style.padding='10px'; el.style.background='#111'; el.style.margin='10px';
  });
  let form = $('#msgForm'); if (!form){ form = document.createElement('form'); form.id='msgForm'; formWrap.appendChild(form); }
  let input = $('#msgInput'); if (!input){ input = document.createElement('input'); input.id='msgInput'; input.placeholder='اكتب رسالة...'; input.autocomplete='off'; input.style.flex='1'; input.style.padding='10px'; input.style.borderRadius='8px'; input.style.border='1px solid #333'; input.style.background='#0f0f0f'; input.style.color='#eee'; form.appendChild(input); }
  if (!$('#sendBtn')){ const sb=document.createElement('button'); sb.id='sendBtn'; sb.type='submit'; sb.textContent='إرسال'; form.appendChild(sb); }
  // زر إيموجي لو ناقص
  let emojiBtn = $('#emojiBtn') || $('#btnEmoji');
  if (!emojiBtn){ emojiBtn = document.createElement('button'); emojiBtn.id='emojiBtn'; emojiBtn.type='button'; emojiBtn.textContent='🙂'; formWrap.insertBefore(emojiBtn, form); }

  // إرسال
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = (input.value || '').trim();
    if (!text) return;
    window.socket?.emit('chat:msg', { roomId: window.roomId, from: window.myId, text });
    appendMessage({ from: window.myId, text, self:true, at: Date.now() });
    input.value=''; input.focus();
  });

  function scrollToBottom(){ try{ messages.scrollTo({ top: messages.scrollHeight, behavior:'smooth' }); }catch{} }

  window.appendMessage = function ({ from, text, self=false, at }){
    const item = document.createElement('div');
    item.className = self ? 'msg me' : 'msg';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    Object.assign(bubble.style, { padding:'10px 12px', background:self?'#2a2a2a':'#1c1c1c',
      borderRadius:'14px', maxWidth:'80%', whiteSpace:'pre-wrap', wordBreak:'break-word', overflowWrap:'anywhere',
      margin:self?'6px 0 6px auto':'6px auto 6px 0', color:'#eee'
    });
    bubble.textContent = text;
    item.appendChild(bubble);
    messages.appendChild(item);
    scrollToBottom();
  };

  // استقبال رسائل من الأونلاين/الطوارئ
  LocalBus.on('chat:msg', ({ from, text, at }) => {
    appendMessage({ from, text, self: from===window.myId, at });
  });
});

/* ============== لوحة الإيموجي ============== */
onReady(() => {
  const btn   = $('#emojiBtn') || $('#btnEmoji');
  const input = $('#msgInput') || $('#messageInput');
  if (!btn || !input) return;
  let panel = $('#emojiPanel') || $('#emojis');
  if (!panel){
    panel = document.createElement('div'); panel.id='emojiPanel';
    Object.assign(panel.style, { position:'fixed', right:'12px', bottom:'70px', background:'#111',
      border:'1px solid #333', borderRadius:'10px', padding:'8px', maxWidth:'320px', maxHeight:'40vh',
      overflow:'auto', display:'none', zIndex:9999, color:'#fff'
    });
    document.body.appendChild(panel);
  }
  const emojis = "😀😁😂🤣😊😍😘😎🤩🤔😴😡👍👋🙏🔥✨🎉❤️💔💯⭐⚡🎧🎵🎮🏆🎯🧠🐱‍👤".split('');
  if (!panel.dataset.filled){
    panel.innerHTML = emojis.map(e=>`<button type="button" data-emoji="${e}" style="background:transparent;border:none;font-size:22px;padding:6px;cursor:pointer">${e}</button>`).join('');
    panel.dataset.filled='1';
  }
  const open = ()=> panel.style.display='block';
  const close= ()=> panel.style.display='none';
  btn.addEventListener('click', (e)=>{ e.stopPropagation(); panel.style.display==='block'?close():open(); });
  panel.addEventListener('click', (e)=>{
    const t = e.target;
    if (t && t.dataset && t.dataset.emoji){
      const emoji = t.dataset.emoji;
      const start = input.selectionStart ?? input.value.length;
      const end   = input.selectionEnd   ?? input.value.length;
      input.value = input.value.slice(0,start) + emoji + input.value.slice(end);
      input.focus();
      input.setSelectionRange(start+emoji.length, start+emoji.length);
    }
  });
  document.addEventListener('click', (e)=>{ if (!panel.contains(e.target) && e.target!==btn) close(); });
});

/* ============== الاستيج (4 خانات) ============== */
onReady(() => {
  // زر مايك لو ناقص
  let micBtn = $('#btnMic') || $('#micToggle') || $('#openStageBtn');
  if (!micBtn){
    micBtn = document.createElement('button');
    micBtn.id='btnMic'; micBtn.type='button'; micBtn.textContent='🎙️';
    // نحطه زاوية فوق — بس إذا ما فيه توب بار عندك
    micBtn.style.position='fixed'; micBtn.style.top='12px'; micBtn.style.right='12px'; micBtn.style.zIndex='9999';
    document.body.appendChild(micBtn);
  }

  let overlay = $('#stageOverlay');
  if (!overlay){
    overlay = document.createElement('div'); overlay.id='stageOverlay';
    Object.assign(overlay.style, { position:'fixed', inset:'0', background:'rgba(0,0,0,.55)', backdropFilter:'blur(2px)',
      display:'none', padding:'20px', zIndex:9998
    });
    const grid = document.createElement('div'); grid.className='stage-grid';
    Object.assign(grid.style, { display:'grid', gridTemplateColumns:'repeat(2, minmax(160px, 1fr))', gap:'12px', maxWidth:'520px', margin:'40px auto' });
    for (let i=0;i<4;i++){
      const slot = document.createElement('div'); slot.className='stage-slot';
      Object.assign(slot.style, { background:'#111', border:'1px dashed #444', borderRadius:'12px', padding:'22px', textAlign:'center', color:'#ddd' });
      const label = document.createElement('span'); label.className='label'; label.textContent='فارغ';
      slot.appendChild(label); grid.appendChild(slot);
    }
    overlay.appendChild(grid); document.body.appendChild(overlay);
  }
  const slotEls = $all('.stage-slot', overlay);
  const state = window.__stageLocal || { slots:[null,null,null,null] }; // يشارك مع الطوارئ

  function render(){
    slotEls.forEach((el, idx) => {
      const uid = state.slots[idx];
      el.dataset.uid = uid || '';
      el.style.outline = uid ? (uid===window.myId ? '2px solid #6cf' : '2px solid #444') : '1px dashed #444';
      const label = $('.label', el);
      if (label) label.textContent = uid ? (uid===window.myId ? 'أنت' : 'مشغول') : 'فارغ';
    });
  }
  function open(){ overlay.classList.add('open'); overlay.style.display='block'; }
  function close(){ overlay.classList.remove('open'); overlay.style.display='none'; leave(); }

  micBtn.addEventListener('click', ()=> (overlay.style.display==='block'? close(): open()));

  slotEls.forEach((el, idx) => {
    el.addEventListener('click', () => {
      const mine  = el.dataset.uid === window.myId;
      const empty = !el.dataset.uid;
      if (mine) leave();
      else if (empty) join(idx);
    });
  });

  function join(slotIndex){
    const prev = state.slots.indexOf(window.myId);
    if (prev>-1) state.slots[prev] = null;
    const i = Math.max(0, Math.min(3, slotIndex|0));
    if (!state.slots[i]) state.slots[i] = window.myId;
    render();
    window.socket?.emit('stage:join', { roomId: window.roomId, slotIndex:i });
  }
  function leave(){
    const i = state.slots.indexOf(window.myId);
    if (i>-1) state.slots[i] = null;
    render();
    window.socket?.emit('stage:leave', { roomId: window.roomId });
  }

  window.addEventListener('beforeunload', () => { if (state.slots.indexOf(window.myId)>-1) window.socket?.emit('stage:leave', { roomId: window.roomId }); });

  // ربط تحديثات من الأونلاين/الطوارئ
  LocalBus.on('stage:update', (payload) => {
    if (!payload || !Array.isArray(payload.slots)) return;
    state.slots = payload.slots.slice(); render();
  });

  // واجهة Stage للنداء الخارجي
  window.Stage = {
    applyUpdate(payload){ if (payload && Array.isArray(payload.slots)){ state.slots = payload.slots.slice(); render(); } },
    open, close, join, leave, state
  };

  render();
});
