// server.js — Single-Room Wolf-style Chat
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.static(".")); // قدّم الواجهة من نفس المجلد

const server = http.createServer(app);
const io = new Server(server, { cors:{ origin:"*", methods:["GET","POST"] } });

// ذاكرة السيرفر
const users = new Map();       // socket.id -> {name, role}
const bans  = new Map();       // name -> untilTs
const stage = { slots: [null,null,null,null] }; // 4 مقاعد

function isBanned(name){
  const until = bans.get(name);
  if (!until) return false;
  if (Date.now() > until){ bans.delete(name); return false; }
  return true;
}
function broadcastStage(){ io.emit("stage:update", stage); }
function listUsers(){
  const list = [];
  users.forEach(u=>{
    const onStage = stage.slots.some(s=>s && s.name===u.name);
    list.push({ name:u.name, role:u.role, onStage });
  });
  return list;
}

io.on("connection",(socket)=>{
  socket.on("join",({ name, role })=>{
    name = (name||"").trim();
    if (!name){ socket.disconnect(); return; }
    if (isBanned(name)){
      socket.emit("banned", bans.get(name));
      socket.disconnect(); return;
    }
    users.set(socket.id, { name, role: role||"user" });
    socket.data.name = name;
    socket.emit("stage:update", stage);
  });

  socket.on("message",({ text })=>{
    const u = users.get(socket.id);
    if (!u) return;
    const t = String(text||"").trim();
    if (!t) return;
    io.emit("message", { name: u.name, role: u.role, text: t, ts: Date.now() });
  });

  socket.on("stage:request",()=> socket.emit("stage:update", stage));

  socket.on("stage:toggle",({ index, forceDown })=>{
    const u = users.get(socket.id);
    if (!u) return;
    if (typeof index!=="number" || index<0 || index>3) return;

    if (forceDown){
      const myIdx = stage.slots.findIndex(s=>s && s.name===u.name);
      if (myIdx!==-1) stage.slots[myIdx] = null;
      broadcastStage(); return;
    }

    // إذا كان في نفس الخانة -> نزّل
    if (stage.slots[index] && stage.slots[index].name === u.name){
      stage.slots[index] = null; broadcastStage(); return;
    }
    // نزله من أي خانة ثانية
    const exists = stage.slots.findIndex(s=>s && s.name===u.name);
    if (exists!==-1) stage.slots[exists] = null;

    // إذا فاضية ارفعه
    if (!stage.slots[index]) stage.slots[index] = { name:u.name };
    broadcastStage();
  });

  // إدارة — للأونر فقط
  function isOwnerMainSocket(sock){
    const u = users.get(sock.id);
    return u && u.role==="ownerMain";
  }

  socket.on("users:request",()=> socket.emit("users:list", listUsers()));

  socket.on("admin:grant",({ target })=>{
    if (!isOwnerMainSocket(socket)) return;
    for (const [id,u] of users.entries()){
      if (u.name === target){ u.role="admin"; users.set(id,u); }
    }
  });
  socket.on("admin:revoke",({ target })=>{
    if (!isOwnerMainSocket(socket)) return;
    for (const [id,u] of users.entries()){
      if (u.name === target){ u.role="user"; users.set(id,u); }
    }
  });
  socket.on("admin:kick",({ target, reason })=>{
    if (!isOwnerMainSocket(socket)) return;
    for (const [id,u] of users.entries()){
      if (u.name === target){
        const s = io.sockets.sockets.get(id);
        if (s){ s.emit("kicked", reason||""); s.disconnect(true); }
        const idx = stage.slots.findIndex(s=>s && s.name===u.name);
        if (idx!==-1) stage.slots[idx]=null;
      }
    }
    broadcastStage();
  });
  socket.on("admin:tempban2h",({ target })=>{
    if (!isOwnerMainSocket(socket)) return;
    const until = Date.now()+2*60*60*1000;
    bans.set(target, until);
    for (const [id,u] of users.entries()){
      if (u.name===target){
        const s = io.sockets.sockets.get(id);
        if (s){ s.emit("banned", until); s.disconnect(true); }
        const idx = stage.slots.findIndex(s=>s && s.name===u.name);
        if (idx!==-1) stage.slots[idx]=null;
      }
    }
    broadcastStage();
  });

  socket.on("disconnect",()=>{
    const u = users.get(socket.id);
    if (u){
      const idx = stage.slots.findIndex(s=>s && s.name===u.name);
      if (idx!==-1) stage.slots[idx] = null;
    }
    users.delete(socket.id);
    broadcastStage();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log("Single-Room Wolf-style server on http://localhost:"+PORT));
