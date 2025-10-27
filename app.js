// === app.js ===
// Serveur PeerSend (Signalisation WebRTC) pour transfert P2P

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Sert les fichiers statiques du dossier public/
app.use(express.static(path.join(__dirname, "public")));

// Sessions actives : { code: { senderSocket, receiverSocket, fileInfo } }
const sessions = {};

io.on("connection", socket => {
  console.log("🔗 Nouvelle connexion :", socket.id);

  // --- Création d’un code par le sender ---
  socket.on("create-code", (fileInfo, callback) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    sessions[code] = { senderSocket: socket, receiverSocket: null, fileInfo };
    console.log("📦 Nouveau code créé :", code, "par", socket.id);
    callback({ code });
  });

  // --- Rejoindre un code existant par le receiver ---
  socket.on("join-code", (code, callback) => {
    console.log("Receveur tente de rejoindre le code :", code);
    const session = sessions[code];

    if (!session) {
      console.log("❌ Code introuvable :", code);
      return callback({ ok: false });
    }

    if (session.receiverSocket) {
      console.log("❌ Code déjà utilisé par un autre receveur :", code);
      return callback({ ok: false });
    }

    session.receiverSocket = socket;
    console.log("✅ Receveur connecté pour le code :", code);
    callback({ ok: true, fileInfo: session.fileInfo });

    // Prévenir l’expéditeur que quelqu’un a rejoint
    session.senderSocket.emit("receiver-joined", code);
  });

  // --- Transmission des offres WebRTC ---
  socket.on("webrtc-offer", ({ code, desc }) => {
    const s = sessions[code];
    if (s?.receiverSocket) {
      s.receiverSocket.emit("webrtc-offer", { desc });
      console.log("📨 Offre WebRTC envoyée au receveur pour code :", code);
    }
  });

  // --- Transmission des réponses WebRTC ---
  socket.on("webrtc-answer", ({ code, desc }) => {
    const s = sessions[code];
    if (s?.senderSocket) {
      s.senderSocket.emit("webrtc-answer", { desc });
      console.log("📨 Réponse WebRTC envoyée au sender pour code :", code);
    }
  });

  // --- Transmission des ICE candidates ---
  socket.on("webrtc-ice", ({ code, candidate }) => {
    const s = sessions[code];
    if (!s) return;

    if (socket === s.senderSocket && s.receiverSocket) {
      s.receiverSocket.emit("webrtc-ice", { candidate });
    } else if (socket === s.receiverSocket && s.senderSocket) {
      s.senderSocket.emit("webrtc-ice", { candidate });
    }
  });

  // --- Déconnexion d’un client ---
  socket.on("disconnect", () => {
    for (const [code, s] of Object.entries(sessions)) {
      if (s.senderSocket === socket || s.receiverSocket === socket) {
        delete sessions[code];
        console.log(`❌ Session ${code} supprimée suite à la déconnexion de ${socket.id}`);
        break;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
