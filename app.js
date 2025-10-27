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

// Sessions actives : { code: { senderSocket, receiverSockets: [], fileInfo } }
const sessions = {};

io.on("connection", socket => {
  console.log("🔗 Nouvelle connexion :", socket.id);

  // --- Création d’un code par le sender ---
  socket.on("create-code", (fileInfo, callback) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    sessions[code] = { senderSocket: socket, receiverSockets: [], fileInfo };
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

    // On ajoute ce receveur dans le tableau, pas de blocage
    session.receiverSockets.push(socket);
    console.log("✅ Receveur connecté pour le code :", code);
    callback({ ok: true, fileInfo: session.fileInfo });

    // Prévenir l’expéditeur que quelqu’un a rejoint
    session.senderSocket.emit("receiver-joined", code);
  });

  // --- Transmission des offres WebRTC ---
  socket.on("webrtc-offer", ({ code, desc }) => {
    const s = sessions[code];
    if (s?.receiverSockets?.length) {
      s.receiverSockets.forEach(r => r.emit("webrtc-offer", { desc }));
      console.log("📨 Offre WebRTC envoyée aux receveurs pour code :", code);
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

    if (socket === s.senderSocket && s.receiverSockets.length) {
      s.receiverSockets.forEach(r => r.emit("webrtc-ice", { candidate }));
    } else if (s.receiverSockets.includes(socket) && s.senderSocket) {
      s.senderSocket.emit("webrtc-ice", { candidate });
    }
  });

  // --- Déconnexion d’un client ---
  socket.on("disconnect", () => {
    for (const [code, s] of Object.entries(sessions)) {
      if (s.senderSocket === socket) {
        // Déconnecte tous les receveurs et supprime la session
        s.receiverSockets.forEach(r => r.disconnect(true));
        delete sessions[code];
        console.log(`❌ Session ${code} supprimée suite à la déconnexion de l'expéditeur ${socket.id}`);
        break;
      } else if (s.receiverSockets.includes(socket)) {
        // Retire seulement ce receveur
        s.receiverSockets = s.receiverSockets.filter(r => r !== socket);
        console.log(`❌ Receveur ${socket.id} retiré du code ${code}`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
