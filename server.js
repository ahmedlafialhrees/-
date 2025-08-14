// server.js — StageChat (Express + Socket.IO) مع صلاحيات و Rate Limits
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.get("/", (_,res)=> res.send("StageChat server running"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST"] },
  path: "/socket.io",
  transports: ["websocket","polling"],
  pingTimeout: 20000,
  pingInterval: 12000
});

// حالة الرومات بالذاكرة
const rooms = new Map();
// شكل الروم: { stage:{open, slots:[{id,name,role}|null]*4}, users:Map, history:[], bans:Map, mutes:Map }

function ensureRoom(roomId){
  if (!rooms.has(roomId)){
    rooms.set(roomId, {
      stage: { open:false, slots:[null,null,null,null] },
      users: new Map(),   // id -> {id,name,role}
      history: [],        // آخر الرسائل
      bans: new Map(),    // id -> untilTs
      mutes: new Map(),   // id -> untilTs
      _debounce: null,    // لتجميع stage:update
    });
  }
  return rooms.get(roomId);
}
const isOwner = (R, id)=> R?.users.get(id)?.role === "owner";
const isAdmin = (R, id)=> ["owner","admin"].includes(R?.users.get(id)?.role);

// limiter بسيط (bucket) لكل مستخدم
const buckets = new Map(); // key = room:id
function takeToken(key, refillPerSec=2, burst=6){
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) b = { tokens: burst, last: now };
  const elapsed = (now - b.last)/1000;
  b.tokens = Math.min(burst, b.tokens + elapsed*refillPerSec);
  b.last = now;
  if (b.tokens >= 1){
    b.tokens -= 1;
    buckets.set(key, b);
    return true;
  }
  buckets.set(key, b);
  return false;
}

function sysNotice(room, text){
  io.to(room).emit("sys:notice", { room, text, ts: Date.now() });
}

io.on("connection", (socket)=>{
  socket.on("room:join", ({room, id, name, role})=>{
    if (!room || !id) return;
    const R = ensureRoom(room);

    // حظر مؤقت؟
    const banUntil = R.bans.get(id);
    if (banUntil && banUntil > Date.now()){
      socket.emit("sys:error", { room, code:"banned", until:banUntil });
      return;
    }

    socket.join(room);
    socket.data.room = room;
    socket.data.id   = id;

    const safeRole = role === "owner" ? "owner"
                    : role === "admin" ? "admin" : "member";
    R.users.set(id, { id, name: name||"عضو", role: safeRole });

    // حالة الاستيج الحالية
    socket.emit("stage:state", { room, open:R.stage.open, slots:R.stage.slots });

    // آخر 30 رسالة فقط
    R.history.slice(-30).forEach(msg => socket.emit("chat:msg", { room, ...msg }));

    sysNotice(room, `${name||"عضو"} دخل الغرفة`);
  });

  socket.on("chat:msg", ({room, id, name, role, text})=>{
    if (!room || !id || !text) return;
    const R = ensureRoom(room);

    // rate limit الرسائل (2 بالثانية، burst 6)
    if (!takeToken(`${room}:${id}`, 2, 6)) {
      socket.emit("sys:error", { room, code:"ratelimited" });
      return;
    }

    // مكتوم؟
    const muteUntil = R.mutes.get(id);
    if (muteUntil && muteUntil > Date.now()){
      socket.emit("sys:error", { room, code:"muted", until: muteUntil });
      return;
    }

    const clean = (""+text).slice(0, 1000);
    const payload = { id, name: name||"عضو", role: role||R.users.get(id)?.role||"member", text: clean, ts: Date.now() };
    R.history.push(payload);
    if (R.history.length > 500) R.history.shift(); // سقف تاريخ
    io.to(room).emit("chat:msg", { room, ...payload });
  });

  // نتلقى تحديثات الاستيج لكن نجمعها (debounce) حتى ما نغرق السيرفر
  socket.on("stage:update", ({room, open, slots})=>{
    if (!room) return;
    const R = ensureRoom(room);
    R.stage.open = !!open;
    const cleaned = (Array.isArray(slots)? slots : [null,null,null,null]).slice(0,4).map(s=>{
      if (!s) return null;
      return { id:s.id, name:s.name, role: s.role || R.users.get(s.id)?.role || "member" };
    });
    R.stage.slots = cleaned;

    clearTimeout(R._debounce);
    R._debounce = setTimeout(()=>{
      io.to(room).emit("stage:update", { room, open: R.stage.open, slots: R.stage.slots });
    }, 120);
  });

  /* ===== أوامر المود (محسّنة + rate limit) ===== */
  function allowMod(room, byId, burst=5){
    if (!takeToken(`mod:${room}:${byId}`, 1, burst)) return false; // 1/ث + burst 5
    const R = ensureRoom(room);
    return isAdmin(R, byId);
  }

  socket.on("mod:stage:pull", ({room, byId, targetId, slotIndex})=>{
    const R = ensureRoom(room); if (!R || !allowMod(room, byId)) return;
    const i = Math.max(0, Math.min(3, (Number.isInteger(slotIndex)? slotIndex : R.stage.slots.findIndex(x=>!x))));
    if (i < 0) return;
    const u = R.users.get(targetId); if (!u) return;
    R.stage.open = true;
    R.stage.slots[i] = { id:u.id, name:u.name, role:u.role };
    io.to(room).emit("stage:update", { room, open:true, slots:R.stage.slots });
    sysNotice(room, `${R.users.get(byId)?.name||"مشرف"} سحب ${u.name} للمسرح`);
  });

  socket.on("mod:stage:remove", ({room, byId, targetId})=>{
    const R = ensureRoom(room); if (!R || !allowMod(room, byId)) return;
    for (let i=0;i<4;i++){
      const s = R.stage.slots[i];
      if (s && s.id === targetId){ R.stage.slots[i] = null; }
    }
    io.to(room).emit("stage:update", { room, open:R.stage.open, slots:R.stage.slots });
    const u = R.users.get(targetId);
    if (u) sysNotice(room, `${R.users.get(byId)?.name||"مشرف"} نزّل ${u.name} من المسرح`);
  });

  socket.on("mod:mute", ({room, byId, targetId, minutes=5})=>{
    const R = ensureRoom(room); if (!R || !allowMod(room, byId)) return;
    const until = Date.now() + Math.max(1, minutes)*60*1000;
    R.mutes.set(targetId, until);
    sysNotice(room, `${R.users.get(byId)?.name||"مشرف"} كتم ${R.users.get(targetId)?.name||"مستخدم"} لمدة ${minutes} د`);
  });

  socket.on("mod:kick", async ({room, byId, targetId})=>{
    const R = ensureRoom(room); if (!R || !allowMod(room, byId)) return;
    for (let i=0;i<4;i++){
      const s = R.stage.slots[i];
      if (s && s.id === targetId){ R.stage.slots[i] = null; }
    }
    io.to(room).emit("stage:update", { room, open:R.stage.open, slots:R.stage.slots });
    for (const s of await io.in(room).fetchSockets()){
      if (s.data?.id === targetId) s.disconnect(true);
    }
    sysNotice(room, `${R.users.get(byId)?.name||"مشرف"} طرد ${R.users.get(targetId)?.name||"مستخدم"}`);
  });

  socket.on("mod:tempban", async ({room, byId, targetId, minutes=120})=>{
    const R = ensureRoom(room); if (!R || !allowMod(room, byId)) return;
    const until = Date.now() + Math.max(1, minutes)*60*1000;
    R.bans.set(targetId, until);
    for (let i=0;i<4;i++){
      const s = R.stage.slots[i];
      if (s && s.id === targetId){ R.stage.slots[i] = null; }
    }
    io.to(room).emit("stage:update", { room, open:R.stage.open, slots:R.stage.slots });
    for (const s of await io.in(room).fetchSockets()){
      if (s.data?.id === targetId) s.disconnect(true);
    }
    sysNotice(room, `${R.users.get(byId)?.name||"مشرف"} حظر ${R.users.get(targetId)?.name||"مستخدم"} لمدة ${minutes} د`);
  });

  socket.on("mod:admin:grant", ({room, byId, targetId})=>{
    const R = ensureRoom(room); if (!R || !isOwner(R, byId) || !takeToken(`mod:${room}:${byId}`, 1, 5)) return;
    const u = R.users.get(targetId); if (!u) return;
    u.role = "admin"; R.users.set(targetId, u);
    for (let i=0;i<4;i++){ const s=R.stage.slots[i]; if (s && s.id===targetId) s.role="admin"; }
    io.to(room).emit("stage:update", { room, open:R.stage.open, slots:R.stage.slots });
    sysNotice(room, `${R.users.get(byId)?.name||"Owner"} منح ${u.name} أدمن`);
  });

  socket.on("mod:admin:revoke", ({room, byId, targetId})=>{
    const R = ensureRoom(room); if (!R || !isOwner(R, byId) || !takeToken(`mod:${room}:${byId}`, 1, 5)) return;
    const u = R.users.get(targetId); if (!u) return;
    u.role = "member"; R.users.set(targetId, u);
    for (let i=0;i<4;i++){ const s=R.stage.slots[i]; if (s && s.id===targetId) s.role="member"; }
    io.to(room).emit("stage:update", { room, open:R.stage.open, slots:R.stage.slots });
    sysNotice(room, `${R.users.get(byId)?.name||"Owner"} سحب أدمن من ${u.name}`);
  });

  socket.on("disconnect", async ()=>{
    const room = socket.data.room;
    const id   = socket.data.id;
    if (!room || !id) return;
    const R = rooms.get(room); if (!R) return;

    const u = R.users.get(id);
    R.users.delete(id);

    let changed = false;
    for (let i=0;i<4;i++){
      const s = R.stage.slots[i];
      if (s && s.id === id){ R.stage.slots[i] = null; changed = true; }
    }
    if (changed){
      io.to(room).emit("stage:update", { room, open: R.stage.open, slots: R.stage.slots });
    }
    if (u) sysNotice(room, `${u.name} طلع من الغرفة`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log("StageChat server on http://localhost:"+PORT));
