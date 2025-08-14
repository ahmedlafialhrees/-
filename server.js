// server.js — StageChat (Express + Socket.IO)
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
  transports: ["websocket","polling"]
});

// حالة الرومات بالذاكرة
const rooms = new Map();
// شكل الحالة: { stage:{open:false, slots:[null,null,null,null]}, users:Map, history:Array }

function ensureRoom(roomId){
  if (!rooms.has(roomId)){
    rooms.set(roomId, {
      stage: { open:false, slots:[null,null,null,null] },
      users: new Map(),     // id -> {id,name,role}
      history: []           // [{id,name,role,text,ts}]
    });
  }
  return rooms.get(roomId);
}

io.on("connection", (socket)=>{
  // انضمام روم
  socket.on("room:join", ({room, id, name, role})=>{
    if (!room || !id) return;
    socket.join(room);
    socket.data.room = room;
    socket.data.id   = id;

    const R = ensureRoom(room);
    R.users.set(id, {id, name: name||"عضو", role: role||"member"});

    // رجّع الحالة الحالية للمستمعين
    io.to(room).emit("stage:state", { room, ...R.stage });

    // خيار: ترجع آخر 30 رسالة للي توه داخل
    const last = R.history.slice(-30);
    last.forEach(msg => socket.emit("chat:msg", { room, ...msg }));
  });

  // رسالة شات
  socket.on("chat:msg", ({room, id, name, role, text})=>{
    if (!room || !id || !text) return;
    const R = ensureRoom(room);
    const clean = (""+text).slice(0, 2000); // حمايه طول
    const payload = { id, name: name||"عضو", role: role||"member", text: clean, ts: Date.now() };
    R.history.push(payload);
    if (R.history.length > 500) R.history.shift(); // نحافظ على الحجم
    io.to(room).emit("chat:msg", { room, ...payload });
  });

  // تحديث الاستيج
  socket.on("stage:update", ({room, open, slots})=>{
    if (!room) return;
    const R = ensureRoom(room);

    // تثبيت القيم
    const safeOpen  = !!open;
    const safeSlots = Array.isArray(slots) ? slots.slice(0,4) : [null,null,null,null];

    // تنظيف البينات (نخلي فقط الحقول الضرورية)
    const cleaned = safeSlots.map(s=>{
      if (!s) return null;
      return { id: s.id, name: s.name, role: s.role || "member" };
    });

    R.stage.open  = safeOpen;
    R.stage.slots = cleaned;

    io.to(room).emit("stage:update", { room, open: R.stage.open, slots: R.stage.slots });
  });

  // فصل المستخدم: ننزله من الاستيج لو كان موجود
  socket.on("disconnect", ()=>{
    const room = socket.data.room;
    const id   = socket.data.id;
    if (!room || !id) return;
    const R = rooms.get(room);
    if (!R) return;

    // حذف من المستخدمين
    R.users.delete(id);

    // إزالة من الاستيج إن كان فوق
    let changed = false;
    for (let i=0;i<4;i++){
      const s = R.stage.slots[i];
      if (s && s.id === id){ R.stage.slots[i] = null; changed = true; }
    }
    if (changed){
      io.to(room).emit("stage:update", { room, open: R.stage.open, slots: R.stage.slots });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log("StageChat server on http://localhost:"+PORT));
