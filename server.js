// server.js — StageChat (Express + Socket.IO)
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

// قدّم ملفات الواجهة من نفس مجلد المستودع
app.use(express.static(".")); // يخدم index.html و style.css و script.js من الجذر

app.get("/health", (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// كلمات سر اختيارية (تقدر تغيّرها من Render → Environment)
const OWNER_PASS = process.env.OWNER_PASS || "7770";
const ADMIN_PASS = process.env.ADMIN_PASS || "7771";

// حالة كل غرفة في الذاكرة
const rooms = new Map();
const makeState = () => ({
  users: new Map(),        // socketId -> {name, role}
  nameToId: new Map(),     // name -> socketId
  tempAdmins: new Set(),   // أسماء أدمن مؤقتين للجلسة
  bans: new Map(),         // name -> timestamp
  stage: Array(5).fill(null), // 5 خانات ميكروفون
  messages: [],            // آخر 100 رسالة
  accounts: new Map()      // owner panel: name -> {pass, role}
});
const getRoom = (name) => {
  if (!rooms.has(name)) rooms.set(name, makeState());
  return rooms.get(name);
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function pushMsg(room, name, text) {
  const R = getRoom(room);
  R.messages.push({ name, text, ts: Date.now() });
  R.messages = R.messages.slice(-100);
  io.to(room).emit("msg", { name, text });
}
function sendFull(room, sid) {
  const R = getRoom(room);
  io.to(sid).emit("state", {
    messages: R.messages,
    stage: R.stage,
    users: [...R.users.values()].map(u => ({ name: u.name, role: u.role }))
  });
}
function broadcastUsers(room) {
  const R = getRoom(room);
  io.to(room).emit("users", [...R.users.values()].map(u => ({ name: u.name, role: u.role })));
}
function removeFromStage(room, name) {
  const R = getRoom(room);
  let changed = false;
  R.stage = R.stage.map(s => (s && s.name === name ? (changed = true, null) : s));
  if (changed) io.to(room).emit("stage", R.stage);
}

io.on("connection", (socket) => {
  socket.on("join", ({ name, role, pass, room }) => {
    const roomName = (room || "مجلس-١").trim() || "مجلس-١";
    socket.join(roomName);
    socket.data.room = roomName;

    const R = getRoom(roomName);

    // حظر مؤقت
    const until = R.bans.get(name);
    if (until && until > Date.now()) return socket.emit("join-denied", "محظور مؤقتًا");

    // تحقق صلاحيات
    const acc = R.accounts.get(name);
    const okOwner = pass === OWNER_PASS || (acc && acc.role === "owner" && acc.pass === pass);
    const okAdmin = pass === ADMIN_PASS || R.tempAdmins.has(name) || (acc && acc.role === "admin" && acc.pass === pass);
    if (role === "owner" && !okOwner) return socket.emit("join-denied", "كلمة سر الأونر غير صحيحة");
    if (role === "admin" && !okAdmin) return socket.emit("join-denied", "كلمة سر الأدمن غير صحيحة/غير مخوّل");

    // اسم تلقائي عند تركه فاضي
    let base = (name || `ضيف-${Math.floor(1000 + Math.random() * 9000)}`).trim();
    let final = base, i = 1;
    while (R.nameToId.has(final)) final = `${base}-${i++}`;

    R.users.set(socket.id, { name: final, role });
    R.nameToId.set(final, socket.id);
    socket.data.name = final;
    socket.data.role = role;

    socket.emit("joined", { name: final, role, room: roomName });
    sendFull(roomName, socket.id);
    pushMsg(roomName, "النظام", `${final} انضمّ`);
    broadcastUsers(roomName);
  });

  socket.on("msg", (text) => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    const t = String(text || "").slice(0, 500).trim();
    if (!t) return;
    pushMsg(room, name, t);
  });

  socket.on("typing", () => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    socket.to(room).emit("typing", { name });
  });

  socket.on("stage:occupy", (rawIdx) => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    const R = getRoom(room);
    const idx = clamp(rawIdx | 0, 0, R.stage.length - 1);
    // لو هو بنفس الخانة اضغط ينزل
    if (R.stage[idx]?.name === name) {
      R.stage[idx] = null;
      io.to(room).emit("stage", R.stage);
      pushMsg(room, "النظام", `${name} نزل من الاستيج`);
      return;
    }
    // لو الخانة مشغولة تجاهل
    if (R.stage[idx]) return;
    // فضي أي خانة ثانية له ثم اصعده لهذه
    R.stage = R.stage.map(s => (s && s.name === name ? null : s));
    R.stage[idx] = { name };
    io.to(room).emit("stage", R.stage);
    pushMsg(room, "النظام", `${name} صعد الاستيج`);
  });

  // أدوات أدمن/أونر
  socket.on("admin:drop", (target) => {
    const { room, role } = socket.data || {};
    if (!room) return;
    if (!(role === "owner" || role === "admin")) return;
    removeFromStage(room, target);
    pushMsg(room, "النظام", `تم تنزيل ${target} من الاستيج`);
  });

  socket.on("admin:grantTempAdmin", (target) => {
    const { room, role } = socket.data || {};
    if (!room) return;
    if (!(role === "owner" || role === "admin")) return;
    const R = getRoom(room);
    R.tempAdmins.add(target);
    pushMsg(room, "النظام", `تم إعطاء ${target} أدمن (جلسة)`);
  });

  socket.on("admin:ban2h", (target) => {
    const { room, role } = socket.data || {};
    if (!room) return;
    if (!(role === "owner" || role === "admin")) return;
    const R = getRoom(room);
    const until = Date.now() + 2 * 60 * 60 * 1000;
    R.bans.set(target, until);
    // افصل لو كان داخل
    const sid = R.nameToId.get(target);
    if (sid) {
      io.to(sid).emit("join-denied", "تم حظرك ساعتين");
      R.users.delete(sid);
      R.nameToId.delete(target);
      removeFromStage(room, target);
      io.sockets.sockets.get(sid)?.disconnect(true);
    }
    pushMsg(room, "النظام", `${target} محظور ساعتين`);
    broadcastUsers(room);
  });

  // لوحة تحكم الأونر (حسابات محفوظة مؤقتاً)
  socket.on("owner:addAccount", ({ name, pass, role }) => {
    const { room, role: myRole } = socket.data || {};
    if (!room || myRole !== "owner") return;
    if (!name || !pass || !["admin", "owner"].includes(role)) return;
    const R = getRoom(room);
    R.accounts.set(name, { pass, role });
    const list = [...R.accounts.entries()].map(([n, v]) => ({ name: n, role: v.role }));
    io.to(socket.id).emit("owner:accounts", list);
  });
  socket.on("owner:deleteAccount", (name) => {
    const { room, role } = socket.data || {};
    if (!room || role !== "owner") return;
    const R = getRoom(room);
    R.accounts.delete(name);
    const list = [...R.accounts.entries()].map(([n, v]) => ({ name: n, role: v.role }));
    io.to(socket.id).emit("owner:accounts", list);
  });
  socket.on("owner:listAccounts", () => {
    const { room, role } = socket.data || {};
    if (!room || role !== "owner") return;
    const R = getRoom(room);
    const list = [...R.accounts.entries()].map(([n, v]) => ({ name: n, role: v.role }));
    io.to(socket.id).emit("owner:accounts", list);
  });

  socket.on("disconnect", () => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    const R = getRoom(room);
    R.users.delete(socket.id);
    R.nameToId.delete(name);
    R.tempAdmins.delete(name);
    removeFromStage(room, name);
    broadcastUsers(room);
    pushMsg(room, "النظام", `${name} خرج`);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("StageChat on: " + PORT));
