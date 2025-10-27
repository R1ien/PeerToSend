const socket = io();
const fileInput = document.getElementById("fileInput");
const createBtn = document.getElementById("createBtn");
const senderStatus = document.getElementById("senderStatus");
const generatedCode = document.getElementById("generatedCode");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const receiversList = document.getElementById("receiversList");

let fileData = null;
let fileInfo = null;
let code = null;
let pc, dataChannel;

// Créer un code
createBtn.onclick = () => {
  const file = fileInput.files[0];
  if (!file) return alert("Choisis un fichier !");
  fileData = file;
  fileInfo = { name: file.name, size: file.size };

  socket.emit("create-code", fileInfo, res => {
    code = res.code;
    generatedCode.textContent = code;
    senderStatus.textContent = "Statut : En attente de receveur…";

    // Vide la liste des receveurs
    receiversList.innerHTML = "";
  });
};

// Copier le code
copyCodeBtn.onclick = () => {
  if (!code) return;
  navigator.clipboard.writeText(code);
  alert("Code copié !");
};

// Quand un receveur rejoint
socket.on("receiver-joined", rcvCode => {
  if (rcvCode !== code) return;
  senderStatus.textContent = "Statut : Receveur connecté !";

  const li = document.createElement("li");
  li.textContent = "Receveur connecté, prêt à télécharger…";
  li.dataset.id = Date.now(); // ID unique pour ce receveur
  receiversList.appendChild(li);

  // Lancer le P2P pour ce receveur
  startP2P(li);
});

// Initialiser le P2P pour un receveur
function startP2P(li) {
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

  dataChannel = pc.createDataChannel("file");
  dataChannel.binaryType = "arraybuffer";

  dataChannel.onopen = () => {
    li.textContent = `Transfert en cours…`;
    sendFile(fileData, li);
  };

  pc.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("webrtc-ice", { code, candidate: e.candidate });
    }
  };

  // Créer offre et envoyer au receveur
  pc.createOffer().then(offer => {
    pc.setLocalDescription(offer);
    socket.emit("webrtc-offer", { code, desc: offer });
  });
}

// Recevoir la réponse du receveur
socket.on("webrtc-answer", async ({ desc }) => {
  if (pc) await pc.setRemoteDescription(desc);
});

// Recevoir ICE candidates
socket.on("webrtc-ice", async ({ candidate }) => {
  if (pc) {
    try { await pc.addIceCandidate(candidate); } catch (err) { console.error(err); }
  }
});

// Envoyer le fichier par morceaux (sans barre)
function sendFile(file, li) {
  const chunkSize = 16 * 1024; // 16KB
  const reader = new FileReader();
  let offset = 0;

  reader.onload = e => {
    dataChannel.send(e.target.result);
    offset += e.target.result.byteLength;

    if (offset < file.size) {
      readSlice(offset);
    } else {
      dataChannel.send(JSON.stringify({ done: true, name: file.name }));
      li.textContent = `✅ Transfert terminé : ${file.name}`;
      senderStatus.textContent = "Statut : Tous les fichiers envoyés !";
    }
  };

  function readSlice(o) {
    const slice = file.slice(o, o + chunkSize);
    reader.readAsArrayBuffer(slice);
  }

  readSlice(0);
}
