// server.js — غرف + شات معزول لكل روم (Express + Socket.IO)
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.static("."));                     // يخدم index.html و script.js
app.get("/health", (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  path: "/socket.io",
  transports: ["websocket", "polling"]
});

/* ========== إعدادات بسيطة ========== */
const OWNER_PASS = process.env.OWNER_PASS || "7770";
const ADMIN_PASS = process.env.ADMIN_PASS || "7771";

/* ========== قائمة الغرف + حالة كل روم ========== */
const roomNames = new Set(["مجلس-١"]); // البداية
const rooms = new Map();               // room -> state

const makeState = () => ({
  users: new Map(),        // socketId -> {name, role}
  nameToId: new Map(),     // name -> socketId
  messages: []             // [{name,text,ts}]
});
const getState = (room) => {
  if (!rooms.has(room)) rooms.set(room, makeState());
  return rooms.get(room);
};
const safeMsg = (s) => String(s || "").slice(0, 500).trim();

/* ========== بث مساعد ========== */
function pushMsg(room, name, text) {
  const R = getState(room);
  const m = { name, text, ts: Date.now() };
  R.messages.push(m);
  if (R.messages.length > 200) R.messages = R.messages.slice(-200);
  io.to(room).emit("msg", { name, text, ts: m.ts });
}
function usersList(room) {
  const R = getState(room);
  return [...R.users.values()].map(u => ({ name: u.name, role: u.role }));
}

/* ========== سوكِت ==========
   الأحداث المهمة للواجهة:
   - rooms:list         (طلب قائمة الغرف)
   - rooms:add          (إضافة روم — أونر فقط)
   - join               (الدخول لروم)
   - msg (send/recv)    (إرسال/استقبال الرسائل)
   - typing             (مؤشر الكتابة)
================================ */
io.on("connection", (socket) => {
  /* --- قائمة الغرف --- */
  socket.on("rooms:list", (ack) => {
    const list = [...roomNames];
    if (typeof ack === "function") ack(list);
    else socket.emit("rooms:update", list);
  });

  /* --- إضافة روم (أونر فقط) --- */
  socket.on("rooms:add", ({ room, pass }, ack) => {
    const role = socket.data?.role;
    if (role !== "owner" && pass !== OWNER_PASS) {
      return ack?.({ ok: false, error: "فقط الأونر يضيف غرف" });
    }
    const name = safeMsg(room);
    if (!name) return ack?.({ ok: false, error: "اسم الروم مطلوب" });
    if (roomNames.has(name)) return ack?.({ ok: false, error: "الروم موجود" });
    roomNames.add(name);
    io.emit("rooms:update", [...roomNames]); // حدّث للجميع
    ack?.({ ok: true });
  });

  /* --- دخول غرفة --- */
  socket.on("join", ({ name, role = "member", pass = "", room }, ack) => {
    const roomName = safeMsg(room) || "مجلس-١";
    if (!roomNames.has(roomName)) {
      // ما ندخل إلا لغرف موجودة
      return socket.emit("join-denied", "الروم غير موجود");
    }
    // تحقق صلاحيات بسيطة
    if (role === "owner" && pass !== OWNER_PASS) {
      return socket.emit("join-denied", "كلمة سر الأونر غير صحيحة");
    }
    if (role === "admin" && pass !== ADMIN_PASS) {
      return socket.emit("join-denied", "كلمة سر الأدمن غير صحيحة");
    }

    const R = getState(roomName);

    // اسم تلقائي وتمييز لو مكرر
    let base = safeMsg(name) || `ضيف-${Math.floor(1000 + Math.random() * 9000)}`;
    let final = base, i = 1;
    while (R.nameToId.has(final)) final = `${base}-${i++}`;

    // اربط السوكِت بالروم
    socket.join(roomName);
    socket.data = { room: roomName, name: final, role };
    R.users.set(socket.id, { name: final, role });
    R.nameToId.set(final, socket.id);

    // رجّع له الحالة الأولية
    const init = { room: roomName, me: { name: final, role }, users: usersList(roomName), messages: R.messages };
    socket.emit("joined", init);
    io.to(roomName).emit("users", usersList(roomName));
    pushMsg(roomName, "النظام", `${final} دخل الروم`);

    ack?.({ ok: true, ...init });
  });

  /* --- إرسال رسالة (نص فقط) --- */
  socket.on("msg", (text, ack) => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    const t = safeMsg(text);
    if (!t) return;
    pushMsg(room, name, t);
    ack?.({ ok: true });
  });

  /* --- مؤشر الكتابة --- */
  socket.on("typing", (isTyping = false) => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    socket.to(room).emit("typing", { name, typing: !!isTyping });
  });

  /* --- خروج --- */
  socket.on("disconnect", () => {
    const { room, name } = socket.data || {};
    if (!room || !name) return;
    const R = getState(room);
    R.users.delete(socket.id);
    R.nameToId.delete(name);
    io.to(room).emit("users", usersList(room));
    pushMsg(room, "النظام", `${name} خرج`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Rooms chat listening on:", PORT));
