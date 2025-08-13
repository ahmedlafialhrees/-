/* chat.js — Stable Wire v3 (رسائل + إيموجي + استيج + لوحة تحكم)
   - ما نغيّر CSS نهائياً؛ بس نضيف/نحذف كلاس open أو style.display عند الحاجة.
   - يلتقط العناصر بأكثر من مُعرِّف. لو عنصر ناقص: يتجاهله (ما يكسّر الصفحة).
*/

/* ========= Helpers ========= */
const $$ = (sel, root=document) => root.querySelector(sel);
const $$$ = (sel, root=document) => root.querySelectorAll(sel);
const onReady = (cb)=> (document.readyState!=='loading' ? cb() : document.addEventListener('DOMContentLoaded', cb, {once:true}));
const textIncludes = (el, t)=> el && (el.textContent || '').trim().includes(t);

/* ========= Identity ========= */
const stored = localStorage.getItem('myId');
window.myId  = stored || ('u' + Math.random().toString(36).slice(2, 10));
if (!stored) localStorage.setItem('myId', window.myId);
const params  = new URLSearchParams(location.search);
window.roomId = params.get('room') || 'lobby';
window.isOwner = false;

/* ========= Socket.IO ========= */
(function initSocket(){
  if (typeof io === 'undefined') { console.error('[Socket] Socket.IO غير محمّل'); return; }
  if (!window.SERVER_URL)       { console.error('[Socket] SERVER_URL مفقود في config.js'); return; }
  const socket = io(window.SERVER_URL, { transports:['websocket','polling'], path:'/socket.io' });
  window.socket = socket;

  socket.on('connect', ()=> {
    socket.emit('joinRoom', { roomId: window.roomId, userId: window.myId });
  });
  socket.on('chat:msg', ({ from, text, at })=>{
    appendMessage({ from, text, self: from===window.myId, at });
  });
  socket.on('stage:update', (payload)=> Stage.applyUpdate(payload));
})();

/* ========= رسائل الشات ========= */
onReady(() => {
  // يمسك العناصر بدون تغيير التصميم
  const list  = $$('#messages') || $$('.messages') || $$('[data-role="messages"]');
  const form  = $$('#msgForm') || $$('form#msgForm') || $$('[data-role="msg-form"]');
  const input = $$('#msgInput') || $$('#messageInput') || $$('textarea#msgInput') || $$('[data-role="msg-input"]');
  const sendBtn = $$('#sendBtn') || $$('.send-btn') || $$('button[type="submit"]');

  // ثبّت خانة الكتابة (لا تكبر ولا تصغر)
  if (input) {
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('maxlength', '2000');
    // لو كانت textarea
    if (input.tagName.toLowerCase() === 'textarea') {
      input.setAttribute('rows', '1');
      input.style.height = '44px';
      input.style.resize = 'none';
      input.style.overflowY = 'auto';
      input.addEventListener('input', ()=> { input.style.height = '44px'; }); // يظل ثابت
    }
  }

  // إرسال
  form && form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const text = (input?.value || '').trim();
    if (!text) return;
    window.socket?.emit('chat:msg', { roomId: window.roomId, from: window.myId, text });
    appendMessage({ from: window.myId, text, self:true, at: Date.now() });
    input.value = '';
    input.focus();
  });

  // دالة عامة لإضافة رسالة (ما تغيّر ستايلك)
  window.appendMessage = function ({ from, text, self=false }) {
    if (!list) return;
    const item = document.createElement('div');
    item.className = self ? 'msg me' : 'msg';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    // فقط نضمن لفّ النص
    bubble.style.whiteSpace = 'pre-wrap';
    bubble.style.wordBreak = 'break-word';
    bubble.style.overflowWrap = 'anywhere';
    bubble.textContent = text;
    item.appendChild(bubble);
    list.appendChild(item);
    try { list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }); } catch {}
  };
});

/* ========= لوحة الإيموجي ========= */
onReady(() => {
  const emojiBtn = $$('#emojiBtn') || $$('.emoji-btn') || $$('[data-role="emoji"]');
  const input    = $$('#msgInput') || $$('#messageInput') || $$('[data-role="msg-input"]');
  const panel    = $$('#emojiPanel') || $$('#emojis') || $$('[data-role="emoji-panel"]');

  if (!emojiBtn || !input) return;

  let p = panel;
  if (!p) {
    // ما نضيف ستايل خارجي؛ نخليها بسيطة ومخفية لين يضغط
    p = document.createElement('div');
    p.id = 'emojiPanel';
    p.style.display = 'none';
    p.style.position = 'fixed';
    p.style.right = '12px';
    p.style.bottom = '70px';
    p.style.background = 'var(--panel-bg, #111)';
    p.style.border = '1px solid rgba(255,255,255,.1)';
    p.style.borderRadius = '10px';
    p.style.padding = '8px';
    p.style.maxHeight = '40vh';
    p.style.overflow = 'auto';
    p.style.zIndex = '9999';
    document.body.appendChild(p);
  }
  if (!p.dataset.ready) {
    const emojis = "😀😁😂🤣😊😍😘😎🤩🤔😴😡👍👋🙏🔥✨🎉❤️💔💯⭐⚡🎧🎵🎮🏆🎯🧠".split('');
    p.innerHTML = emojis.map(e=>`<button type="button" data-e="${e}" style="background:transparent;border:none;font-size:22px;padding:6px;cursor:pointer">${e}</button>`).join('');
    p.dataset.ready = '1';
  }

  const open  = ()=> { p.style.display = 'block'; };
  const close = ()=> { p.style.display = 'none';  };
  emojiBtn.addEventListener('click', (e)=> { e.stopPropagation(); (p.style.display==='block'? close(): open()); });
  p.addEventListener('click', (e)=>{
    const t = e.target;
    if (t && t.dataset && t.dataset.e){
      const emoji = t.dataset.e;
      const start = input.selectionStart ?? input.value.length;
      const end   = input.selectionEnd   ?? input.value.length;
      input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    }
  });
  document.addEventListener('click', (e)=> { if (!p.contains(e.target) && e.target!==emojiBtn) close(); });
});

/* ========= الاستيج: ٤ مايكات ========= */
const Stage = (() => {
  const state = { open:false, slots:[null,null,null,null] };
  let   overlay, micBtn, slotEls;

  function bindDOM(){
    overlay = $$('#stageOverlay') || $$('.stage-overlay') || $$('[data-role="stage"]');
    micBtn  = $$('#btnMic') || $$('#micToggle') || $$('.mic-btn') || $$('[data-role="mic"]');
    slotEls = overlay ? $$$('.stage-slot', overlay) : null;
  }

  function open(){ if (!overlay) return; overlay.classList.add('open'); overlay.style.display = 'block'; state.open=true; }
  function close(){ if (!overlay) return; overlay.classList.remove('open'); overlay.style.display = 'none'; state.open=false; leave(); }

  function render(){
    if (!slotEls) return;
    slotEls.forEach((el, idx) => {
      const uid = state.slots[idx];
      el.dataset.uid = uid || '';
      const label = $$('.label', el);
      if (label) label.textContent = uid ? (uid===window.myId ? 'أنت' : 'مشغول') : 'فارغ';
      // ما نعدّل CSS عندك؛ فقط نضيف mine/occupied لو موجودة بالستايل
      el.classList.toggle('occupied', !!uid);
      el.classList.toggle('mine', uid === window.myId);
    });
  }

  function join(i){
    if (!overlay || !slotEls) return;
    const idx = Math.max(0, Math.min(3, i|0));
    const prev = state.slots.indexOf(window.myId);
    if (prev>-1) state.slots[prev] = null;
    if (!state.slots[idx]) state.slots[idx] = window.myId;
    render();
    window.socket?.emit('stage:join', { roomId: window.roomId, slotIndex: idx });
  }

  function leave(){
    if (!overlay || !slotEls) return;
    const i = state.slots.indexOf(window.myId);
    if (i>-1) state.slots[i] = null;
    render();
    window.socket?.emit('stage:leave', { roomId: window.roomId });
  }

  function applyUpdate(payload){
    if (!payload || !Array.isArray(payload.slots)) return;
    state.slots = payload.slots;
    if (payload.forceClose) close();
    render();
  }

  onReady(() => {
    bindDOM();
    if (!overlay) return; // لو التصميم ما فيه استيج، نسكت بدون كسر

    // تفعيل زر المايك
    micBtn && micBtn.addEventListener('click', ()=> (state.open ? close() : open()));

    // ربط الخانات
    slotEls && slotEls.forEach((el, idx) => {
      el.addEventListener('click', () => {
        const mine  = el.dataset.uid === window.myId;
        const empty = !el.dataset.uid;
        if (mine) leave();
        else if (empty) join(idx);
      });
    });
    render();
  });

  return { open, close, join, leave, applyUpdate };
})();

/* ========= لوحة التحكم (للأونر فقط) ========= */
onReady(() => {
  // زر فتح لوحة التحكم (نلتقطه بأي طريقة)
  let ownerBtn =
    $$('#ownerBtn') || $$('.owner-btn') || $$('[data-role="owner"]') ||
    [...document.querySelectorAll('button, a, [role="button"]')].find(el => textIncludes(el, 'لوحة التحكم'));

  // عنصر لوحة التحكم نفسه (ما نضيف ستايل — بس نظهره/نخفيه)
  const panel = $$('#ownerPanel') || $$('.owner-panel') || $$('[data-owner-panel]');
  const PASS  = (window.OWNER_PASS || '6677') + '';

  function showPanel(){
    if (!panel) return;
    // شيله من display:none أو hidden
    panel.removeAttribute('hidden');
    panel.style.display = ''; // نرجعه للي عندك بالCSS
    // لو مستخدم حاطينه في مودال/اوفِرلاي، الكلاس عنده مسؤول
    panel.classList.add('open'); // إذا عندك ستايل لكلاس open يشتغل، وإلا ما يضر
  }

  if (ownerBtn) {
    ownerBtn.addEventListener('click', () => {
      if (window.isOwner) { showPanel(); return; }
      const p = prompt('أدخل كلمة سر الأونر:');
      if (p === PASS) {
        window.isOwner = true;
        showPanel();
      } else if (p != null) {
        alert('كلمة السر غير صحيحة');
      }
    });
  }
});
