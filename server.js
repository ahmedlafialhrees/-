// ===== Kuwait 777 — server (stage + chat) =====
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
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(cookie());
app.use(bodyParser.json({ limit: '2mb' }));

// نخدّم index.html من الجذر
app.get('/', (_req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(fs.readFileSync(path.join(__dirname,'index.html'),'utf8'));
});

// ===== الحسابات البسيطة (ذاكرة مؤقتة) =====
const OWNER_MAIN = { username:'owner', password:'66773707' };
const accounts = new Map(); // username -> {username,password,role}
accounts.set('admin1', { username:'admin1', password:'1234', role:'admin' });

// ===== غرفة واحدة + استيج =====
const roomName = 'الاستقبال';
const rooms = { [roomName]: { users:new Map(), speakers:new Set() } };
let nextUid = 1;
const pub = u => ({ uid:u.uid, name:u.name, role:u.role, avatar:u.avatar });

io.on('connection', (socket)=>{
  socket.on('join', ({ displayName, role, loginUser, loginPass, avatar })=>{
    // تحقّق الدور
    let eff = 'member';
    if(role==='owner'){
      const ok = (loginUser===OWNER_MAIN.username && loginPass===OWNER_MAIN.password) ||
                 (accounts.has(loginUser) && accounts.get(loginUser).password===loginPass && accounts.get(loginUser).role==='owner');
      if(!ok) return socket.emit('auth:fail');
      eff = 'owner';
    } else if (role==='admin'){
      const ok = accounts.has(loginUser) && accounts.get(loginUser).password===loginPass && accounts.get(loginUser).role==='admin';
      if(!ok) return socket.emit('auth:fail');
      eff = 'admin';
    }

    const uid = nextUid++;
    const user = {
      uid,
      name: String(displayName||'مستخدم').slice(0,32),
      role: eff,
      avatar: avatar || '🙂',
      room: roomName,
    };
    socket.data.user = user;
    rooms[roomName].users.set(socket.id, user);
    socket.join(roomName);

    // ترحيب للداخل فقط
    socket.emit('welcome', { text:`🎉 مرحباً بك يا ${user.name} في الدردشة الصوتية!` });

    // مزامنة للجميع
    io.to(roomName).emit('user:list', [...rooms[roomName].users.values()].map(pub));
    socket.emit('stage:update', stageSnap());

    // إشعار دخول
    io.to(roomName).emit('system:msg', { text:`${user.name} دخل الغرفة` });
    socket.emit('joined', { uid, role: eff });
  });

  socket.on('chat:msg', ({ text })=>{
    const u = socket.data.user; if(!u) return;
    const payload = { from: pub(u), text: String(text||'').slice(0,500), ts: Date.now() };
    io.to(u.room).emit('chat:msg', payload);
    io.to(u.room).emit('ticker:update', payload);
  });

  // طلب الصعود للنص/الاستيج (5 أماكن)
  socket.on('stage:request', ()=>{
    const u = socket.data.user; if(!u) return;
    const r = rooms[u.room];
    if(r.speakers.size >= 5) return socket.emit('stage:full');
    r.speakers.add(socket.id);
    io.to(u.room).emit('stage:update', stageSnap());
    io.to(u.room).emit('system:msg', { text:`📢 ${u.name} صعد الاستيج` });
  });

  socket.on('stage:leave', ()=>{
    const u = socket.data.user; if(!u) return;
    const r = rooms[u.room];
    r.speakers.delete(socket.id);
    io.to(u.room).emit('stage:update', stageSnap());
    io.to(u.room).emit('system:msg', { text:`⬇️ ${u.name} نزل من الاستيج` });
  });

  // صلاحيات
  socket.on('stage:drop', ({ targetUid })=>{
    const u = socket.data.user; if(!u || !['owner','admin'].includes(u.role)) return;
    const r = rooms[u.room];
    for (const [sid, usr] of r.users) if (usr.uid===targetUid){
      r.speakers.delete(sid);
      io.to(u.room).emit('stage:update', stageSnap());
      io.to(u.room).emit('system:msg', { text:`${usr.name} تم إنزاله من الاستيج` });
      io.to(sid).emit('stage:dropped');
    }
  });

  socket.on('admin:kick', ({ targetUid })=>{
    const u = socket.data.user; if(!u || !['owner','admin'].includes(u.role)) return;
    const r = rooms[u.room];
    for (const [sid, usr] of r.users) if (usr.uid===targetUid){
      io.to(sid).emit('kicked');
      r.users.delete(sid); r.speakers.delete(sid);
      io.to(u.room).emit('user:list', [...r.users.values()].map(pub));
      io.to(u.room).emit('stage:update', stageSnap());
      io.to(u.room).emit('system:msg', { text:`${usr.name} طُرد` });
    }
  });

  socket.on('disconnect', ()=>{
    const u = socket.data.user; if(!u) return;
    const r = rooms[u.room]; if(!r) return;
    r.users.delete(socket.id); r.speakers.delete(socket.id);
    io.to(u.room).emit('user:list', [...r.users.values()].map(pub));
    io.to(u.room).emit('stage:update', stageSnap());
  });
});

function stageSnap(){
  const r = rooms[roomName];
  return [...r.speakers].slice(0,5).map(sid => {
    const u = r.users.get(sid);
    return u ? pub(u) : null;
  }).filter(Boolean);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server on http://localhost:'+PORT));
