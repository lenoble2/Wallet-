
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

const SYSTEM_EMAIL = "pourcent@lean.com";
const FEE_PERCENTAGE = 0.005;

// ROUTE DE TRANSFERT (DÉBIT ET CRÉDIT)
app.post('/api/transfert', async (req, res) => {
    const { senderId, receiverId, amount, pin } = req.body;

    try {
        // 1. Vérifier l'expéditeur et son PIN
        // On cherche par ID (ex: 1)
        const [sender] = await db.query('SELECT * FROM utilisateurs WHERE id = ?', [senderId]);
        
        if (sender.length === 0) {
            return res.status(404).json({ error: "Expéditeur introuvable" });
        }

        if (sender[0].pin !== pin) {
            return res.status(401).json({ error: "PIN de sécurité incorrect" });
        }

        if (parseFloat(sender[0].solde) < parseFloat(amount)) {
            return res.status(400).json({ error: "Solde insuffisant pour ce transfert" });
        }

        // 2. Vérifier le destinataire
        // Si tu saisis "080001", assure-toi que c'est bien l'ID dans ta table
        const [receiver] = await db.query('SELECT * FROM utilisateurs WHERE id = ?', [receiverId]);
        
        if (receiver.length === 0) {
            return res.status(404).json({ error: "Destinataire introuvable (ID inexistant)" });
        }

        // 3. Exécution du transfert (Transaction)
        await db.query('UPDATE utilisateurs SET solde = solde - ? WHERE id = ?', [amount, senderId]);
        await db.query('UPDATE utilisateurs SET solde = solde + ? WHERE id = ?', [amount, receiverId]);

        res.json({ message: `Transfert réussi ! ${amount} XOF envoyés à ${receiver[0].nom}` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur technique lors du transfert" });
    }
});



handleDisconnect();
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🌍 Serveur Lean opérationnel sur le port ${PORT}`);
});

