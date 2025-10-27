const socket = io();
const codeInput = document.getElementById("codeInput");
const joinBtn = document.getElementById("joinBtn");
const receiverStatus = document.getElementById("receiverStatus");
const downloadArea = document.getElementById("downloadArea");
const downloadContainer = document.getElementById("downloadContainer");
const downloadBar = document.getElementById("downloadBar");

let pc, dataChannel;
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
let receiveBuffer = [];
let totalBytes = 0;
let fileInfo = null;
let currentCode = null;
let offerPending = null; // stocke l'offre tant que téléchargement pas lancé

function log(msg) {
  receiverStatus.textContent = "Statut : " + msg;
}

// Étape 1 : demander le fichier (ne lance pas le téléchargement)
joinBtn.onclick = () => {
  const code = codeInput.value.trim();
  if (!/^\d{6}$/.test(code)) return alert("Code invalide !");
  currentCode = code;
  log("Connexion au serveur...");

  socket.emit("join-code", code, res => {
    if (!res || !res.ok) {
      log("Code introuvable !");
      downloadArea.innerHTML = "";
      return;
    }
    fileInfo = res.fileInfo;
    log(`Connecté ! Fichier : ${fileInfo.name} (${Math.round(fileInfo.size / 1024)} KB)`);

    // Affiche "En attente de téléchargement" dans downloadArea
    downloadArea.innerHTML = "<p>⏳ En attente de téléchargement...</p>";

    // Crée le bouton Télécharger
    const btn = document.createElement("button");
    btn.textContent = "📥 Télécharger";
    btn.className = "btn";
    btn.onclick = () => startDownload(btn);
    downloadArea.appendChild(btn);
  });
};

// Stocker l'offre si téléchargement pas encore démarré
socket.on("webrtc-offer", ({ desc }) => {
  if (pc) {
    pc.setRemoteDescription(desc).then(() => {
      pc.createAnswer().then(answer => {
        pc.setLocalDescription(answer).then(() => {
          socket.emit("webrtc-answer", { code: currentCode, desc: pc.localDescription });
        });
      });
    });
  } else {
    offerPending = desc; // stocke l'offre pour plus tard
  }
});

// Initialisation P2P au clic sur Télécharger
function startDownload(btn) {
  log("Téléchargement en cours...");
  downloadContainer.style.display = "block";
  pc = new RTCPeerConnection(rtcConfig);

  pc.ondatachannel = e => {
    dataChannel = e.channel;
    dataChannel.binaryType = "arraybuffer";
    dataChannel.onmessage = onData;
    log("Connecté au sender, téléchargement en cours...");
  };

  pc.onicecandidate = e => {
    if (e.candidate) socket.emit("webrtc-ice", { code: currentCode, candidate: e.candidate });
  };

  // Si une offre était déjà reçue, on la traite maintenant
  if (offerPending) {
    pc.setRemoteDescription(offerPending).then(() => {
      pc.createAnswer().then(answer => {
        pc.setLocalDescription(answer).then(() => {
          socket.emit("webrtc-answer", { code: currentCode, desc: pc.localDescription });
          offerPending = null;
        });
      });
    });
  }

  // Supprime le texte "En attente" et le bouton, pour afficher la barre seulement
  downloadArea.innerHTML = "<p>📥 Téléchargement en cours...</p>";
  downloadArea.appendChild(downloadContainer);
}

// Réception ICE candidates
socket.on("webrtc-ice", async ({ candidate }) => {
  if (!pc) return;
  try { await pc.addIceCandidate(candidate); } catch (err) { console.error(err); }
});

// Réception des données et mise à jour de la barre
function onData(e) {
  if (typeof e.data === "string") {
    try {
      const msg = JSON.parse(e.data);
      if (msg.done) {
        const blob = new Blob(receiveBuffer);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = msg.name;
        a.click();
        log("Téléchargement terminé !");
        downloadBar.style.width = "100%";

        // Affiche que le fichier est téléchargé
        downloadArea.innerHTML = `<p>✅ Téléchargement terminé : ${msg.name}</p>`;

        receiveBuffer = [];
        totalBytes = 0;
        return;
      }
    } catch {}
  } else {
    receiveBuffer.push(e.data);
    totalBytes += e.data.byteLength;
    if (fileInfo && fileInfo.size) {
      let percent = Math.floor((totalBytes / fileInfo.size) * 100);
      downloadBar.style.width = percent + "%";
      log(`Téléchargement en cours... ${percent}%`);
    }
  }
}
