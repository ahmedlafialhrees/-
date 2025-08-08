import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'As66773707';

const rooms = new Map();
function ensureRoom(id){
  if(!rooms.has(id)) rooms.set(id, { users:{}, banned:new Set(), locked:false });
  return rooms.get(id);
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('join', ({roomId, name, requestedRole, adminPassword}) => {
    const displayName = (name || 'ضيف').toString().slice(0, 32);
    currentRoom = (roomId || 'default').toString().slice(0, 64);
    const room = ensureRoom(currentRoom);

    if (room.banned.has(displayName)) {
      socket.emit('join-denied', { reason: 'banned' });
      return;
    }

    let role = requestedRole || 'audience';
    if (role === 'owner' && adminPassword !== ADMIN_PASSWORD) {
      role = 'audience';
    }
    if (room.locked && role !== 'owner') {
      socket.emit('join-denied', { reason: 'locked' });
      return;
    }

    socket.join(currentRoom);
    room.users[socket.id] = { name: displayName, role, muted:false, cam:false };
    io.to(currentRoom).emit('room-users', room.users);
    io.to(currentRoom).emit('room-meta', { locked: room.locked, banned: Array.from(room.banned) });
  });

  socket.on('signal', ({to, data}) => io.to(to).emit('signal', { from: socket.id, data }));

  socket.on('me-update', (partial) => {
    if (!currentRoom) return;
    const r = rooms.get(currentRoom);
    if(!r || !r.users[socket.id]) return;
    r.users[socket.id] = { ...r.users[socket.id], ...partial };
    io.to(currentRoom).emit('room-users', r.users);
  });

  socket.on('admin:command', ({ cmd, targetId, targetName }) => {
    if (!currentRoom) return;
    const r = rooms.get(currentRoom);
    if (!r) return;
    const me = r.users[socket.id];
    if (!me || me.role !== 'owner') return;

    switch(cmd){
      case 'promote': if (r.users[targetId]) r.users[targetId].role = 'speaker'; break;
      case 'demote': if (r.users[targetId]) r.users[targetId].role = 'audience'; break;
      case 'kick':
        if (r.users[targetId]) { io.to(targetId).emit('kicked'); io.sockets.sockets.get(targetId)?.leave(currentRoom); delete r.users[targetId]; }
        break;
      case 'ban':
        if (targetName) r.banned.add(targetName);
        if (targetId && r.users[targetId]) { io.to(targetId).emit('banned'); io.sockets.sockets.get(targetId)?.leave(currentRoom); delete r.users[targetId]; }
        break;
      case 'unban': if (targetName) r.banned.delete(targetName); break;
      case 'mute': if (r.users[targetId]) { r.users[targetId].muted = true; io.to(targetId).emit('force-mute'); } break;
      case 'unmute': if (r.users[targetId]) { r.users[targetId].muted = false; io.to(targetId).emit('force-unmute'); } break;
      case 'lock': r.locked = true; break;
      case 'unlock': r.locked = false; break;
    }
    io.to(currentRoom).emit('room-users', r.users);
    io.to(currentRoom).emit('room-meta', { locked: r.locked, banned: Array.from(r.banned) });
  });

  socket.on('rooms:list', () => {
    const list = Array.from(rooms.keys()).map(id => ({ id, count: Object.keys(rooms.get(id).users).length, locked: rooms.get(id).locked }));
    socket.emit('rooms:list', list);
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const r = rooms.get(currentRoom);
    if (r) {
      delete r.users[socket.id];
      if (Object.keys(r.users).length === 0) rooms.delete(currentRoom);
      else {
        io.to(currentRoom).emit('room-users', r.users);
        io.to(currentRoom).emit('room-meta', { locked: r.locked, banned: Array.from(r.banned) });
      }
    }
  });
});

app.get('/', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log('Signaling server :'+PORT));