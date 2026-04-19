require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Configuration Aiven (Utilise tes variables d'environnement sur Render)
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'leandb',
    port: process.env.DB_PORT || 26250,
    ssl: { rejectUnauthorized: false }, // SSL REQUIS pour Aiven
    connectTimeout: 20000 
};

// Tentative de connexion
const db = mysql.createConnection(dbConfig);

db.connect(err => {
    if (err) {
        console.error('❌ Echec de connexion Aiven :', err.message);
    } else {
        console.log('✅ Connecté avec succès à Aiven MySQL !');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🌍 Serveur en écoute sur le port ${PORT}`);
});

