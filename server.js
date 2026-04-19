require('dotenv').config();
const express = require('express');
const mysql = require('mysql2'); // Ajout de mysql2
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 1. Configuration Aiven
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'leandb',
    port: process.env.DB_PORT || 26250,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 20000
};

// 2. Test de connexion au démarrage
const db = mysql.createConnection(dbConfig);

db.connect(err => {
    if (err) {
        console.error('❌ La connexion Aiven a échoué :', err.message);
    } else {
        console.log('✅ Connexion réussie à Aiven MySQL !');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🌍 Serveur en ligne sur le port ${PORT}`);
});

