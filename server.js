// Kuwait 777 style voice chat - server.js
// Simple Express + Socket.IO signaling server with rooms, chat, admin panel, kick, and stage (max 4 speakers).

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(cookieParser());
app.use(express.static('public'));

// ======= Config =======
// Change owner credentials as you like
const OWNER_USERNAME = process.env.OWNER_USERNAME || "owner";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "66773707"; // demo only; change in prod!

// ======= In-memory data =======
let nextUserAutoId = 1;

const rooms = {}; 
// rooms[roomName] = {
//   createdAt, createdBy,
//   users: Map<socket.id, {uid, name, avatar, role: 'member'|'admin'|'owner'}>,
//   speakers: Set<socket.id>, // max 4
//   bans: Set<uid> // kicked/banned user ids
// }

// default room
function ensureRoom(roomName, createdBy = 'system') {
  if (!rooms[roomName]) {
    rooms[roomName] = {
      createdAt: Date.now(),
      createdBy,
      users: new Map(),
      speakers: new Set(),
      bans: new Set()
    };
  }
}
ensureRoom('الاستقبال');

function userSummary(u) {
  return { uid: u.uid, name: u.name, avatar: u.avatar, role: u.role };
}

io.on('connection', (socket) => {
  // ===== Join =====
  socket.on('join', ({ name, avatar, room }) => {
    const roomName = room || 'الاستقبال';
    ensureRoom(roomName);

    // assign auto ID
    const uid = nextUserAutoId++;
    const role = 'member';

    // store basic info
    socket.data.user = { uid, name, avatar, role, room: roomName };
    const r = rooms[roomName];

    if (r.bans.has(uid)) {
      socket.emit('banned');
      return;
    }

    r.users.set(socket.id, socket.data.user);
    socket.join(roomName);

    io.to(roomName).emit('user:list', Array.from(r.users.values()).map(userSummary));
    socket.emit('joined', { uid, room: roomName, ownerUser: OWNER_USERNAME });
    io.to(roomName).emit('system:msg', { text: `${name} دخل الغرفة`, ts: Date.now() });
  });

  // ===== Chat messages =====
  socket.on('chat:msg', ({ text }) => {
    const u = socket.data.user;
    if (!u) return;
    const payload = { from: userSummary(u), text, ts: Date.now() };
    io.to(u.room).emit('chat:msg', payload);
    io.to(u.room).emit('ticker:update', payload);
  });

  // ===== Rooms =====
  socket.on('room:create', ({ roomName }) => {
    const u = socket.data.user;
    if (!u) return;
    ensureRoom(roomName, u.name);
    socket.emit('room:created', roomName);
    io.emit('room:list', Object.keys(rooms));
  });

  socket.on('room:switch', ({ roomName }) => {
    const u = socket.data.user;
    if (!u) return;
    ensureRoom(roomName, u.name);
    const oldRoom = u.room;
    rooms[oldRoom]?.users.delete(socket.id);
    socket.leave(oldRoom);

    u.room = roomName;
    rooms[roomName].users.set(socket.id, u);
    socket.join(roomName);

    io.to(oldRoom).emit('user:list', Array.from(rooms[oldRoom].users.values()).map(userSummary));
    io.to(roomName).emit('user:list', Array.from(rooms[roomName].users.values()).map(userSummary));
    io.to(roomName).emit('system:msg', { text: `${u.name} دخل ${roomName}`, ts: Date.now() });
  });

  // ===== Admin / Owner auth (simple demo) =====
  socket.on('admin:auth', ({ username, password }) => {
    const u = socket.data.user;
    if (!u) return;
    if (username === OWNER_USERNAME && password === OWNER_PASSWORD) {
      u.role = 'owner';
      io.to(u.room).emit('user:list', Array.from(rooms[u.room].users.values()).map(userSummary));
      socket.emit('admin:ok', { role: 'owner' });
    } else {
      socket.emit('admin:fail');
    }
  });

  // Promote to admin (owner only)
  socket.on('admin:promote', ({ targetUid }) => {
    const u = socket.data.user;
    if (!u) return;
    if (u.role !== 'owner') return;

    const r = rooms[u.room];
    for (const [sid, user] of r.users) {
      if (user.uid === targetUid) {
        user.role = 'admin';
        io.to(u.room).emit('user:list', Array.from(r.users.values()).map(userSummary));
        io.to(sid).emit('system:msg', { text: `تم ترقيتك إلى أدمن`, ts: Date.now() });
        break;
      }
    }
  });

  // Kick/Ban (owner or admin can kick; only owner can ban)
  socket.on('admin:kick', ({ targetUid }) => {
    const u = socket.data.user;
    if (!u) return;
    const r = rooms[u.room];
    if (!r) return;

    if (!['owner','admin'].includes(u.role)) return;

    for (const [sid, user] of r.users) {
      if (user.uid === targetUid) {
        io.to(sid).emit('kicked');
        io.sockets.sockets.get(sid)?.leave(u.room);
        r.users.delete(sid);
        if (r.speakers.has(sid)) r.speakers.delete(sid);
        io.to(u.room).emit('user:list', Array.from(r.users.values()).map(userSummary));
        io.to(u.room).emit('system:msg', { text: `${user.name} طُرد من الغرفة`, ts: Date.now() });
        break;
      }
    }
  });

  socket.on('owner:ban', ({ targetUid }) => {
    const u = socket.data.user;
    if (!u || u.role !== 'owner') return;
    const r = rooms[u.room];
    for (const [sid, user] of r.users) {
      if (user.uid === targetUid) {
        r.bans.add(user.uid);
        io.to(sid).emit('banned');
        io.sockets.sockets.get(sid)?.leave(u.room);
        r.users.delete(sid);
        if (r.speakers.has(sid)) r.speakers.delete(sid);
        io.to(u.room).emit('user:list', Array.from(r.users.values()).map(userSummary));
        io.to(u.room).emit('system:msg', { text: `${user.name} تم حظره`, ts: Date.now() });
        break;
      }
    }
  });

  // ===== Stage (speakers) =====
  socket.on('stage:request', () => {
    const u = socket.data.user;
    if (!u) return;
    const r = rooms[u.room];
    if (r.speakers.size >= 4) {
      socket.emit('stage:full');
      return;
    }
    r.speakers.add(socket.id);
    io.to(u.room).emit('stage:update', Array.from(r.speakers).map(sid => r.users.get(sid)?.uid).filter(Boolean));
  });

  socket.on('stage:leave', () => {
    const u = socket.data.user;
    if (!u) return;
    const r = rooms[u.room];
    r?.speakers.delete(socket.id);
    io.to(u.room).emit('stage:update', Array.from(r.speakers).map(sid => r.users.get(sid)?.uid).filter(Boolean));
    // notify peers to stop receiving
    io.to(u.room).emit('webrtc:removeSpeaker', { uid: u.uid });
  });

  // owner/admin can drop speaker from stage
  socket.on('stage:drop', ({ targetUid }) => {
    const u = socket.data.user;
    if (!u) return;
    const r = rooms[u.room];
    if (!r) return;
    if (!['owner','admin'].includes(u.role)) return;

    for (const [sid, user] of r.users) {
      if (user.uid === targetUid) {
        r.speakers.delete(sid);
        io.to(u.room).emit('stage:update', Array.from(r.speakers).map(s => r.users.get(s)?.uid).filter(Boolean));
        io.to(sid).emit('stage:dropped');
      }
    }
  });

  // ===== WebRTC signaling =====
  socket.on('webrtc:offer', ({ toSocketId, offer }) => {
    io.to(toSocketId).emit('webrtc:offer', { from: socket.id, offer });
  });
  socket.on('webrtc:answer', ({ toSocketId, answer }) => {
    io.to(toSocketId).emit('webrtc:answer', { from: socket.id, answer });
  });
  socket.on('webrtc:ice', ({ toSocketId, candidate }) => {
    io.to(toSocketId).emit('webrtc:ice', { from: socket.id, candidate });
  });

  // ===== Disconnect =====
  socket.on('disconnect', () => {
    const u = socket.data.user;
    if (!u) return;
    const r = rooms[u.room];
    if (!r) return;

    r.users.delete(socket.id);
    if (r.speakers.has(socket.id)) {
      r.speakers.delete(socket.id);
      io.to(u.room).emit('stage:update', Array.from(r.speakers).map(sid => r.users.get(sid)?.uid).filter(Boolean));
      io.to(u.room).emit('webrtc:removeSpeaker', { uid: u.uid });
    }
    io.to(u.room).emit('user:list', Array.from(r.users.values()).map(userSummary));
    io.to(u.room).emit('system:msg', { text: `${u.name} خرج`, ts: Date.now() });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));