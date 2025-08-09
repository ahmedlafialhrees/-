// ------- مهم: عدّل هذا بعد نشر السيرفر على Render -------
const SIGNALING_URL = 'http://localhost:4000'; // غيّره لاحقًا لرابط Render
// ---------------------------------------------------------

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const nameInput  = document.getElementById('name');
const roomInput  = document.getElementById('room');
const joinBtn    = document.getElementById('joinBtn');
const leaveBtn   = document.getElementById('leaveBtn');
const toggleMic  = document.getElementById('toggleMic');
const toggleCam  = document.getElementById('toggleCam');
const localVideo = document.getElementById('localVideo');
const localAudio = document.getElementById('localAudio');
const peersDiv   = document.getElementById('peers');

let socket = null;
let myId = null;
let roomId = null;
let localStream = null;
let peers = {}; // peerId -> RTCPeerConnection
let micOn = false, camOn = false;

function connectSocket(){
  socket = io(SIGNALING_URL, { transports:['websocket'] });

  socket.on('connect', ()=> { myId = socket.id; });

  socket.on('signal', async ({ from, data }) => {
    if (from === myId) return;
    let pc = peers[from];
    if (!pc) pc = createPeer(from, false);

    if (data.type === 'offer'){
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: from, data: pc.localDescription });
    } else if (data.type === 'answer'){
      await pc.setRemoteDescription(new RTCSessionDescription(data));
    } else if (data.candidate){
      try { await pc.addIceCandidate(new RTCIceCandidate(data)); } catch(e){}
    }
  });

  socket.on('room-users', (ids) => {
    const others = ids.filter(id => id !== myId);
    // أنشئ اتصالات جديدة مع أي مستخدم جديد
    others.forEach(id => {
      if (!peers[id]) {
        const pc = createPeer(id, true);
        makeOffer(id, pc);
      }
    });
    // احذف المنقطعين
    Object.keys(peers).forEach(id => {
      if (!others.includes(id)) removePeer(id);
    });
  });
}

function createPeer(peerId){
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peers[peerId] = pc;

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('signal', { to: peerId, data: e.candidate });
  };

  pc.ontrack = (e) => {
    renderPeerMedia(peerId, e.streams[0]);
  };

  // أضف تراكاتي لو عندي
  if (localStream){
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  }
  return pc;
}

async function makeOffer(peerId, pc){
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('signal', { to: peerId, data: pc.localDescription });
}

function removePeer(id){
  const pc = peers[id];
  if (pc){ pc.close(); delete peers[id]; }
  const el = document.getElementById('peer-' + id);
  if (el) el.remove();
}

function renderPeerMedia(peerId, stream){
  let wrap = document.getElementById('peer-' + peerId);
  if (!wrap){
    wrap = document.createElement('div');
    wrap.id = 'peer-' + peerId;
    wrap.className = 'peer';
    const v = document.createElement('video');
    v.autoplay = true; v.playsInline = true;
    v.id = 'peer-video-' + peerId;
    wrap.appendChild(v);
    const a = document.createElement('audio');
    a.autoplay = true;
    a.id = 'peer-audio-' + peerId;
    wrap.appendChild(a);
    peersDiv.appendChild(wrap);
  }
  const hasVideo = stream.getVideoTracks().length > 0;
  const vEl = document.getElementById('peer-video-' + peerId);
  const aEl = document.getElementById('peer-audio-' + peerId);
  if (hasVideo){ vEl.srcObject = stream; aEl.srcObject = null; }
  else { aEl.srcObject = stream; vEl.srcObject = null; }
}

async function ensureMedia(){
  if (!localStream){
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: camOn });
    localAudio.srcObject = localStream;
    if (camOn) localVideo.srcObject = localStream;
  } else {
    const a = localStream.getAudioTracks()[0]; if (a) a.enabled = micOn;
    const v = localStream.getVideoTracks()[0]; if (v) v.enabled = camOn;
  }

  // تأكد أن كل الـ peers يستلمون التراكات الجديدة
  Object.values(peers).forEach(pc => {
    if (!localStream) return;
    const senders = pc.getSenders();
    localStream.getTracks().forEach(track => {
      const s = senders.find(x => x.track && x.track.kind === track.kind);
      if (s) s.replaceTrack(track); else pc.addTrack(track, localStream);
    });
  });
}

joinBtn.onclick = async () => {
  const name = (nameInput.value || 'ضيف').slice(0, 32);
  roomId = (roomInput.value || 'majlis-1').slice(0, 64);

  if (!socket) connectSocket();

  micOn = true; camOn = false;
  await ensureMedia();

  socket.emit('join-room', { roomId, name });
  joinBtn.disabled = true;
  leaveBtn.disabled = false;
  toggleMic.textContent = 'كتم المايك';
  toggleCam.textContent = 'تشغيل الكام';
};

leaveBtn.onclick = () => {
  if (socket && roomId) socket.emit('leave-room', { roomId });
  Object.keys(peers).forEach(removePeer);
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
};

toggleMic.onclick = async () => {
  micOn = !micOn;
  toggleMic.textContent = micOn ? 'كتم المايك' : 'تشغيل المايك';
  await ensureMedia();
};

toggleCam.onclick = async () => {
  camOn = !camOn;
  toggleCam.textContent = camOn ? 'إيقاف الكام' : 'تشغيل الكام';
  await ensureMedia();
};
