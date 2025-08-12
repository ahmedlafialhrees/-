import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// ===== إعدادات بسيطة =====
const OWNER_PASS = process.env.OWNER_PASS || "owner123";     // غيّرها
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";     // غيّرها

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ===== بيانات في الذاكرة =====
const users = new Map(); // socket.id -> {id,name,role,mutedUntil,bannedUntil}
let stage = [null, null, null, null]; // 4 خانات (socketId أو null)
let nextId = 1;

// حظر مؤقت (طرد ساعتين) يُفحص عند الدخول
const bannedByName = new Map(); // name -> timestamp

function publicUser(u) {
  return { id: u.id, name: u.name, role: u.role };
}
function broadcastUsers() {
  const list = [...users.values()].map(publicUser);
  io.emit("users:list", list);
}
function broadcastStage() {
  const stageView = stage.map(sid => {
    if (!sid) return null;
    const u = users.get(sid);
    return u ? publicUser(u) : null;
  });
  io.emit("stage:update", stageView);
}

io.on("connection", (socket) => {
  // طلب تسجيل الدخول
  socket.on("auth:login", ({ name, ownerPass, adminPass }) => {
    name = (name || "").trim().slice(0, 20);
    if (!name) return socket.emit("auth:error", "الاسم مطلوب");

    // حظر مؤقت بالاسم
    const banUntil = bannedByName.get(name);
    if (banUntil && Date.now() < banUntil) {
      const mins = Math.ceil((banUntil - Date.now()) / 60000);
      return socket.emit("auth:error", `محظور مؤقتًا (${mins} دقيقة متبقية)`);
    }

    let role = "user";
    if (ownerPass && ownerPass === OWNER_PASS) role = "owner";
    else if (adminPass && adminPass === ADMIN_PASS) role = "admin";

    const user = {
      id: nextId++,
      name,
      role,
      mutedUntil: 0,
      bannedUntil: 0
    };
    users.set(socket.id, user);

    socket.emit("auth:ok", { me: publicUser(user) });
    socket.join("room"); // غرفة عامة واحدة حالياً

    io.to("room").emit("chat:system", `${user.name} دخل الدردشة`);
    broadcastUsers();
    broadcastStage();
  });

  // رسائل
  socket.on("chat:msg", (text) => {
    const u = users.get(socket.id);
    if (!u) return;
    if (u.mutedUntil && Date.now() < u.mutedUntil) return;
    text = (text || "").slice(0, 500);
    if (!text) return;
    io.to("room").emit("chat:msg", { from: publicUser(u), text, ts: Date.now() });
  });

  // صعود/نزول الاستيج
  socket.on("stage:toggle", () => {
    const u = users.get(socket.id);
    if (!u) return;

    // إذا كان موجود على الاستيج نزله
    const idxOn = stage.findIndex(sid => sid === socket.id);
    if (idxOn !== -1) {
      stage[idxOn] = null;
      broadcastStage();
      return;
    }
    // ابحث عن خانة فاضية
    const idx = stage.findIndex(sid => sid === null);
    if (idx !== -1) {
      stage[idx] = socket.id;
      broadcastStage();
    }
  });

  // أوامر على عضو (تظهر من الواجهة عند الضغط على اسمه)
  socket.on("user:action", ({ targetId, action, payload }) => {
    const actor = users.get(socket.id);
    if (!actor) return;

    const targetSock = [...users.entries()].find(([sid, u]) => u.id === targetId);
    if (!targetSock) return;
    const [targetSid, target] = targetSock;

    const isOwner = actor.role === "owner";
    const isAdmin = actor.role === "admin";

    // الأوامر المسموحة
    if (action === "rename") {
      if (!(isOwner || isAdmin || actor.id === target.id)) return;
      const newName = (payload?.name || "").trim().slice(0, 20);
      if (!newName) return;
      target.name = newName;
      io.emit("chat:system", `تم تغيير اسم ${actor.name} إلى ${newName}`);
      broadcastUsers();
      broadcastStage();
      return;
    }

    if (action === "kick") {
      if (!(isOwner || isAdmin)) return;
      io.to(targetSid).emit("auth:kicked", "تم طردك من الغرفة");
      // نزله من الاستيج لو موجود
      const idx = stage.findIndex(sid => sid === targetSid);
      if (idx !== -1) stage[idx] = null;
      users.delete(targetSid);
      io.sockets.sockets.get(targetSid)?.disconnect(true);
      broadcastUsers();
      broadcastStage();
      return;
    }

    if (action === "tempban2h") {
      if (!(isOwner || isAdmin)) return;
      const until = Date.now() + 2 * 60 * 60 * 1000;
      bannedByName.set(target.name, until);
      io.to(targetSid).emit("auth:kicked", "تم طردك ساعتين");
      const idx = stage.findIndex(sid => sid === targetSid);
      if (idx !== -1) stage[idx] = null;
      users.delete(targetSid);
      io.sockets.sockets.get(targetSid)?.disconnect(true);
      broadcastUsers();
      broadcastStage();
      return;
    }

    if (action === "grantAdmin") {
      if (!isOwner) return;
      target.role = "admin";
      io.emit("chat:system", `${target.name} أصبح أدمن`);
      broadcastUsers();
      return;
    }

    if (action === "removeFromStage") {
      if (!(isOwner || isAdmin)) return;
      const idx = stage.findIndex(sid => sid === targetSid);
      if (idx !== -1) {
        stage[idx] = null;
        broadcastStage();
      }
      return;
    }
  });

  socket.on("disconnect", () => {
    const u = users.get(socket.id);
    if (!u) return;
    // نزله من الاستيج
    const idx = stage.findIndex(sid => sid === socket.id);
    if (idx !== -1) stage[idx] = null;

    users.delete(socket.id);
    io.emit("chat:system", `${u.name} خرج`);
    broadcastUsers();
    broadcastStage();
  });
});

// صفحات
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/chat", (_, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));
app.get("/owner", (_, res) => res.sendFile(path.join(__dirname, "public", "owner.html")));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on http://localhost:" + PORT));
