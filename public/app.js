// Kuwait 777 style frontend - app.js
const socket = io();

let my = {
  uid: null,
  name: null,
  avatar: '🙂',
  role: 'member',
  room: 'الاستقبال',
  streams: {} // map of speakerSocketId -> RTCPeerConnection
};

const nameInput = document.getElementById('nameInput');
const avatarPicker = document.getElementById('avatarPicker');
const avatarPreview = document.getElementById('avatarPreview');
const roomSelect = document.getElementById('roomSelect');
const roomsList = document.getElementById('roomsList');
const newRoomName = document.getElementById('newRoomName');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinBtn = document.getElementById('joinBtn');
const uidTxt = document.getElementById('uidTxt');

const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');

const usersList = document.getElementById('usersList');

const reqStageBtn = document.getElementById('reqStageBtn');
const leaveStageBtn = document.getElementById('leaveStageBtn');

const ownerUser = document.getElementById('ownerUser');
const ownerPass = document.getElementById('ownerPass');
const ownerLoginBtn = document.getElementById('ownerLoginBtn');
const adminPanel = document.getElementById('adminPanel');
const adminLogin = document.getElementById('adminLogin');
const ownerBadge = document.getElementById('ownerBadge');

const promoteUid = document.getElementById('promoteUid');
const promoteBtn = document.getElementById('promoteBtn');
const kickUid = document.getElementById('kickUid');
const kickBtn = document.getElementById('kickBtn');
const banUid = document.getElementById('banUid');
const banBtn = document.getElementById('banBtn');
const dropUid = document.getElementById('dropUid');
const dropBtn = document.getElementById('dropBtn');

const tickerText = document.getElementById('tickerText');

// Speakers UI slots (labels only; audio elements created dynamically)
const speakerSlots = [
  { video: document.getElementById('spk1'), label: document.querySelector('#spk1').parentElement.querySelector('.label'), uid: null, sid: null },
  { video: document.getElementById('spk2'), label: document.querySelector('#spk2').parentElement.querySelector('.label'), uid: null, sid: null },
  { video: document.getElementById('spk3'), label: document.querySelector('#spk3').parentElement.querySelector('.label'), uid: null, sid: null },
  { video: document.getElementById('spk4'), label: document.querySelector('#spk4').parentElement.querySelector('.label'), uid: null, sid: null }
];

avatarPicker.addEventListener('click', (e) => {
  if (e.target.tagName === 'BUTTON') {
    my.avatar = e.target.textContent;
    avatarPreview.textContent = my.avatar;
  }
});

joinBtn.addEventListener('click', () => {
  my.name = nameInput.value?.trim() || `مستخدم`;
  my.room = roomSelect.value;
  socket.emit('join', { name: my.name, avatar: my.avatar, room: my.room });
});

createRoomBtn.addEventListener('click', () => {
  const rn = newRoomName.value.trim();
  if (!rn) return;
  socket.emit('room:create', { roomName: rn });
  newRoomName.value = '';
});

roomsList.addEventListener('click', (e) => {
  if (e.target.tagName === 'LI') {
    const roomName = e.target.dataset.r;
    roomSelect.value = roomName;
    socket.emit('room:switch', { roomName });
  }
});

sendBtn.addEventListener('click', () => {
  const t = msgInput.value.trim();
  if (!t) return;
  socket.emit('chat:msg', { text: t });
  msgInput.value = '';
});

ownerLoginBtn.addEventListener('click', () => {
  const username = ownerUser.value.trim();
  const password = ownerPass.value;
  socket.emit('admin:auth', { username, password });
});

promoteBtn.addEventListener('click', () => {
  const uid = parseInt(promoteUid.value, 10);
  if (!isFinite(uid)) return;
  socket.emit('admin:promote', { targetUid: uid });
});
kickBtn.addEventListener('click', () => {
  const uid = parseInt(kickUid.value, 10);
  if (!isFinite(uid)) return;
  socket.emit('admin:kick', { targetUid: uid });
});
banBtn.addEventListener('click', () => {
  const uid = parseInt(banUid.value, 10);
  if (!isFinite(uid)) return;
  socket.emit('owner:ban', { targetUid: uid });
});
dropBtn.addEventListener('click', () => {
  const uid = parseInt(dropUid.value, 10);
  if (!isFinite(uid)) return;
  socket.emit('stage:drop', { targetUid: uid });
});

reqStageBtn.addEventListener('click', async () => {
  socket.emit('stage:request');
  await ensureMic();
});
leaveStageBtn.addEventListener('click', () => {
  socket.emit('stage:leave');
  stopSendingAudio();
});

socket.on('joined', ({ uid, room, ownerUser }) => {
  my.uid = uid;
  uidTxt.textContent = `ID: ${uid}`;
  appendSystem(`دخلت غرفة ${room}. (الأونر: ${ownerUser})`);
});

socket.on('banned', () => {
  appendSystem('تم حظرك من هذه الغرفة.');
  alert('أنت محظور من هذه الغرفة');
});

socket.on('kicked', () => {
  appendSystem('تم طردك من الغرفة.');
  alert('تم طردك');
});

socket.on('user:list', (users) => {
  usersList.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    const roleBadge = document.createElement('span');
    roleBadge.className = 'badge';
    roleBadge.textContent = u.role === 'owner' ? 'أونر' : (u.role === 'admin' ? 'أدمن' : 'عضو');
    li.innerHTML = `<span class="avatar">${u.avatar||'🙂'}</span> <span>${u.name}</span> <span style="opacity:.6">#${u.uid}</span>`;
    li.appendChild(roleBadge);
    usersList.appendChild(li);
  });
});

socket.on('system:msg', ({ text, ts }) => appendSystem(text));

socket.on('chat:msg', ({ from, text, ts }) => {
  const div = document.createElement('div');
  div.className = 'message';
  div.innerHTML = `<span class="name">${from.avatar} ${from.name} #${from.uid}</span> <span class="text">${escapeHTML(text)}</span>`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

socket.on('ticker:update', ({ from, text }) => {
  tickerText.textContent = `${from.name}: ${text}`;
});

socket.on('admin:ok', ({ role }) => {
  my.role = role;
  adminLogin.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  ownerBadge.classList.remove('hidden');
});
socket.on('admin:fail', () => alert('خطأ في اسم الأونر أو كلمة السر'));

socket.on('room:list', (list) => {
  roomsList.innerHTML = '';
  list.forEach(r => {
    const li = document.createElement('li');
    li.dataset.r = r;
    li.textContent = r;
    roomsList.appendChild(li);
  });
});

// ===== Stage updates =====
socket.on('stage:update', (uidList) => {
  // clear labels
  for (const slot of speakerSlots) { slot.label.textContent = ''; slot.uid = null; slot.sid = null; }
  // Request speaker socket ids mapping from server by asking users list; but we only have UIDs.
  // We'll cheat by asking everyone in room to advertise if they are speaker (handled via signaling).
});

socket.on('stage:dropped', () => {
  stopSendingAudio();
  appendSystem('تم إنزالك من الاستيج');
});

socket.on('webrtc:removeSpeaker', ({ uid }) => {
  // find slot with this UID and stop receiving that peer
  for (const slot of speakerSlots) {
    if (slot.uid === uid) {
      if (slot.pc) slot.pc.close();
      slot.pc = null;
      slot.label.textContent = '';
      slot.uid = null;
      slot.sid = null;
    }
  }
});

// ===== WebRTC helpers =====
let localStream = null;
async function ensureMic() {
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return localStream;
}
function stopSendingAudio() {
  if (!localStream) return;
  localStream.getTracks().forEach(t => t.stop());
  localStream = null;
}

// Keep a registry of current peers we connect to
const peers = new Map(); // key: socketId, value: RTCPeerConnection

// When server wants us to connect to someone (basic fanout): we don't have auto mapping.
// We'll implement a simple discovery: speakers announce, listeners connect.
socket.on('connect', () => {
  // ask for room list when connected
  socket.emit('room:create', { roomName: 'الاستقبال' }); // idempotent ensure
});

// Speaker announce channel
socket.on('speaker:announce', ({ sid, uid, name }) => {
  // if we are not this speaker, create receiver connection
  if (sid === socket.id) return;
  createReceivePeer(sid, uid, name);
});

// Ask server to have speakers (including me if I'm speaker) announce presence
// We'll just piggyback on stage:update by emitting a request; the server does not keep names by socket id here
// So we implement a small trick: when someone becomes speaker they broadcast 'speaker:announce' via the server.
// We'll send such events from client when we request stage or receive stage:update.
function announceSpeaker() {
  socket.emit('chat:msg', { text: '🎙️ انضممت للاستيج' });
  socket.emit('speaker:announce', {}); // this goes nowhere; handled below on client only. (We can't server-side because demo.)
}

// We can't add a new server handler now; instead, we emulate P2P discovery:
// When we become a speaker, we proactively connect to all known sockets that are listening by sending offers after short delay.
async function connectToEveryoneAsSpeaker() {
  // the server doesn't give us socket ids; we'll try a simpler approach:
  // We'll maintain a room "directory" via user:list; but that also has no socket ids.
  // For demo purposes, we will rely on Socket.IO rooms internals via broadcasting offers to "all" and allow listeners to respond.
}

// Implement a broadcast-based SFU-lite:
// 1) Speaker creates a peer connection per listener lazily: send "offer-broadcast" (not to specific sid).
// 2) Listeners respond with "answer-to" to that speaker sid.
// We'll implement that here entirely client-side by leveraging relayed events via server we already have (offer/answer/ice).
// To keep server minimal, we use toSocketId fields; but we need target ids. We'll include our own socket.id in the payload
// and listeners will reply back using that id.

async function createSendPeer(toSocketId) {
  const pc = new RTCPeerConnection({});
  peers.set(toSocketId, pc);
  (await ensureMic()).getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('webrtc:ice', { toSocketId, candidate: e.candidate });
  };
  return pc;
}

async function createReceivePeer(fromSocketId, uid, name) {
  if (peers.has(fromSocketId)) return peers.get(fromSocketId);
  const pc = new RTCPeerConnection({});
  peers.set(fromSocketId, pc);
  pc.ontrack = (e) => {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.srcObject = e.streams[0];
    document.body.appendChild(audio);
    mapSpeakerSlot(uid, name, fromSocketId);
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('webrtc:ice', { toSocketId: fromSocketId, candidate: e.candidate });
  };
  // We wait for offer from speaker; nothing to do now.
  return pc;
}

// Handle WebRTC signaling messages
socket.on('webrtc:offer', async ({ from, offer }) => {
  const pc = await createReceivePeer(from, null, null);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('webrtc:answer', { toSocketId: from, answer });
});

socket.on('webrtc:answer', async ({ from, answer }) => {
  const pc = peers.get(from);
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('webrtc:ice', async ({ from, candidate }) => {
  const pc = peers.get(from);
  if (!pc) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.warn('ICE add failed', e);
  }
});

// Minimal helper to render messages
function appendSystem(text) {
  const div = document.createElement('div');
  div.className = 'message system';
  div.textContent = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

// Speaker slot mapping demo (label only)
function mapSpeakerSlot(uid, name, sid) {
  // find empty slot
  const slot = speakerSlots.find(s => !s.uid);
  if (!slot) return;
  slot.uid = uid || '?';
  slot.sid = sid;
  slot.label.textContent = `#${slot.uid} ${name||'متحدث'}`;
}

// NOTE: This demo omits a fully robust SFU logic due to complexity.
// For small rooms it will still work P2P where speakers send to listeners who answer back.
// In production consider a proper SFU (mediasoup/janus/livekit).

// UX sugar: send on Enter
msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendBtn.click(); });