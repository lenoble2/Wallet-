require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Connexion à Aiven Cloud
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

db.connect(err => {
    if (err) {
        console.log('❌ Erreur DB: ' + err.message);
    } else {
        console.log('✅ Connecté à Aiven Cloud');
    }
});

// --- INSCRIPTION ---
app.post('/api/inscription', (req, res) => {
    const { nom, email, pin } = req.body;
    const query = 'INSERT INTO utilisateurs (nom, email, pin, solde) VALUES (?, ?, ?, 0.00)';
    
    db.query(query, [nom, email, pin], (err, result) => {
        if (err) return res.status(500).json({ error: 'Erreur inscription' });
        res.status(201).json({ success: true });
    });
});

// --- CONNEXION ---
app.post('/api/connexion', (req, res) => {
    const { email, pin } = req.body;
    const query = 'SELECT id, nom, email, solde FROM utilisateurs WHERE email = ? AND pin = ?';
    
    db.query(query, [email, pin], (err, results) => {
        if (err) return res.status(500).json({ error: 'Erreur serveur' });
        
        if (results.length > 0) {
            res.json({ success: true, user: results[0] });
        } else {
            res.status(401).json({ success: false, message: 'Email ou PIN incorrect.' });
        }
    });
});

// --- TRANSFERT ---
app.post('/api/transferer', (req, res) => {
    const { expediteur_id, email_destinataire, montant } = req.body;
    const mnt = parseFloat(montant);

    db.query('SELECT id FROM utilisateurs WHERE email = ?', [email_destinataire], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ error: 'Destinataire introuvable' });

        const dest_id = results[0].id;

        db.query('UPDATE utilisateurs SET solde = solde - ? WHERE id = ? AND solde >= ?', [mnt, expediteur_id, mnt], (err, result) => {
            if (result.affectedRows === 0) return res.status(400).json({ error: 'Solde insuffisant' });

            db.query('UPDATE utilisateurs SET solde = solde + ? WHERE id = ?', [mnt, dest_id], (err) => {
                if (err) return res.status(500).json({ error: 'Erreur transfert' });
                res.json({ success: true, message: 'Transfert réussi !' });
            });
        });
    });
});

// Servir le HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Serveur Lean pret sur le port ' + PORT);
});
