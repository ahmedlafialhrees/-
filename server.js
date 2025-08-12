// server.js — StageChat (Express + Socket.IO)
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.static(".")); // قدّم الملفات من نفس المجلد (ضع html/js بجانب server.js)

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST"] }
});

// حالة عامة بالسيرفر (ذاكرة مؤقتة)
const users = new Map(); // socket.id -> {name, role}
const bans = new Map();  // name -> untilTs
const stage = { slots: [null, null, null, null] }; // كل خانة: {name}

function isBanned(name) {
  const until = bans.get(name);
  if (!until) return false;
  if (Date.now() > until) { bans.delete(name); return false; }
  return true;
}
function broadcastStage() {
  io.emit("stage:update", stage);
}
function listUsers() {
  const list = [];
  users.forEach((u) => {
    const onStage = stage.slots.some(s => s && s.name === u.name);
    list.push({ name: u.name, role: u.role, onStage });
  });
  return list;
}

io.on("connection", (socket) => {
  // تعريف المستخدم
  socket.on("join", ({ name, role }) => {
    name = (name || "").trim();
    if (!name) { socket.disconnect(); return; }

    if (isBanned(name)) {
      socket.emit("banned", bans.get(name));
      socket.disconnect();
      return;
    }
    users.set(socket.id, { name, role: role || "user" });
    socket.data.name = name;

    socket.emit("stage:update", stage);
  });

  // رسائل نصية
  socket.on("message", ({ text }) => {
    const u = users.get(socket.id);
    if (!u || !text) return;
    const payload = { name: u.name, text: String(text), ts: Date.now() };
    io.emit("message", payload);
  });

  // طلب حالة الاستيج
  socket.on("stage:request", () => {
    socket.emit("stage:update", stage);
  });

  // صعود/نزول الاستيج
  socket.on("stage:toggle", ({ index, forceDown }) => {
    const u = users.get(socket.id);
    if (!u) return;
    if (typeof index !== "number" || index < 0 || index > 3) return;

    // إذا forceDown: نزّل لو كنت فوق
    if (forceDown) {
      const myIdx = stage.slots.findIndex(s => s && s.name === u.name);
      if (myIdx !== -1) stage.slots[myIdx] = null;
      broadcastStage();
      return;
    }

    // إذا كان بنفس الخانة وهو فوق -> نزّل
    const curr = stage.slots[index];
    if (curr && curr.name === u.name) {
      stage.slots[index] = null;
      broadcastStage();
      return;
    }

    // إذا موجود فوق بخانة ثانية -> نزله من القديمة
    const existing = stage.slots.findIndex(s => s && s.name === u.name);
    if (existing !== -1) stage.slots[existing] = null;

    // إذا الخانة فاضية -> ارفعه
    if (!stage.slots[index]) {
      stage.slots[index] = { name: u.name };
      broadcastStage();
    }
  });

  // إدارة المستخدمين (للأونر فقط)
  socket.on("users:request", () => {
    socket.emit("users:list", listUsers());
  });

  function isOwnerMainSocket(sock) {
    const u = users.get(sock.id);
    return u && u.role === "ownerMain" && u.name; // الاسم تحقق تم بالواجهة
  }

  socket.on("admin:grant", ({ target }) => {
    if (!isOwnerMainSocket(socket)) return;
    for (const [id, u] of users.entries()) {
      if (u.name === target) { u.role = "admin"; users.set(id, u); }
    }
  });
  socket.on("admin:revoke", ({ target }) => {
    if (!isOwnerMainSocket(socket)) return;
    for (const [id, u] of users.entries()) {
      if (u.name === target) { u.role = "user"; users.set(id, u); }
    }
  });
  socket.on("admin:kick", ({ target, reason }) => {
    if (!isOwnerMainSocket(socket)) return;
    for (const [id, u] of users.entries()) {
      if (u.name === target) {
        const s = io.sockets.sockets.get(id);
        if (s) { s.emit("kicked", reason || ""); s.disconnect(true); }
        // نزله لو كان فوق
        const idx = stage.slots.findIndex(s => s && s.name === u.name);
        if (idx !== -1) stage.slots[idx] = null;
      }
    }
    broadcastStage();
  });
  socket.on("admin:tempban2h", ({ target }) => {
    if (!isOwnerMainSocket(socket)) return;
    const until = Date.now() + 2*60*60*1000;
    bans.set(target, until);
    // افصل الآن إن كان متصل
    for (const [id, u] of users.entries()) {
      if (u.name === target) {
        const s = io.sockets.sockets.get(id);
        if (s) { s.emit("banned", until); s.disconnect(true); }
        const idx = stage.slots.findIndex(s => s && s.name === u.name);
        if (idx !== -1) stage.slots[idx] = null;
      }
    }
    broadcastStage();
  });

  socket.on("disconnect", () => {
    const u = users.get(socket.id);
    if (u) {
      // نزله من الاستيج إذا كان فوق
      const idx = stage.slots.findIndex(s => s && s.name === u.name);
      if (idx !== -1) stage.slots[idx] = null;
    }
    users.delete(socket.id);
    broadcastStage();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("StageChat server running on http://localhost:"+PORT);
});
