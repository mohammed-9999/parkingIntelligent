const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configuration CORS plus permissive pour WebSocket
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Créer le serveur WebSocket sur un port différent
const WS_PORT = 3002;
const wss = new WebSocket.Server({ 
  port: WS_PORT,
  perMessageDeflate: false,
  clientTracking: true
});

// Configuration de l'email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// État initial des places de parking
let parkingSpots = [
  { id: 1, status: 'libre', lastUpdate: new Date() },
  { id: 2, status: 'libre', lastUpdate: new Date() },
  { id: 3, status: 'libre', lastUpdate: new Date() },
  { id: 4, status: 'libre', lastUpdate: new Date() },
  { id: 5, status: 'libre', lastUpdate: new Date() },
  { id: 6, status: 'libre', lastUpdate: new Date() }
];

// Map pour stocker les réservations actives
const activeReservations = new Map();

// Gestion des connexions WebSocket
wss.on('connection', (ws, req) => {
  console.log('Nouvelle connexion WebSocket depuis:', req.socket.remoteAddress);
  
  // Envoyer l'état initial
  try {
    ws.send(JSON.stringify({
      type: 'INITIAL_STATE',
      data: parkingSpots
    }));
    console.log('État initial envoyé au client');
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'état initial:', error);
  }

  // Gestion des messages du client
  ws.on('message', (message) => {
    try {
      console.log('Message reçu:', message.toString());
    } catch (error) {
      console.error('Erreur lors du traitement du message:', error);
    }
  });

  // Gestion des erreurs
  ws.on('error', (error) => {
    console.error('Erreur WebSocket:', error);
  });

  // Gestion de la déconnexion
  ws.on('close', (code, reason) => {
    console.log('Client déconnecté. Code:', code, 'Raison:', reason);
  });
});

// Gestion des erreurs du serveur WebSocket
wss.on('error', (error) => {
  console.error('Erreur du serveur WebSocket:', error);
});

// Fonction pour diffuser les mises à jour à tous les clients connectés
function broadcastUpdate(spot) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({
          type: 'UPDATE',
          data: spot
        }));
      } catch (error) {
        console.error('Erreur lors de la diffusion de la mise à jour:', error);
      }
    }
  });
}

// Route pour obtenir l'état initial des places
app.get('/api/parking-spots', (req, res) => {
  res.json(parkingSpots);
});

// Route pour mettre à jour l'état d'une place
app.post('/api/update-spot', async (req, res) => {
  const { id, status } = req.body;
  
  const spotIndex = parkingSpots.findIndex(spot => spot.id === id);
  if (spotIndex !== -1) {
    parkingSpots[spotIndex] = {
      ...parkingSpots[spotIndex],
      status,
      lastUpdate: new Date()
    };

    // Diffuser la mise à jour à tous les clients WebSocket
    broadcastUpdate(parkingSpots[spotIndex]);

    res.json(parkingSpots[spotIndex]);
  } else {
    res.status(404).json({ error: 'Place non trouvée' });
  }
});

// Route pour mettre à jour l'état d'une place (utilisée par l'ESP32)
app.post('/api/parking-spots/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, distance } = req.body;
  
  const spot = parkingSpots.find(spot => spot.id === parseInt(id));
  if (spot) {
    //start modification de claude
    // Vérifier si la place est réservée
    if (activeReservations.has(parseInt(id))) {
      console.log(`Place ${id} est réservée, mise à jour ignorée`);
      return res.json({ 
        success: true, 
        message: 'Place réservée, mise à jour ignorée',
        status: 'réservé',
        spot 
      });
    }
    //end modification de claude

    // Déterminer le statut en fonction de la distance
    let newStatus = status;
    if (distance !== undefined) {
      // Si la distance est inférieure à 20 cm, la place est occupée
      newStatus = distance < 20 ? 'occupé' : 'libre';
    }

    spot.status = newStatus;
    spot.lastUpdate = new Date();
    
    // Si la place est occupée, envoyer un email
    if (newStatus === 'occupé') {
      transporter.sendMail({
        from: 'arbibm55@gmail.com',
        to: 'arbibm66@gmail.com',
        subject: '🚨 Alerte : Place de parking occupée',
        text: `Une voiture occupe la place de parking ${id}.\nDistance détectée : ${distance} cm.`
      }).catch(error => {
        console.error('Erreur lors de l\'envoi de l\'email:', error);
      });
    }
    
    // Diffuser la mise à jour à tous les clients connectés
    broadcastUpdate(spot);
    
    res.json({ success: true, spot });
  } else {
    res.status(404).json({ success: false, message: 'Place non trouvée' });
  }
});

// Route pour envoyer une notification par email
app.post('/api/send-notification', async (req, res) => {
  const { email, message } = req.body;
  
  try {
    await transporter.sendMail({
      from: 'arbibm55@gmail.com',
      to: email,
      subject: 'Notification Parking Intelligent',
      text: message
    });
    
    res.json({ message: 'Notification envoyée avec succès' });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la notification' });
  }
});

// Route pour réserver une place
app.post('/api/reserve-spot', async (req, res) => {
  const { id } = req.body;
  
  try {
    const spot = parkingSpots.find(spot => spot.id === parseInt(id));
    
    if (!spot) {
      return res.status(404).json({ error: 'Place non trouvée' });
    }
    
    if (spot.status !== 'libre') {
      return res.status(400).json({ error: 'La place n\'est pas disponible' });
    }
    
    if (activeReservations.has(id)) {
      return res.status(400).json({ error: 'La place est déjà réservée' });
    }
    
    // Mettre à jour le statut de la place
    spot.status = 'réservé';
    spot.lastUpdate = new Date();
    
    // Enregistrer la réservation
    activeReservations.set(id, {
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // Expire après 30 minutes
    });
    

    // Forcer une mise à jour immédiate vers l'ESP32
    try {
      // On peut envoyer une notification fictive à l'ESP spécifique
      // Cette partie n'est pas nécessaire si votre ESP32 interroge régulièrement le serveur
      console.log(`Mise à jour immédiate pour ESP32 - Place ${id} réservée`);
    } catch (err) {
      console.error("Erreur lors de la notification ESP32:", err);
    }

    
    // Diffuser la mise à jour
    broadcastUpdate(spot);
    
    res.json({ 
      success: true, 
      message: 'Place réservée avec succès',
      spot 
    });
    
  } catch (error) {
    console.error('Erreur lors de la réservation:', error);
    res.status(500).json({ error: 'Erreur lors de la réservation' });
  }
});

// Route pour annuler une réservation
app.post('/api/cancel-reservation', async (req, res) => {
  const { id } = req.body;
  
  try {
    const spot = parkingSpots.find(spot => spot.id === parseInt(id));
    
    if (!spot) {
      return res.status(404).json({ error: 'Place non trouvée' });
    }
    
    if (!activeReservations.has(id)) {
      return res.status(400).json({ error: 'Aucune réservation active pour cette place' });
    }
    
    // Mettre à jour le statut de la place
    spot.status = 'libre';
    spot.lastUpdate = new Date();
    
    // Supprimer la réservation
    activeReservations.delete(id);
    
    // Diffuser la mise à jour
    broadcastUpdate(spot);
    
    res.json({ 
      success: true, 
      message: 'Réservation annulée avec succès',
      spot 
    });
    
  } catch (error) {
    console.error('Erreur lors de l\'annulation:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation' });
  }
});

// Nettoyage périodique des réservations expirées
setInterval(() => {
  const now = new Date();
  for (const [id, reservation] of activeReservations.entries()) {
    if (now > reservation.expiresAt) {
      const spot = parkingSpots.find(spot => spot.id === parseInt(id));
      if (spot) {
        spot.status = 'libre';
        spot.lastUpdate = new Date();
        broadcastUpdate(spot);
      }
      activeReservations.delete(id);
    }
  }
}, 60000); // Vérifie toutes les minutes

const PORT = process.env.PORT || 3001;

// Démarrer le serveur HTTP
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur HTTP démarré sur le port ${PORT}`);
  console.log(`Serveur WebSocket démarré sur le port ${WS_PORT}`);
});