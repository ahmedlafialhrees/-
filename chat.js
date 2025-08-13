// chat.js — النسخة الأساسية (قبل تعديل SAFE)
// يربط Socket.IO + رسائل الشات + الاستيج (فتح/قفل من زر المايك + صعود/نزول)
// بدون لمس تصميمك أو ترتيب العناصر

/***************** 1) Socket.IO *****************/
(function initSocket() {
  if (typeof io === 'undefined') {
    console.error('[Socket] مكتبة Socket.IO غير محملة.');
    return;
  }
  if (!window.SERVER_URL) {
    console.error('[Socket] SERVER_URL غير معرّف في config.js');
    return;
  }

  const socket = io(window.SERVER_URL, {
    transports: ['websocket', 'polling'],
    path: '/socket.io',
    withCredentials: false,
  });

  window.socket = socket;

  // هوية المستخدم وروم بسيط
  const stored = localStorage.getItem('myId');
  window.myId = stored || ('u' + Math.random().toString(36).slice(2, 10));
  if (!stored) localStorage.setItem('myId', window.myId);

  const params = new URLSearchParams(location.search);
  window.roomId = params.get('room') || 'lobby';

  socket.on('connect', () => {
    console.log('[Socket] connected:', socket.id);
    socket.emit('joinRoom', { roomId: window.roomId, userId: window.myId });
  });

  socket.on('disconnect', (reason) => {
    console.warn('[Socket] disconnected:', reason);
  });

  // استقبال رسائل الشات
  socket.on('chat:msg', ({ from, text, at }) => {
    appendMessage({ from, text, self: (from === window.myId), at });
  });
})();

/***************** 2) DOM & Chat UI *****************/
document.addEventListener('DOMContentLoaded', () => {
  const form   = document.getElementById('msgForm')   || document.querySelector('form#msgForm');
  const input  = document.getElementById('msgInput')  || document.querySelector('#msgInput');
  const list   = document.getElementById('messages')  || document.querySelector('#messages');

  // إرسال رسالة
  form && form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = (input?.value || '').trim();
    if (!text) return;
    // أرسل للسيرفر
    window.socket?.emit('chat:msg', { roomId: window.roomId, from: window.myId, text });
    // أضفها محلياً
    appendMessage({ from: window.myId, text, self: true, at: Date.now() });
    input.value = '';
    input.focus();
  });

  // تمرير لآخر الرسائل
  function scrollToBottom() {
    try { list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }); } catch {}
  }

  // إنشاء فقاعة رسالة (يلتف النص تلقائياً)
  window.appendMessage = function ({ from, text, self, at }) {
    if (!list) return;
    const item = document.createElement('div');
    item.className = self ? 'msg me' : 'msg';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.style.whiteSpace = 'pre-wrap';
    bubble.style.wordBreak = 'break-word';
    bubble.style.overflowWrap = 'anywhere';
    bubble.textContent = text;
    item.appendChild(bubble);
    list.appendChild(item);
    scrollToBottom();
  };
});

/***************** 3) Stage (النسخة القديمة) *****************/
// يعتمد على:
// - overlay: id="stageOverlay"
// - أربع خانات داخل overlay بكلاس .stage-slot وبكل خانة span.label
// - زر المايك: #btnMic أو #micToggle أو #openStageBtn
(function initStageOld() {
  const overlay = document.getElementById('stageOverlay');
  const micBtn  =
    document.getElementById('btnMic') ||
    document.getElementById('micToggle') ||
    document.getElementById('openStageBtn');

  if (!overlay) { console.warn('[Stage-old] overlay غير موجود (#stageOverlay).'); return; }

  const slotEls = overlay.querySelectorAll('.stage-slot');

  const state = {
    open: false,
    meOnStage: false,
    slots: [null, null, null, null],
  };

  function render() {
    slotEls.forEach((el, idx) => {
      const uid = state.slots[idx];
      el.dataset.uid = uid || '';
      el.classList.toggle('occupied', !!uid);
      el.classList.toggle('mine', uid === window.myId);
      const label = el.querySelector('.label');
      if (label) label.textContent = uid ? (uid === window.myId ? 'أنت' : 'مشغول') : 'فارغ';
    });
  }

  function openStage() {
    overlay.classList.add('open');  // يفترض أن CSS عندك يتكفل بإظهار/إخفاء
    state.open = true;
  }

  function closeStage() {
    overlay.classList.remove('open');
    state.open = false;
    if (state.meOnStage) leaveStage();
  }

  micBtn && micBtn.addEventListener('click', () => {
    state.open ? closeStage() : openStage();
  });

  slotEls.forEach((el, idx) => {
    el.addEventListener('click', () => {
      const mine  = el.dataset.uid === window.myId;
      const empty = !el.dataset.uid;
      if (mine) {
        leaveStage();
      } else if (!state.meOnStage && empty) {
        joinStage(idx);
      }
    });
  });

  function joinStage(slotIndex) {
    state.meOnStage = true;
    // إزالة أي تواجد سابق
    const prev = state.slots.indexOf(window.myId);
    if (prev > -1) state.slots[prev] = null;

    state.slots[slotIndex] = window.myId;
    render();
    window.socket?.emit('stage:join', { roomId: window.roomId, slotIndex });
  }

  function leaveStage() {
    state.meOnStage = false;
    const i = state.slots.indexOf(window.myId);
    if (i > -1) state.slots[i] = null;
    render();
    window.socket?.emit('stage:leave', { roomId: window.roomId });
  }

  // نزول تلقائي عند إغلاق الصفحة
  window.addEventListener('beforeunload', () => {
    if (state.meOnStage) window.socket?.emit('stage:leave', { roomId: window.roomId });
  });

  // استقبال تحديثات من السيرفر
  window.socket?.on('stage:update', (payload) => {
    if (!payload || !Array.isArray(payload.slots)) return;
    state.slots = payload.slots;
    if (payload.forceClose) closeStage();
    render();
  });

  // أول رندر
  render();

  // إتاحة بعض الدوال للكونسول (اختياري)
  window.Stage = {
    open: openStage,
    close: closeStage,
    join: joinStage,
    leave: leaveStage,
  };
})();
