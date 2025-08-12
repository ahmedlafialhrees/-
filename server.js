import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.get('/', (req,res)=> res.send('OK'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

// إعدادات كلمات السر والأونر
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const OWNER_PASS = process.env.OWNER_PASS || 'owner123';
const MAIN_OWNER_NAME = process.env.MAIN_OWNER_NAME || ''; // اختياري

// ذاكرات
const users = new Map(); // id -> {id,name,role,ip}
const bans = new Map();  // ip -> ts
const stage = [null,null,null,null];

function ipOf(socket){
  const xf = socket.handshake.headers['x-forwarded-for'];
  return (xf ? xf.split(',')[0].trim() : socket.handshake.address) || socket.id;
}
function broadcastUsers(){
  const list = [...users.values()].map(u=>({id:u.id, name:u.name, role:u.role}));
  io.emit('users:list', list);
}
function emitStage(){
  const view = stage.map(sid => sid && users.get(sid) ? ({id:sid, name:users.get(sid).name, role:users.get(sid).role}) : null);
  io.emit('stage:update', view);
}
function onStage(socketId){
  const idx = stage.findIndex(s=>s===socketId);
  return idx;
}

// اتصال
io.on('connection', (socket)=>{
  const ip = ipOf(socket);

  socket.on('auth:login', ({name='', adminPass='', ownerPass=''})=>{
    name = String(name).slice(0,24).trim() || 'مستخدم';

    const bannedUntil = bans.get(ip) || 0;
    if (Date.now() < bannedUntil){
      const mins = Math.ceil((bannedUntil-Date.now())/60000);
      socket.emit('auth:error', `محظور لمدة ${mins} دقيقة`);
      socket.disconnect(true);
      return;
    }

    let role = 'user';
    if (ownerPass && ownerPass === OWNER_PASS) role = 'owner';
    else if (adminPass && adminPass === ADMIN_PASS) role = 'admin';

    users.set(socket.id, { id: socket.id, name, role, ip });
    socket.emit('auth:ok', { me: { id: socket.id, name, role } });
    broadcastUsers();
    emitStage();
  });

  socket.on('chat:msg', (txt='')=>{
    const u = users.get(socket.id);
    if(!u) return;
    const text = String(txt).slice(0, 2000).trim();
    if(!text) return;
    io.emit('chat:msg', { text, from: { id:u.id, name:u.name } });
  });

  socket.on('stage:toggle', ()=>{
    const u = users.get(socket.id); if(!u) return;
    const i = onStage(socket.id);
    if (i >= 0) { stage[i] = null; emitStage(); return; }
    const free = stage.findIndex(s=>!s);
    if (free >= 0) { stage[free] = socket.id; emitStage(); }
  });

  socket.on('user:action', ({targetId, action, payload})=>{
    const actor = users.get(socket.id); if(!actor) return;
    const target = users.get(targetId);
    const isOwner = actor.role === 'owner';
    const isAdmin = actor.role === 'admin';
    const isMainOwner = isOwner && (!MAIN_OWNER_NAME || actor.name === MAIN_OWNER_NAME);
    if(!target && action!=='renameSelf') return;

    const doRename = (u,newName)=>{
      u.name = String(newName||'').slice(0,24).trim() || u.name;
    };

    switch(action){
      case 'rename':
        if (!(isAdmin || isOwner)) return;
        doRename(target, payload?.name);
        broadcastUsers(); break;

      case 'removeFromStage':
        if (!(isAdmin || isOwner)) return;
        const idx = onStage(targetId);
        if (idx>=0){ stage[idx]=null; emitStage(); }
        break;

      case 'kick':
        if (!(isAdmin || isOwner)) return;
        io.to(targetId).emit('auth:kicked','تم طردك');
        io.sockets.sockets.get(targetId)?.disconnect(true);
        break;

      case 'tempban2h':
        if (!(isAdmin || isOwner)) return;
        bans.set(target.ip, Date.now()+2*60*60*1000);
        io.to(targetId).emit('auth:kicked','تم حظرك ساعتين');
        io.sockets.sockets.get(targetId)?.disconnect(true);
        break;

      case 'grantAdmin':
        if (!(isOwner)) return;
        target.role = 'admin'; broadcastUsers(); break;
      case 'revokeAdmin':
        if (!(isOwner)) return;
        if (target.role==='admin'){ target.role = 'user'; broadcastUsers(); }
        break;

      case 'grantOwner':
        if (!isMainOwner) return;
        target.role = 'owner'; broadcastUsers(); break;
      case 'revokeOwner':
        if (!isMainOwner) return;
        if (target.role==='owner'){ target.role = 'user'; broadcastUsers(); }
        break;
    }
  });

  socket.on('disconnect', ()=>{
    const idx = onStage(socket.id);
    if (idx>=0) stage[idx]=null;
    users.delete(socket.id);
    broadcastUsers();
    emitStage();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server on :'+PORT));
