// chat.js
import { SERVER_URL, OWNER_NAME } from "./config.js";
// ... Socket.IO setup الخ

const role = localStorage.getItem("role") || "user";
const name = (localStorage.getItem("name") || "").trim();

const exitBtn = document.getElementById("exitMenuBtn");
const exitDropdown = document.getElementById("exitDropdown");
const controlPanelLink = document.getElementById("controlPanelLink");
const logoutLink = document.getElementById("logoutLink");

// افتح/سكر منيو "خروج"
exitBtn.addEventListener("click", () => {
  exitDropdown.classList.toggle("hidden");
});

// إغلاق المنيو إذا ضغطت براها
document.addEventListener("click", (e) => {
  if (!exitBtn.contains(e.target) && !exitDropdown.contains(e.target)) {
    exitDropdown.classList.add("hidden");
  }
});

// صلاحية الأونر الرئيسي فقط
const isOwnerMain = role === "ownerMain" && name === OWNER_NAME;

// إذا أنت الأونر الرئيسي: أظهر رابط لوحة التحكم داخل الخروج
if (isOwnerMain) {
  controlPanelLink.classList.remove("hidden");
} else {
  controlPanelLink.classList.add("hidden");
}

// تسجيل خروج
logoutLink.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.clear();
  window.location.href = "index.html";
});

// ... بقية كود الرسائل/الاستيج مثل ما هو
