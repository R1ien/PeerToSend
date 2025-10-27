const socket = io();

const fileInput = document.getElementById("fileInput");
const createBtn = document.getElementById("createBtn");
const generatedCodeEl = document.getElementById("generatedCode");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const senderStatus = document.getElementById("senderStatus");
const sendProgress = document.getElementById("sendProgress");

let pc, dataChannel, fileToSend;
const CHUNK_SIZE = 64 * 1024;
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function log(msg) {
  senderStatus.textContent = "Statut : " + msg;
}

// Crée un code de partage
createBtn.onclick = () => {
  if (!fileInput.files.length) return alert("Choisis un fichier !");
  fileToSend = fileInput.files[0];
  socket.emit("create-code", { name: fileToSend.name, size: fileToSend.size }, res => {
    generatedCodeEl.textContent = res.code;
    log("Code créé. En attente du receveur...");
  });
};

// Copier le code
copyCodeBtn.onclick = () => {
  navigator.clipboard.writeText(generatedCodeEl.textContent);
  alert("Code copié !");
};

// Quand un receveur rejoint
socket.on("receiver-joined", async (code) => {
  log("Receveur connecté !");
  pc = new RTCPeerConnection(rtcConfig);
  dataChannel = pc.createDataChannel("file");
  dataChannel.onopen = () => sendFile(dataChannel);

  pc.onicecandidate = e => {
    if (e.candidate)
      socket.emit("webrtc-ice", { code, candidate: e.candidate });
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("webrtc-offer", { code, desc: pc.localDescription });
});

// Quand on reçoit la réponse du receveur
socket.on("webrtc-answer", async ({ desc }) => {
  if (pc) await pc.setRemoteDescription(desc);
});

// Ajout de candidats ICE côté sender
socket.on("webrtc-ice", async ({ candidate }) => {
  try {
    await pc.addIceCandidate(candidate);
  } catch (err) {
    console.error("Erreur ICE côté sender:", err);
  }
});

// Envoi du fichier
async function sendFile(dc) {
  const file = fileToSend;
  let offset = 0;
  log("Envoi en cours...");

  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    dc.send(buffer);
    offset += buffer.byteLength;
    sendProgress.value = Math.round((offset / file.size) * 100);
  }

  dc.send(JSON.stringify({ done: true, name: file.name }));
  log("Fichier envoyé !");
}
