import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const OWNER_PASS = process.env.OWNER_PASS || "owner123";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.static(".")); // يخدم index.html والملفات

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ===== بيانات بسيطة في الذاكرة =====
const users = new Map();           // socketId -> {id,name,role}
let stage = [null, null, null, null];
let nextId = 1;
const bannedByName = new Map();    // name -> timestamp (لطرد ساعتين)

const pub = (u) => ({ id: u.id, name: u.name, role: u.role });
const sendUsers = () => io.emit("users:list", [...users.values()].map(pub));
const sendStage = () =>
  io.emit("stage:update", stage.map(sid => sid && users.get(sid) ? pub(users.get(sid)) : null));

io.on("connection", (socket) => {
  socket.on("auth:login", ({ name, ownerPass, adminPass }) => {
    name = (name || "").trim().slice(0, 20);
    if (!name) return socket.emit("auth:error", "الاسم مطلوب");

    const ban = bannedByName.get(name);
    if (ban && Date.now() < ban) {
      const m = Math.ceil((ban - Date.now()) / 60000);
      return socket.emit("auth:error", `محظور مؤقتًا (${m} دقيقة متبقية)`);
    }

    let role = "user";
    if (ownerPass && ownerPass === OWNER_PASS) role = "owner";
    else if (adminPass && adminPass === ADMIN_PASS) role = "admin";

    const u = { id: nextId++, name, role, mutedUntil: 0 };
    users.set(socket.id, u);
    socket.join("room");

    socket.emit("auth:ok", { me: pub(u) });
    io.to("room").emit("chat:system", `${u.name} دخل الدردشة`);
    sendUsers(); sendStage();
  });

  socket.on("chat:msg", (text) => {
    const u = users.get(socket.id);
    if (!u) return;
    text = (text || "").toString().slice(0, 500).trim();
    if (!text) return;
    io.to("room").emit("chat:msg", { from: pub(u), text, ts: Date.now() });
  });

  socket.on("stage:toggle", () => {
    const u = users.get(socket.id);
    if (!u) return;
    const on = stage.findIndex(sid => sid === socket.id);
    if (on !== -1) { stage[on] = null; sendStage(); return; }
    const idx = stage.findIndex(sid => sid === null);
    if (idx !== -1) { stage[idx] = socket.id; sendStage(); }
  });

  socket.on("user:action", ({ targetId, action, payload }) => {
    const actor = users.get(socket.id);
    if (!actor) return;
    const entry = [...users.entries()].find(([sid, u]) => u.id === targetId);
    if (!entry) return;
    const [tSid, target] = entry;
    const isOwner = actor.role === "owner";
    const isAdmin = actor.role === "admin";

    if (action === "rename") {
      if (!(isOwner || isAdmin || actor.id === target.id)) return;
      const newName = (payload?.name || "").trim().slice(0, 20);
      if (!newName) return;
      target.name = newName;
      io.emit("chat:system", `تم تغيير الاسم إلى ${newName}`);
      sendUsers(); sendStage(); return;
    }

    if (action === "removeFromStage") {
      if (!(isOwner || isAdmin)) return;
      const idx = stage.findIndex((sid) => sid === tSid);
      if (idx !== -1) { stage[idx] = null; sendStage(); }
      return;
    }

    if (action === "kick") {
      if (!(isOwner || isAdmin)) return;
      io.to(tSid).emit("auth:kicked", "تم طردك من الغرفة");
      const idx = stage.findIndex((sid) => sid === tSid);
      if (idx !== -1) stage[idx] = null;
      users.delete(tSid);
      io.sockets.sockets.get(tSid)?.disconnect(true);
      sendUsers(); sendStage(); return;
    }

    if (action === "tempban2h") {
      if (!(isOwner || isAdmin)) return;
      bannedByName.set(target.name, Date.now() + 2 * 60 * 60 * 1000);
      io.to(tSid).emit("auth:kicked", "تم طردك ساعتين");
      const idx = stage.findIndex((sid) => sid === tSid);
      if (idx !== -1) stage[idx] = null;
      users.delete(tSid);
      io.sockets.sockets.get(tSid)?.disconnect(true);
      sendUsers(); sendStage(); return;
    }

    // ترقيات أونر فقط
    if (!isOwner) return;
    if (action === "grantAdmin")  { target.role = "admin"; io.emit("chat:system", `${target.name} أصبح أدمن`); sendUsers(); return; }
    if (action === "grantOwner")  { target.role = "owner"; io.emit("chat:system", `${target.name} أصبح أونر`); sendUsers(); return; }
    if (action === "revokeAdmin" && target.role === "admin") { target.role = "user"; io.emit("chat:system", `${target.name} أزيل من الأدمن`); sendUsers(); return; }
    if (action === "revokeOwner" && target.role === "owner") { target.role = "user"; io.emit("chat:system", `${target.name} أزيل من الأونر`); sendUsers(); return; }
  });

  socket.on("disconnect", () => {
    const u = users.get(socket.id);
    if (!u) return;
    const idx = stage.findIndex((sid) => sid === socket.id);
    if (idx !== -1) stage[idx] = null;
    users.delete(socket.id);
    io.emit("chat:system", `${u.name} خرج`);
    sendUsers(); sendStage();
  });
});

// صفحات
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/chat", (_, res) => res.sendFile(path.join(__dirname, "chat.html")));
app.get("/owner", (_, res) => res.sendFile(path.join(__dirname, "owner.html")));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on http://localhost:" + PORT));
