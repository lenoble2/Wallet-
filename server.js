
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
    database: process.env.DB_NAME || 'leandb',
    port: process.env.DB_PORT || 26250,
    ssl: { rejectUnauthorized: false },
    connectTimeout: 20000
};

let db;

function handleDisconnect() {
    db = mysql.createConnection(dbConfig);
    db.connect(err => {
        if (err) {
            console.error('❌ Erreur DB:', err.message);
            setTimeout(handleDisconnect, 5000);
        } else {
            console.log('✅ Connecté à Aiven MySQL !');
            initialiserBase();
        }
    });
    db.on('error', err => {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') handleDisconnect();
        else throw err;
    });
}

function initialiserBase() {
    const tableQuery = `CREATE TABLE IF NOT EXISTS utilisateurs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nom VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        pin VARCHAR(10),
        solde DECIMAL(15, 2) DEFAULT 0.00
    );`;

    db.query(tableQuery, (err) => {
        if (err) return console.log("❌ Erreur table:", err.message);
        
        // Vérification et création du compte COFFRE
        db.query('SELECT id FROM utilisateurs WHERE email = ?', ['coffre@lean.com'], (err, results) => {
            if (err) return console.log("❌ Erreur SQL:", err.message);

            if (results.length === 0) {
                const insertCoffre = `INSERT INTO utilisateurs (nom, email, pin, solde) 
                                     VALUES ('Coffre Fort', 'coffre@lean.com', '0000', 10000000.00)`;
                db.query(insertCoffre, (err) => {
                    if (err) console.log("❌ Erreur création Coffre:", err.message);
                    else console.log("💰 Compte coffre@lean.com créé avec 10 000 000 XOF !");
                });
            } else {
                db.query('UPDATE utilisateurs SET solde = 10000000.00 WHERE email = ?', ['coffre@lean.com'], (err) => {
                    if (err) console.log("❌ Erreur MAJ Coffre:", err.message);
                    else console.log("✅ Solde du Coffre mis à jour.");
                });
            }
        });
    });
}

   

// 1. Inscription
app.post('/api/inscription', (req, res) => {
    const { nom, email, pin } = req.body;
    const query = 'INSERT INTO utilisateurs (nom, email, pin, solde) VALUES (?, ?, ?, 5000.00)';
    db.query(query, [nom, email, pin], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "Email déjà utilisé" });
        res.json({ success: true, message: "Compte créé !" });
    });
});

// 2. Connexion
app.post('/api/connexion', (req, res) => {
    const { email, pin } = req.body;
    db.query('SELECT * FROM utilisateurs WHERE email = ? AND pin = ?', [email, pin], (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ success: false, message: "Identifiants invalides" });
        res.json({ success: true, user: results[0] });
    });
});

// 3. Récupérer infos utilisateur (pour le Dashboard)
app.get('/api/utilisateur/:id', (req, res) => {
    db.query('SELECT id, nom, solde, email FROM utilisateurs WHERE id = ?', [req.params.id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false });
        res.json({ success: true, user: results[0] });
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const SYSTEM_EMAIL = "pourcent@lean.com";
const FEE_PERCENTAGE = 0.005;

// ROUTE DE TRANSFERT (DÉBIT ET CRÉDIT)
app.post('/api/transfert', (req, res) => {
    const { senderId, receiverId, montant } = req.body;
    const mnt = parseFloat(montant);

    // 1. Validation du montant
    if (isNaN(mnt) || mnt <= 0) {
        return res.status(400).json({ success: false, message: 'Montant invalide' });
    }

    // 2. Vérifier si le destinataire existe dans la table 'comptes'
    db.query('SELECT id FROM comptes WHERE id = ?', [receiverId], (err, results) => {
        if (err || !results || results.length === 0) {
            return res.status(404).json({ success: false, message: 'Destinataire introuvable' });
        }
        
        const dest_id = results[0].id;

        // 3. DÉBIT : On retire l'argent SEULEMENT si le solde est suffisant (solde >= mnt)
        const sqlDebit = 'UPDATE comptes SET solde = solde - ? WHERE id = ? AND solde >= ?';
        db.query(sqlDebit, [mnt, senderId, mnt], (err, result) => {
            if (err || result.affectedRows === 0) {
                return res.status(400).json({ success: false, message: 'Solde insuffisant ou expéditeur inconnu' });
            }

            // 4. CRÉDIT : On ajoute l'argent au destinataire
            db.query('UPDATE comptes SET solde = solde + ? WHERE id = ?', [mnt, dest_id], (err) => {
                if (err) {
                    // En cas d'erreur ici, il faudrait normalement rembourser l'expéditeur
                    return res.status(500).json({ success: false, message: 'Erreur lors du crédit' });
                }
                
                console.log(`Succès : ${mnt} XOF transférés de ${senderId} à ${dest_id}`);
                res.json({ success: true, message: 'Transfert réussi !' });
            });
        });
    });
});


handleDisconnect();
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🌍 Serveur Lean opérationnel sur le port ${PORT}`);
});

