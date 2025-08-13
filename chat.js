/* ===================== Stage Wiring (no layout changes) ===================== */
/* يعتمد على وجود:
   - overlay: عنصر id="stageOverlay"
   - أربع خانات داخل overlay بكلاس .stage-slot، وبكل خانة span.label
   - زر المايك: أحد المعرفات التالية #btnMic أو #micToggle أو #openStageBtn
   - متغيرات عامة: window.socket, window.roomId, window.myId (موجودة عندك)
*/

(function () {
  const StageManager = {
    state: {
      open: false,
      meOnStage: false,
      slots: [null, null, null, null], // أربع خانات
    },
    els: {
      overlay: null,
      micBtn: null,
      slots: [],
    },

    init() {
      // عناصر DOM
      this.els.overlay = document.getElementById('stageOverlay');
      this.els.micBtn =
        document.querySelector('#btnMic') ||
        document.querySelector('#micToggle') ||
        document.querySelector('#openStageBtn');

      if (!this.els.overlay) {
        console.warn('[Stage] لا يوجد #stageOverlay في الصفحة.');
        return;
      }

      this.els.slots = this.els.overlay.querySelectorAll('.stage-slot');

      // ربط زر المايك
      if (this.els.micBtn) {
        this.els.micBtn.addEventListener('click', () => {
          this.state.open ? this.close() : this.open();
        });
      }

      // ربط الخانات (صعود/نزول)
      this.els.slots.forEach((el, idx) => {
        el.addEventListener('click', () => {
          const mine = el.dataset.uid === window.myId;
          const empty = !el.dataset.uid;
          if (mine) this.leave();
          else if (!this.state.meOnStage && empty) this.join(idx);
        });
      });

      // سوكت: استلام تحديثات الاستيج
      if (window.socket) {
        window.socket.on('stage:update', (payload) => {
          if (!payload || !Array.isArray(payload.slots)) return;
          this.state.slots = payload.slots;
          if (payload.forceClose) this.close();
          this.render();
        });
      }

      // نزول تلقائي قبل الإغلاق
      window.addEventListener('beforeunload', () => {
        if (this.state.meOnStage && window.socket) {
          window.socket.emit('stage:leave', { roomId: window.roomId });
        }
      });

      this.render();
      console.log('[Stage] جاهز بدون أي تغيير في الستايل.');
    },

    open() {
      if (!this.els.overlay) return;
      this.els.overlay.classList.add('open');
      this.state.open = true;
    },

    close() {
      if (!this.els.overlay) return;
      this.els.overlay.classList.remove('open');
      this.state.open = false;
      if (this.state.meOnStage) this.leave();
    },

    render() {
      this.els.slots.forEach((el, idx) => {
        const uid = this.state.slots[idx];
        el.dataset.uid = uid || '';
        el.classList.toggle('occupied', !!uid);
        el.classList.toggle('mine', uid === window.myId);
        const label = el.querySelector('.label');
        if (label) label.textContent = uid ? (uid === window.myId ? 'أنت' : 'مشغول') : 'فارغ';
      });
    },

    join(slotIndex) {
      this.state.meOnStage = true;
      // إزالة أي تواجد سابق
      const prev = this.state.slots.indexOf(window.myId);
      if (prev > -1) this.state.slots[prev] = null;

      this.state.slots[slotIndex] = window.myId;
      this.render();
      if (window.socket) {
        window.socket.emit('stage:join', { roomId: window.roomId, slotIndex });
      }
    },

    leave() {
      this.state.meOnStage = false;
      const i = this.state.slots.indexOf(window.myId);
      if (i > -1) this.state.slots[i] = null;
      this.render();
      if (window.socket) {
        window.socket.emit('stage:leave', { roomId: window.roomId });
      }
    },
  };

  // ننتظر لحد ما socket + roomId + myId يصيرون جاهزين عندك
  function waitReady(fn, tries = 60) {
    if (window.socket && window.roomId && window.myId) return fn();
    if (tries <= 0) return console.warn('[Stage] ما حصلت socket/roomId/myId');
    setTimeout(() => waitReady(fn, tries - 1), 250);
  }

  waitReady(() => StageManager.init());
  // إذا تبي توصّلها يدوي: استدعِ StageManager.init() بعد ما تجهّز المتغيرات.
  window.StageManager = StageManager; // اختياري: لو تبي تستخدمه من الكونسول
})();
