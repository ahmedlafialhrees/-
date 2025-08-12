import { SERVER_URL, OWNER_NAME } from "./config.js";

const role = localStorage.getItem("role") || "user";
const name = (localStorage.getItem("name") || "").trim();
if (!name) window.location.href = "index.html";
const isOwnerMain = role === "ownerMain" && name === OWNER_NAME;

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const asLine = document.getElementById("asLine");

const exitBtn = document.getElementById("exitMenuBtn");
const exitDropdown = document.getElementById("exitDropdown");
const controlPanelLink = document.getElementById("controlPanelLink");
const logoutLink = document.getElementById("logoutLink");

const emojiBtn = document.getElementById("emojiBtn");
const emojiPanel = document.getElementById("emojiPanel");

const stageOverlay = document.getElementById("stageOverlay");
const toggleStageBtn = document.getElementById("toggleStageBtn");
const closeStageBtn = document.getElementById("closeStageBtn");
const slotsEl = document.getElementById("slots");

asLine.textContent = `ترسل كـ: ${name}`;
if (isOwnerMain) controlPanelLink.classList.remove("hidden");

exitBtn.addEventListener("click", () => exitDropdown.classList.toggle("hidden"));
document.addEventListener("click", (e) => {
  if (!exitBtn.contains(e.target) && !exitDropdown.contains(e.target)) exitDropdown.classList.add("hidden");
});
logoutLink.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.clear();
  window.location.href = "index.html";
});

emojiBtn.addEventListener("click", () => emojiPanel.classList.toggle("hidden"));
emojiPanel.addEventListener("click", (e) => {
  const el = e.target.closest(".emoji");
  if (!el) return;
  inputEl.value += el.textContent;
  inputEl.focus();
});
document.addEventListener("click", (e) => {
  if (!emojiBtn.contains(e.target) && !emojiPanel.contains(e.target)) emojiPanel.classList.add("hidden");
});

const socket = io(SERVER_URL, { transports: ["websocket"] });
socket.on("connect", () => socket.emit("join", { name, role }));
socket.on("message", (payload) => addMessage(payload, payload.name === name));
socket.on("stage:update", (stage) => renderStage(stage));

socket.on("kicked", (reason) => {
  alert(`تم طردك: ${reason || ""}`);
  localStorage.clear();
  window.location.href = "index.html";
});
socket.on("banned", (untilTs) => {
  alert(`تم حظرك حتى ${new Date(untilTs).toLocaleString()}`);
  localStorage.clear();
  window.location.href = "index.html";
});

function sendMessage() {
  const text = (inputEl.value || "").trim();
  if (!text) return;
  socket.emit("message", { text });
  inputEl.value = "";
}
sendBtn.addEventListener("click", sendMessage);
inputEl.addEventListener("keydown", (e) => e.key === "Enter" && sendMessage());

function addMessage({ name: n, text, ts }, mine=false) {
  const div = document.createElement("div");
  div.className = "msg" + (mine ? " me" : "");
  div.innerHTML = `<div style="font-size:12px;color:#666;margin-bottom:4px">${n}</div>${text}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

let lastStage = { slots: [null,null,null,null] };
function renderStage(stage) {
  lastStage = stage || lastStage;
  slotsEl.innerHTML = "";
  lastStage.slots.forEach((slot, idx) => {
    const d = document.createElement("div");
    const isMe = slot && slot.name === name;
    d.className = "slot" + (isMe ? " me" : "");
    d.dataset.index = idx;
    d.textContent = slot ? `🎤 ${slot.name}` : "— فارغ —";
    d.addEventListener("click", () => socket.emit("stage:toggle", { index: idx }));
    slotsEl.appendChild(d);
  });
}

toggleStageBtn.addEventListener("click", () => {
  stageOverlay.style.display = "flex";
  socket.emit("stage:request");
});
closeStageBtn.addEventListener("click", () => {
  const myIndex = lastStage.slots.findIndex(x => x && x.name === name);
  if (myIndex !== -1) socket.emit("stage:toggle", { index: myIndex, forceDown:true });
  stageOverlay.style.display = "none";
});
socket.emit("stage:request");
