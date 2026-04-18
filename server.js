require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 25060,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 10000 
};

let db;

function handleDisconnect() {
    db = mysql.createConnection(dbConfig);

    db.connect(err => {
        if (err) {
            console.log('❌ Erreur de connexion :', err.message);
            setTimeout(handleDisconnect, 2000);
        } else {
            console.log('✅ Connecté avec succès à Aiven Cloud');
        }
    });

    db.on('error', err => {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect();
        } else {
            console.error('Erreur DB fatale:', err);
        }
    });
}

handleDisconnect();
// --- ROUTES DE L'APPLICATION ---

// 1. Inscription
app.post('/api/inscription', (req, res) => {
    const { nom, email, pin } = req.body;
    const query = 'INSERT INTO utilisateurs (nom, email, pin, solde) VALUES (?, ?, ?, 0.00)';
    
    db.query(query, [nom, email, pin], (err, result) => {
        if (err) {
            console.error('Erreur SQL:', err);
            return res.status(500).json({ error: 'Erreur lors de l\'inscription' });
        }
        res.status(201).json({ 
            success: true, 
            user: { id: result.insertId, nom, email, solde: 0 } 
        });
    });
});

// 2. Connexion
app.post('/api/connexion', (req, res) => {
    const { email, pin } = req.body;
    const query = 'SELECT * FROM utilisateurs WHERE email = ? AND pin = ?';
    
    db.query(query, [email, pin], (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ success: false, message: 'Identifiants incorrects' });
        }
        const user = results[0];
        res.json({ 
            success: true, 
            user: { id: user.id, nom: user.nom, email: user.email, solde: user.solde } 
        });
    });
});

// 3. Transfert d'argent
app.post('/api/transferer', (req, res) => {
    const { expediteur_id, email_destinataire, montant } = req.body;
    const mnt = parseFloat(montant);

    if (isNaN(mnt) || mnt <= 0) return res.status(400).json({ error: 'Montant invalide' });

    // Trouver le destinataire
    db.query('SELECT id FROM utilisateurs WHERE email = ?', [email_destinataire], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ error: 'Destinataire introuvable' });
        
        const dest_id = results[0].id;

        // Débiter l'expéditeur
        db.query('UPDATE utilisateurs SET solde = solde - ? WHERE id = ? AND solde >= ?', [mnt, expediteur_id, mnt], (err, result) => {
            if (err || result.affectedRows === 0) return res.status(400).json({ error: 'Solde insuffisant' });

            // Créditer le destinataire
            db.query('UPDATE utilisateurs SET solde = solde + ? WHERE id = ?', [mnt, dest_id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur lors du transfert' });
                res.json({ success: true, message: 'Transfert réussi !' });
            });
        });
    });
});

// 4. Servir la page d'accueil (Dashboard ou Index)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- LANCEMENT DU SERVEUR ---
const PORT = 10000;

app.listen(PORT, () => {
    console.log("🚀 Serveur Lean operationnel");
    console.log("Port: " + PORT);
});



