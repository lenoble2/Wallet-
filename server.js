require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Configuration de base
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Route de test simple
app.get('/test', (req, res) => {
    res.json({ message: "Le serveur brute fonctionne !" });
});

// Route pour servir ton fichier index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Utilisation du port 10000 (standard pour Render)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🌍 Serveur démarré sur le port ${PORT}`);
});

