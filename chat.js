/* chat.js — All-in-One SAFE (رسائل + إيموجي + استيج)
   المتطلبات:
   1) تحميل Socket.IO قبل هذا الملف:
      <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
   2) تعريف رابط السيرفر في config.js:
      window.SERVER_URL = "https://YOUR-RENDER-OR-SERVER";
*/

//////////////////////// 0) أدوات مساعدة ////////////////////////
function onReady(cb){ if (document.readyState!=='loading') cb(); else document.addEventListener('DOMContentLoaded', cb, {once:true}); }
function waitSocket(cb, tries=80){
  if (window.socket && window.roomId && window.myId) return cb();
  if (tries<=0) { console.warn('[Init] socket/ids not ready'); return; }
  setTimeout(() => waitSocket(cb, tries-1), 200);
}
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return root.querySelectorAll(sel); }

//////////////////////// 1) Socket.IO ////////////////////////
(function initSocket(){
  if (typeof io === 'undefined') { console.error('[Socket] Socket.IO not loaded'); return; }
  if (!window.SERVER_URL)       { console.error('[Socket] SERVER_URL missing in config.js'); return; }

  const socket = io(window.SERVER_URL, {
    transports:['websocket','polling'], path:'/socket.io', withCredentials:false
  });
  window.socket = socket;

  // هوية بسيطة
  const stored = localStorage.getItem('myId');
  window.myId  = stored || ('u' + Math.random().toString(36).slice(2, 10));
  if (!stored) localStorage.setItem('myId', window.myId);

  const params = new URLSearchParams(location.search);
  window.roomId = params.get('room') || 'lobby';

  socket.on('connect', () => {
    console.log('[Socket] connected:', socket.id);
    socket.emit('joinRoom', { roomId: window.roomId, userId: window.myId });
  });
  socket.on('disconnect', r => console.warn('[Socket] disconnect:', r));

  // استقبال رسائل
  socket.on('chat:msg', ({ from, text, at }) => {
    appendMessage({ from, text, self: from===window.myId, at });
  });

  // تحديثات الاستيج
  socket.on('stage:update', (payload) => {
    window.Stage?.applyUpdate(payload);
  });
})();

//////////////////////// 2) واجهة الرسائل ////////////////////////
onReady(() => {
  const form  = $('#msgForm')  || $('form#msgForm');
  const input = $('#msgInput') || $('#messageInput');
  const list  = $('#messages') || $('#messageList');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = (input?.value || '').trim();
      if (!text) return;
      window.socket?.emit('chat:msg', { roomId: window.roomId, from: window.myId, text });
      appendMessage({ from: window.myId, text, self:true, at:Date.now() });
      input.value = '';
      input.focus();
    });
  }

  function scrollToBottom(){
    try { list?.scrollTo({ top:list.scrollHeight, behavior:'smooth' }); } catch {}
  }

  // دالة عمومية لإضافة رسالة
  window.appendMessage = function ({ from, text, self=false, at }){
    if (!list) return;
    const item = document.createElement('div');
    item.className = self ? 'msg me' : 'msg';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    // لفّ النص تلقائيًا
    Object.assign(bubble.style, {
      whiteSpace:'pre-wrap', wordBreak:'break-word', overflowWrap:'anywhere'
    });
    bubble.textContent = text;
    item.appendChild(bubble);
    list.appendChild(item);
    scrollToBottom();
  };
});

//////////////////////// 3) لوحة الإيموجي ////////////////////////
onReady(() => {
  const btn   = $('#emojiBtn')   || $('#btnEmoji');
  let  panel  = $('#emojiPanel') || $('#emojis');

  const input = $('#msgInput') || $('#messageInput');
  if (!btn || !input) return;

  // لوحة جاهزة أو ننشئ وحدة خفيفة
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'emojiPanel';
    panel.style.position = 'fixed';
    panel.style.right = '12px';
    panel.style.bottom = '70px';
    panel.style.background = '#111';
    panel.style.border = '1px solid #333';
    panel.style.borderRadius = '10px';
    panel.style.padding = '8px';
    panel.style.maxWidth = '320px';
    panel.style.maxHeight = '40vh';
    panel.style.overflow = 'auto';
    panel.style.display = 'none';
    document.body.appendChild(panel);
  }

  const emojis = "😀😁😂🤣😊😍😘😎🤩🤔😴😡👍👋🙏🔥✨🎉❤️💔💯⭐⚡🎧🎵🎮🏆🎯🧠🐱‍👤".split('');
  if (!panel.dataset.filled) {
    panel.innerHTML = emojis.map(e => `<button type="button" data-emoji="${e}" style="background:transparent;border:none;font-size:22px;padding:6px;cursor:pointer">${e}</button>`).join('');
    panel.dataset.filled = '1';
  }

  function open(){ panel.style.display = 'block'; }
  function close(){ panel.style.display = 'none'; }
  function toggle(){ panel.style.display === 'block' ? close() : open(); }

  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  panel.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.emoji) {
      const emoji = t.dataset.emoji;
      const start = input.selectionStart ?? input.value.length;
      const end   = input.selectionEnd   ?? input.value.length;
      input.value = input.value.slice(0,start) + emoji + input.value.slice(end);
      input.focus();
      input.setSelectionRange(start+emoji.length, start+emoji.length);
    }
  });
  document.addEventListener('click', (e) => { if (!panel.contains(e.target) && e.target!==btn) close(); });
});

//////////////////////// 4) الاستيج (4 خانات) ////////////////////////
onReady(() => waitSocket(initStage));

function initStage(){
  try {
    const micBtn =
      $('#btnMic') || $('#micToggle') || $('#openStageBtn') || $('[data-role="mic"]');

    let overlay = $('#stageOverlay');
    if (!overlay) {
      // نكوّن أوفرلاي خفيف لو مو موجود (ما يظهر إلا عند الفتح)
      overlay = document.createElement('div');
      overlay.id = 'stageOverlay';
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.background = 'rgba(0,0,0,.55)';
      overlay.style.backdropFilter = 'blur(2px)';
      overlay.style.display = 'none';
      overlay.style.padding = '20px';
      const grid = document.createElement('div');
      grid.className = 'stage-grid';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(2, minmax(160px, 1fr))';
      grid.style.gap = '12px';
      grid.style.maxWidth = '520px';
      grid.style.margin = '40px auto';
      for (let i=0;i<4;i++){
        const slot = document.createElement('div');
        slot.className = 'stage-slot';
        slot.style.background = '#111';
        slot.style.border = '1px dashed #444';
        slot.style.borderRadius = '12px';
        slot.style.padding = '22px';
        slot.style.textAlign = 'center';
        slot.style.color = '#ddd';
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = 'فارغ';
        slot.appendChild(label);
        grid.appendChild(slot);
      }
      overlay.appendChild(grid);
      document.body.appendChild(overlay);
    }

    const slotEls = $all('.stage-slot', overlay);
    const state = { open:false, meOnStage:false, slots:[null,null,null,null] };

    function render(){
      slotEls.forEach((el, idx) => {
        const uid = state.slots[idx];
        el.dataset.uid = uid || '';
        // تمييز بسيط
        if (uid) { el.style.outline = uid===window.myId ? '2px solid #6cf' : '2px solid #444'; }
        else { el.style.outline = '1px dashed #444'; }
        const label = $('.label', el);
        if (label) label.textContent = uid ? (uid===window.myId ? 'أنت' : 'مشغول') : 'فارغ';
      });
    }
    function open(){
      state.open = true;
      overlay.classList.add('open');
      overlay.style.display = 'block'; // ضمان الظهور حتى لو ما فيه CSS
    }
    function close(){
      state.open = false;
      overlay.classList.remove('open');
      overlay.style.display = 'none';  // ضمان الإخفاء
      if (state.meOnStage) leave();
    }

    micBtn && micBtn.addEventListener('click', () => (state.open ? close() : open()));

    slotEls.forEach((el, idx) => {
      el.addEventListener('click', () => {
        const mine  = el.dataset.uid === window.myId;
        const empty = !el.dataset.uid;
        if (mine) leave();
        else if (!state.meOnStage && empty) join(idx);
      });
    });

    function join(slotIndex){
      state.meOnStage = true;
      const prev = state.slots.indexOf(window.myId);
      if (prev>-1) state.slots[prev] = null;
      state.slots[slotIndex] = window.myId;
      render();
      window.socket?.emit('stage:join', { roomId: window.roomId, slotIndex });
    }
    function leave(){
      state.meOnStage = false;
      const i = state.slots.indexOf(window.myId);
      if (i>-1) state.slots[i] = null;
      render();
      window.socket?.emit('stage:leave', { roomId: window.roomId });
    }

    // نزول تلقائي قبل الإغلاق
    window.addEventListener('beforeunload', () => {
      if (state.meOnStage) window.socket?.emit('stage:leave', { roomId: window.roomId });
    });

    // ربط مع تحديثات السيرفر
    window.Stage = {
      applyUpdate(payload){
        if (!payload || !Array.isArray(payload.slots)) return;
        state.slots = payload.slots;
        if (payload.forceClose) close();
        render();
      },
      open, close, join, leave, state
    };

    render();
    console.log('[Stage] ready.');
  } catch(e){
    console.error('[Stage] init error:', e);
  }
}
