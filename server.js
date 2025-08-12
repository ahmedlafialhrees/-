// server.js — Single Room + Stage + Roles control (مع حفظ دائم roles.json)
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROLES_PATH = path.join(__dirname, "roles.json");

const OWNER_NAME = process.env.OWNER_NAME || "احمد";

const app = express();
app.use(cors());
app.use(express.static(".")); // قدّم الواجهة من نفس المجلد

const server = http.createServer(app);
const io = new Server(server, { cors:{ origin:"*", methods:["GET","POST"] } });

// جلسات
const users = new Map(); // socket.id -> {name, role}
const bans  = new Map(); // name -> untilTs

// صلاحيات مخزّنة: name -> {role:"admin"|"owner", pass:""}
const allowed = new Map();

// الاستيج (4 خانات)
const stage = { slots: [null,null,null,null] };
const broadcastStage = ()=> io.emit("stage:update", stage);

// تحميل/حفظ الصلاحيات إلى ملف
function loadRoles(){
  try{
    const raw = fs.readFileSync(ROLES_PATH, "utf8");
    const obj = JSON.parse(raw);
    allowed.clear();
    Object.entries(obj).forEach(([name, rec])=>{
      if(rec && (rec.role==="admin" || rec.role==="owner") && typeof rec.pass==="string"){
        allowed.set(name, { role: rec.role, pass: rec.pass });
      }
    });
    console.log("Loaded roles:", allowed.size);
  }catch(e){ /* أول تشغيل بدون ملف */ }
}
function saveRoles(){
  const obj = {};
  for(const [name, rec] of allowed.entries()) obj[name] = rec;
  fs.writeFile(ROLES_PATH, JSON.stringify(obj, null, 2), ()=>{});
}
loadRoles();

function isBanned(name){ const u=bans.get(name); if(!u) return false; if(Date.now()>u){bans.delete(name);return false;} return true; }
function isOwnerMainSocket(sock){ const u = users.get(sock.id); return u && u.role==="ownerMain" && u.name===OWNER_NAME; }

io.on("connection", (socket)=>{
  socket.on("join", ({ name, role, pass })=>{
    name = String(name||"").trim();
    role = String(role||"user");
    pass = String(pass||"");

    if(!name){ socket.disconnect(); return; }
    if(isBanned(name)){ socket.emit("banned", bans.get(name)); socket.disconnect(); return; }

    if (role === "admin") {
      const rec = allowed.get(name);
      if (!(rec && rec.role==="admin" && rec.pass===pass)) role = "user";
    } else if (role === "owner") {
      const rec = allowed.get(name);
      if (!(rec && rec.role==="owner" && rec.pass===pass)) role = "user";
    } else if (role === "ownerMain") {
      if (name !== OWNER_NAME) role = "user";
    }

    users.set(socket.id, { name, role });
    socket.data.name = name;
    socket.emit("stage:update", stage);
  });

  // رسائل
  socket.on("message", ({ text })=>{
    const u = users.get(socket.id); if(!u) return;
    const t = String(text||"").trim(); if(!t) return;
    io.emit("message", { name: u.name, role: u.role, text: t, ts: Date.now() });
  });

  // Stage
  socket.on("stage:request", ()=> socket.emit("stage:update", stage));
  socket.on("stage:toggle", ({ index, forceDown })=>{
    const u = users.get(socket.id); if(!u) return;
    if (typeof index!=="number" || index<0 || index>3) return;

    if (forceDown){
      const myIdx = stage.slots.findIndex(s=>s && s.name===u.name);
      if (myIdx!==-1) stage.slots[myIdx] = null;
      return broadcastStage();
    }

    if (stage.slots[index] && stage.slots[index].name===u.name){
      stage.slots[index]=null; return broadcastStage();
    }
    const exists = stage.slots.findIndex(s=>s && s.name===u.name);
    if (exists!==-1) stage.slots[exists]=null;

    if (!stage.slots[index]) stage.slots[index] = { name: u.name };
    broadcastStage();
  });

  // لوحة التحكم (roles)
  socket.on("roles:request", ()=>{
    if (!isOwnerMainSocket(socket)) return;
    socket.emit("roles:list", Array.from(allowed, ([name, rec]) => ({ name, role: rec.role })));
  });

  // حفظ (alias للمنح السابق)
  socket.on("roles:save", ({ target, role, pass })=>{
    if (!isOwnerMainSocket(socket)) return;
    target = String(target||"").trim();
    role   = (role==="owner") ? "owner" : "admin";
    pass   = String(pass||"").trim();
    if (!target || !pass) return;

    allowed.set(target, { role, pass });
    saveRoles();

    // حدّث الدور لو المستخدم متصل
    for (const [id,u] of users.entries()){
      if (u.name === target) { u.role = role; users.set(id, u); }
    }
    socket.emit("roles:list", Array.from(allowed, ([name, rec]) => ({ name, role: rec.role })));
  });

  // ما زلنا ندعم الحدث القديم للمتوافقية
  socket.on("roles:grant", (payload)=> io.emit("noop") || socket.emit("roles:save", payload));

  socket.on("roles:revoke", ({ target })=>{
    if (!isOwnerMainSocket(socket)) return;
    target = String(target||"").trim(); if(!target) return;

    allowed.delete(target);
    saveRoles();

    for (const [id,u] of users.entries()){
      if (u.name === target) { u.role = "user"; users.set(id, u); }
    }
    socket.emit("roles:list", Array.from(allowed, ([name, rec]) => ({ name, role: rec.role })));
  });

  socket.on("disconnect", ()=>{
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
server.listen(PORT, ()=> console.log("Chat server on http://localhost:"+PORT));
