// نفس الدومين (kwpooop.onrender.com)
const socket = io("/", { path: "/socket.io", transports: ["websocket","polling"] });

// إرسال
function sendMessage(text, name="ضيف"){
  socket.emit("chat:send", { text, user: name });
}

// استلام
socket.on("chat:new", (m) => {
  // هنا اعرض الرسالة بواجهتك (ضيفها لقائمة الرسائل)
  console.log(`${m.user}: ${m.text}`);
});
