let username = localStorage.getItem("username");
let role = localStorage.getItem("role");

function sendMessage() {
    let msg = document.getElementById("message").value;
    if (msg.trim() === "") return;

    let chatBox = document.getElementById("chatBox");
    let span = document.createElement("div");

    if (role === "owner") {
        span.innerHTML = `<span class="owner">${username} (Owner):</span> ${msg}`;
    } else if (role === "admin") {
        span.innerHTML = `<span class="admin">${username} (Admin):</span> ${msg}`;
    } else {
        span.innerHTML = `<span>${username}:</span> ${msg}`;
    }

    chatBox.appendChild(span);
    document.getElementById("message").value = "";
}
