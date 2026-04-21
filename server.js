
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
    port: process.env.DB_PORT || 26246,
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

app.get('/test-db', (req, res) => {
    db.query("SELECT 1 + 1 AS result", (err, results) => {
        if (err) return res.status(500).send("Erreur SQL : " + err.message);
        res.send("La base de données répond bien ! Résultat : " + results[0].result);
    });
});



db.connect(err => {
    if (err) console.error("Erreur de connexion DB:", err);
    else console.log("Connecté à la base de données !");
});

// ROUTE DE TRANSFERT
app.post('/api/transfert', (req, res) => {
    const { senderId, receiverId, montant, pin } = req.body;

    // Étape 1 : Vérification expéditeur et PIN
    db.query("SELECT solde, pin FROM utilisateurs WHERE id = ?", [senderId], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: "Erreur expéditeur" });
        
        if (results[0].pin !== pin) return res.json({ success: false, message: "PIN incorrect" });
        if (results[0].solde < montant) return res.json({ success: false, message: "Solde insuffisant" });

        // Étape 2 : Débit
        db.query("UPDATE utilisateurs SET solde = solde - ? WHERE id = ?", [montant, senderId], (err) => {
            if (err) return res.json({ success: false, message: "Erreur débit" });

            // Étape 3 : Crédit
            db.query("UPDATE utilisateurs SET solde = solde + ? WHERE id = ?", [montant, receiverId], (err, result) => {
                if (err || result.affectedRows === 0) {
                    db.query("UPDATE utilisateurs SET solde = solde + ? WHERE id = ?", [montant, senderId]);
                    return res.json({ success: false, message: "Destinataire introuvable" });
                }
                res.json({ success: true, message: "Transfert réussi !" });
            });
        });
    });
});

// ÉCOUTE DU PORT (CRUCIAL POUR RENDER)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Serveur démarré sur le port " + PORT);
});
