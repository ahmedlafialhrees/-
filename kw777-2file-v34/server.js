// ===== Kuwait 777 — 2-file build v3.4 (server.js + index.html) =====
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookie = require('cookie-parser');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST","PUT","DELETE"] } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(cookie());
app.use(bodyParser.json({ limit: '2mb' }));

// Serve inline UI
const INDEX_PATH = path.join(__dirname, 'index.html');
app.get('/', (_req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(fs.readFileSync(INDEX_PATH, 'utf8'));
});

// ===== Accounts (in-memory) =====
const OWNER_MAIN = { username:'owner', password:'66773707', role:'owner_main' };
/** username -> { username, password, role: 'owner'|'admin' } */
const accounts = new Map();
// seed example (you can delete later from control panel)
accounts.set('admin1', { username:'admin1', password:'1234', role:'admin' });

function isOwnerMainSecret(req){ return req.headers['x-owner-secret'] === OWNER_MAIN.password; }

// REST for owner main
app.get('/api/accounts', (req,res)=>{ if(!isOwnerMainSecret(req)) return res.status(401).json({error:'unauthorized'}); res.json({ accounts:[...accounts.values()] }); });
app.post('/api/accounts', (req,res)=>{
  if(!isOwnerMainSecret(req)) return res.status(401).json({error:'unauthorized'});
  const { username, password, role } = req.body||{};
  if(!username || !password || !['owner','admin'].includes(role)) return res.status(400).json({error:'bad_input'});
  accounts.set(username, { username, password, role }); res.json({ ok:true });
});
app.put('/api/accounts/:u', (req,res)=>{
  if(!isOwnerMainSecret(req)) return res.status(401).json({error:'unauthorized'});
  const u = accounts.get(req.params.u); if(!u) return res.status(404).json({error:'not_found'});
  const { username, password, role } = req.body||{};
  if(username && username!==req.params.u){ accounts.delete(req.params.u); u.username = username; }
  if(password) u.password = password;
  if(role && ['owner','admin'].includes(role)) u.role = role;
  accounts.set(u.username, u); res.json({ ok:true });
});
app.delete('/api/accounts/:u', (req,res)=>{ if(!isOwnerMainSecret(req)) return res.status(401).json({error:'unauthorized'}); accounts.delete(req.params.u); res.json({ ok:true }); });

// ===== Realtime Chat =====
const rooms = {}; // roomName -> { users: Map(socketId->user), speakers:Set(socketId) }
let nextUid = 1;
function ensureRoom(n){ if(!rooms[n]) rooms[n] = { users:new Map(), speakers:new Set() }; }
ensureRoom('الاستقبال');

function pubUser(u){ return { uid:u.uid, name:u.name, avatar:u.avatar, role:u.role }; }
function stageSnapshot(room){
  const r = rooms[room]; if(!r) return [];
  return [...r.speakers].map(sid => { const u = r.users.get(sid); return u ? pubUser(u) : null; }).filter(Boolean);
}

io.on('connection', (socket)=>{
  socket.on('join', ({ displayName, role, avatarDataUrl, loginUser, loginPass, room })=>{
    const roomName = room || 'الاستقبال'; ensureRoom(roomName);

    // role auth
    let effective = 'member';
    if(role==='owner'){
      if ((loginUser==='owner' && loginPass===OWNER_MAIN.password) ||
          (accounts.has(loginUser) && accounts.get(loginUser).password===loginPass && accounts.get(loginUser).role==='owner')) {
        effective = 'owner';
      } else { socket.emit('auth:fail'); return; }
    } else if (role==='admin'){
      if (accounts.has(loginUser) && accounts.get(loginUser).password===loginPass && accounts.get(loginUser).role==='admin'){
        effective = 'admin';
      } else { socket.emit('auth:fail'); return; }
    }

    // register
    const uid = nextUid++;
    socket.data.user = {
      uid, name:(displayName||'مستخدم').slice(0,32), avatar:avatarDataUrl||'🙂', role:effective, room:roomName
    };
    const r = rooms[roomName]; r.users.set(socket.id, socket.data.user); socket.join(roomName);

    // personal welcome (only to the joiner)
    socket.emit('welcome', { text:`🎉 مرحباً بك يا ${socket.data.user.name} في الدردشة الصوتية!`, ts:Date.now() });

    // broadcast join
    io.to(roomName).emit('system:msg', { text: `${socket.data.user.name} دخل الغرفة`, ts:Date.now() });

    // sync
    socket.emit('joined', { uid, role:effective });
    io.to(roomName).emit('user:list', [...r.users.values()].map(pubUser));
    socket.emit('stage:update', stageSnapshot(roomName));
  });

  socket.on('chat:msg', ({ text })=>{
    const u = socket.data.user; if(!u) return;
    const payload = { from: pubUser(u), text: String(text||'').slice(0,500), ts: Date.now() };
    io.to(u.room).emit('chat:msg', payload);
    io.to(u.room).emit('ticker:update', payload);
  });

  // stage (5 gold mic slots)
  socket.on('stage:request', ()=>{
    const u = socket.data.user; if(!u) return; const r = rooms[u.room];
    if(r.speakers.size >= 5) return socket.emit('stage:full');
    r.speakers.add(socket.id);
    io.to(u.room).emit('stage:update', stageSnapshot(u.room));
    io.to(u.room).emit('system:msg', { text:`📢 ${u.name} صعد الاستيج`, ts:Date.now() });
  });
  socket.on('stage:leave', ()=>{
    const u = socket.data.user; if(!u) return; const r = rooms[u.room];
    r.speakers.delete(socket.id);
    io.to(u.room).emit('stage:update', stageSnapshot(u.room));
    io.to(u.room).emit('system:msg', { text:`⬇️ ${u.name} نزل من الاستيج`, ts:Date.now() });
  });

  // moderation
  socket.on('stage:drop', ({ targetUid })=>{
    const u = socket.data.user; if(!u || !['owner','admin'].includes(u.role)) return; const r = rooms[u.room];
    for (const [sid, usr] of r.users) if (usr.uid===targetUid){
      r.speakers.delete(sid); io.to(u.room).emit('stage:update', stageSnapshot(u.room));
      io.to(sid).emit('stage:dropped'); io.to(u.room).emit('system:msg', { text:`${usr.name} تم إنزاله من الاستيج`, ts:Date.now() });
    }
  });
  socket.on('admin:kick', ({ targetUid })=>{
    const u = socket.data.user; if(!u || !['owner','admin'].includes(u.role)) return; const r = rooms[u.room];
    for (const [sid, usr] of r.users) if (usr.uid===targetUid){
      io.to(sid).emit('kicked'); r.users.delete(sid); r.speakers.delete(sid);
      io.to(u.room).emit('user:list', [...r.users.values()].map(pubUser));
      io.to(u.room).emit('stage:update', stageSnapshot(u.room));
      io.to(u.room).emit('system:msg', { text:`${usr.name} طُرد`, ts:Date.now() });
    }
  });
  socket.on('admin:promote', ({ targetUid })=>{
    const u = socket.data.user; if(!u || u.role!=='owner') return; const r = rooms[u.room];
    for (const [sid, usr] of r.users) if (usr.uid===targetUid){
      usr.role = 'admin';
      io.to(u.room).emit('user:list', [...r.users.values()].map(pubUser));
      io.to(u.room).emit('system:msg', { text:`${usr.name} أصبح أدمن`, ts:Date.now() });
    }
  });
  socket.on('owner:rename', ({ targetUid, newName })=>{
    const u = socket.data.user; if(!u || u.role!=='owner') return; const r = rooms[u.room];
    for (const [sid, usr] of r.users) if (usr.uid===targetUid){
      const old = usr.name; usr.name = String(newName||'مستخدم').slice(0,32);
      io.to(u.room).emit('user:list', [...r.users.values()].map(pubUser));
      io.to(u.room).emit('stage:update', stageSnapshot(u.room));
      io.to(u.room).emit('system:msg', { text:`تم تغيير اسم ${old} إلى ${usr.name}`, ts:Date.now() });
    }
  });

  socket.on('disconnect', ()=>{
    const u = socket.data.user; if(!u) return; const r = rooms[u.room]; if(!r) return;
    r.users.delete(socket.id); r.speakers.delete(socket.id);
    io.to(u.room).emit('user:list', [...r.users.values()].map(pubUser));
    io.to(u.room).emit('stage:update', stageSnapshot(u.room));
    io.to(u.room).emit('system:msg', { text:`${u.name} خرج`, ts:Date.now() });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server on http://localhost:'+PORT));
