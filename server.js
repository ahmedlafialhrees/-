// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.static("public")); // لو ملفات الواجهة في public

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  path: "/socket.io",
  transports: ["websocket", "polling"]
});

// عند اتصال أي مستخدم
io.on("connection", (socket) => {
  console.log("🔵 مستخدم دخل:", socket.id);

  // استلام الرسائل
  socket.on("chat:send", (msg) => {
    console.log("💬 رسالة:", msg);
    io.emit("chat:new", { id: socket.id, msg });
  });

  socket.on("disconnect", () => {
    console.log("🔴 مستخدم خرج:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 شغال على بورت ${PORT}`));
