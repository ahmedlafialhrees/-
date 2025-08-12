// server.js — Single Room + Bottom Sheet Control + Roles with passwords
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const OWNER_NAME = process.env.OWNER_NAME || "احمد";

const app = express();
app.use(cors());
app.use(express.static(".")); // قدّم الواجهة من نفس المجلد

const server = http.createServer(app);
const io = new Server(server, { cors:{ origin:"*", methods:["GET","POST"] } });

// جلسات
const users = new Map(); // socket.id -> {name, role}
const bans  = new Map(); // name -> untilTs

// صلاحيات مخزّنة (ذاكرة مؤقتة): name -> {role:"admin"|"owner", pass:""}
const allowed = new Map();

function isBanned(name){ const u=bans.get(name); if(!u) return false; if(Date.now()>u){bans.delete(name);return false;} return true; }
function isOwnerMainSocket(sock){ const u = users.get(sock.id); return u && u.role==="ownerMain" && u.name===OWNER_NAME; }

io.on("connection", (socket)=>{
  socket.on("join", ({ name, role, pass })=>{
    name = String(name||"").trim();
    role = String(role||"user");
    pass = String(pass||"");

    if(!name){ socket.disconnect(); return; }
    if(isBanned(name)){ socket.emit("banned", bans.get(name)); socket.disconnect(); return; }

    // تحقّق الأدوار
    if (role === "admin") {
      const rec = allowed.get(name);
      if (!(rec && rec.role==="admin" && rec.pass===pass)) role = "user";
    } else if (role === "owner") {
      const rec = allowed.get(name);
      if (!(rec && rec.role==="owner" && rec.pass===pass)) role = "user";
    } else if (role === "ownerMain") {
      // السماح فقط إذا الاسم يطابق الأونر الرئيسي
      if (name !== OWNER_NAME) role = "user";
    }

    users.set(socket.id, { name, role });
    socket.data.name = name;
  });

  // رسائل
  socket.on("message", ({ text })=>{
    const u = users.get(socket.id); if(!u) return;
    const t = String(text||"").trim(); if(!t) return;
    io.emit("message", { name: u.name, role: u.role, text: t, ts: Date.now() });
  });

  /* إدارة الصلاحيات — للأونر الرئيسي فقط */
  socket.on("roles:request", ()=>{
    if (!isOwnerMainSocket(socket)) return;
    socket.emit("roles:list", Array.from(allowed, ([name, rec]) => ({ name, role: rec.role })));
  });

  socket.on("roles:grant", ({ target, role, pass })=>{
    if (!isOwnerMainSocket(socket)) return;
    target = String(target||"").trim();
    role   = (role==="owner") ? "owner" : "admin";
    pass   = String(pass||"").trim();
    if (!target || !pass) return;

    allowed.set(target, { role, pass });

    // لو المستخدم متصل الآن ونفس الاسم، حدّث دوره فوريًا لو كلمة السر صحيحة
    for (const [id,u] of users.entries()){
      if (u.name === target) {
        u.role = role; users.set(id, u);
      }
    }
    socket.emit("roles:list", Array.from(allowed, ([name, rec]) => ({ name, role: rec.role })));
  });

  socket.on("roles:revoke", ({ target })=>{
    if (!isOwnerMainSocket(socket)) return;
    target = String(target||"").trim(); if(!target) return;

    allowed.delete(target);
    // نزّل دوره لو متصل
    for (const [id,u] of users.entries()){
      if (u.name === target) {
        u.role = "user"; users.set(id, u);
      }
    }
    socket.emit("roles:list", Array.from(allowed, ([name, rec]) => ({ name, role: rec.role })));
  });

  // طرد/حظر (تبقى موجودة لو بغيتها لاحقًا)
  socket.on("admin:kick", ({ target, reason })=>{
    if (!isOwnerMainSocket(socket)) return;
    for (const [id,u] of users.entries()){
      if (u.name===target){
        const s = io.sockets.sockets.get(id);
        if (s){ s.emit("kicked", reason||""); s.disconnect(true); }
      }
    }
  });

  socket.on("admin:tempban2h", ({ target })=>{
    if (!isOwnerMainSocket(socket)) return;
    const until = Date.now()+2*60*60*1000;
    bans.set(target, until);
    for (const [id,u] of users.entries()){
      if (u.name===target){
        const s = io.sockets.sockets.get(id);
        if (s){ s.emit("banned", until); s.disconnect(true); }
      }
    }
  });

  socket.on("disconnect", ()=> { users.delete(socket.id); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log("Chat server on http://localhost:"+PORT));
