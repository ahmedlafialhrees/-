// server.js — StageChat (Express + Socket.IO) كامل
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

/* ========= إعداد سيرفر الويب ========= */
const app = express();
app.use(cors());
app.use(express.static("."));                 // يخدم index.html وملفاتك من الجذر

// Health
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/healthz", (req, res) => res.send("ok"));

const server = http.createServer(app);

/* ========= إعداد Socket.IO ========= */
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  path: "/socket.io",
  transports: ["websocket", "polling"]
});

/* ========= كلمات سر (تقدر تغيّرها من Render → Environment) ========= */
const OWNER_PASS = process.env.OWNER_PASS || "7770";
const ADMIN_PASS = process.env.ADMIN_PASS || "7771";

/* ========= حالة الغرف بالذاكرة ========= */
const rooms = new Map();
const makeState = () => ({
  users: new Map(),           // socketId -> {name, role}
  nameToId: new Map(),        // name -> socketId
  tempAdmins: new Set(),      // أسماء أدمن مؤقتين للجلسة
  bans: new Map(),            // name -> timestamp
  stage: Array(5).fill(null), // 5 خانات ميكروفون
  messages: [],               // آخر 200 رسالة
  accounts: new Map()         // owner panel: name -> {pass, role}
});
const getRoom = (room) => {
  if (!rooms.has(room)) rooms.set(room, makeState());
  return rooms.get(room);
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/* ========= مساعدات بث الحالة والرسائل ========= */
function broadcastUsers(room) {
  const R = getRoom(room);
  const list = [...R.users.values()].map(u => ({ name: u.name, role: u.role }));
  io.to(room).emit("users", list);
}
function removeFromStage(room, name) {
  const R = getRoom(room);
  let changed = false;
  R.stage = R.stage.map(s => (s && s.name === name ? (changed = true, null) : s));
  if (changed) io.to(room).emit("stage", R.stage);
}
function pushMsg(room, name, text) {
  const R = getRoom(room);
  const msg = { name, text, ts: Date.now() };
  R.messages.push(msg);
  if (R.messages.length > 200) R.messages = R.messages.slice(-200);
  // التوافق: نبث الحدثين "msg" و "chat:new"
  io.to(room).emit("msg", { name, text });
  io.to(room).emit("chat:new", { name, text, ts: msg.ts });
}
function sendFull(room, sid) {
  const R = getRoom(room);
  const users = [...R.users.values()].map(u => ({ name: u.name, role: u.role }));
  io.to(sid).emit("state", {
    messages: R.messages,   // [{name,text,ts}]
    stage: R.stage,         // [{name}|null, ...]
    users                    // [{name,role}]
  });
}

/* ========= منطق الاتصال ========= */
io.on("connection", (socket) => {
  // انضمام للغرفة
  socket.on("join", ({ name, role, pass, room }) => {
    const roomName = (room || "مجلس-١").trim() || "مجلس-١";
    const R = getRoom(roomName);

    // Ban check
    const until = R.bans.get(name);
    if (until && until > Date.now()) {
      return socket.emit("join-denied", "محظور مؤقتًا");
    }

    // صلاحيات
    const acc = R.accounts.get(name);
    const okOwner = pass === OWNER_PASS || (acc && acc.role === "owner" && acc.pass === pass);
    const okAdmin = pass === ADMIN_PASS || R.tempAdmins.has(name) || (acc && acc.role === "admin" && acc.pass === pass);
    if (role === "owner" && !okOwner) return socket.emit("join-denied", "كلمة سر الأونر غير صحيحة");
    if (role === "admin" && !okAdmin) return socket.emit("join-denied", "كلمة سر الأدمن غير صحيحة/غير مخوّل");

    // اسم تلقائي مع تمييز إذا مكرر
    let base = (name || `ضيف-${Math.floor(1000 + Math.random() * 9000)}`).trim();
    let final = base, i = 1;
    while (R.nameToId.has(final)) final = `${base}-${i++}`;

    // اربط السوكِت بالغرفة
    socket.join(roomName);
    socket.data.room = roomName;
    socket.data.name = final;
    socket.data.role = role;

    R.users.set(socket.id, { name: final, role });
    R.nameToId.set(final, socket.id);

    socket.emit("joined", { name: final, role, room: roomName });
    sendFull(roomName, socket.id);
    pushMsg(roomName, "النظام", `${final} انضمّ`);
    broadcastUsers(roomName);
  });

  /* ======== المراسلة (يدعم الحدثين) ======== */
  // جديدك: client يرسل نص فقط
  socket.on("msg", (text, ack) => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    const t = String(text || "").slice(0, 500).trim();
    if (!t) return;
    pushMsg(room, name, t);
    if (typeof ack === "function") ack({ ok: true });
  });

  // توافق مع عميل قديم يرسل {text,user}
  socket.on("chat:send", (payload, ack) => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    const p = typeof payload === "string" ? { text: payload } : (payload || {});
    const t = String(p.text || "").slice(0, 500).trim();
    if (!t) return;
    pushMsg(room, name, t);
    if (typeof ack === "function") ack({ ok: true });
  });

  /* ======== الكتابة (typing) ======== */
  // client: socket.emit("typing", true/false)
  socket.on("typing", (isTyping = false) => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    socket.to(room).emit("typing", { id: socket.id, name, typing: !!isTyping });
  });

  /* ======== الستيدج (5 خانات مايك) ======== */
  // احتلال/تحرير خانة معيّنة
  socket.on("stage:occupy", (rawIdx) => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    const R = getRoom(room);
    const idx = clamp((rawIdx|0), 0, R.stage.length - 1);

    // لو نفس الخانة → نزّل نفسك
    if (R.stage[idx]?.name === name) {
      R.stage[idx] = null;
      io.to(room).emit("stage", R.stage);
      pushMsg(room, "النظام", `${name} نزل من الاستيج`);
      return;
    }
    // لو مشغولة → تجاهل
    if (R.stage[idx]) return;

    // فضّي أي خانة ثانية لنفس الشخص ثم ارفعه لهذي
    R.stage = R.stage.map(s => (s && s.name === name ? null : s));
    R.stage[idx] = { name };
    io.to(room).emit("stage", R.stage);
    pushMsg(room, "النظام", `${name} صعد الاستيج`);
  });

  // أسماء قديمة للتوافق (اختياري)
  socket.on("stage:request", () => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    const R = getRoom(room);
    // حطّه بأول خانة فاضية
    const idx = R.stage.findIndex(s => !s);
    if (idx === -1) return;
    R.stage = R.stage.map(s => (s && s.name === name ? null : s));
    R.stage[idx] = { name };
    io.to(room).emit("stage", R.stage);
    pushMsg(room, "النظام", `${name} صعد الاستيج`);
  });
  socket.on("stage:release", () => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    removeFromStage(room, name);
    pushMsg(room, "النظام", `${name} نزل من الاستيج`);
  });

  /* ======== أوامر أونر/أدمن ======== */
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
    // افصل لو داخل
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

  /* ======== لوحة الأونر (حسابات محفوظة) ======== */
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

  /* ======== خروج ========= */
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

/* ========= تشغيل ========= */
const PORT = process.env.PORT || 3000; // Render يمرّر PORT تلقائيًا
server.listen(PORT, () => console.log("StageChat listening on:", PORT));
