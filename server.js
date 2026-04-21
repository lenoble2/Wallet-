
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
// 1. Déclare la variable db en haut
let db;

// 2. Définis la fonction de connexion
function handleDisconnect() {
    db = mysql.createConnection(dbConfig); // Assure-toi que dbConfig est bien défini au-dessus

    db.connect(err => {
        if (err) {
            console.error('❌ Erreur DB:', err);
            setTimeout(handleDisconnect, 2000); // Réessaie si ça échoue
        } else {
            console.log('✅ Connecté à la base de données');
        }
    });

    db.on('error', err => {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect();
        } else {
            throw err;
        }
    });
}

// 3. APPELLE LA FONCTION pour démarrer la connexion
handleDisconnect();

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
// Route pour récupérer les infos de l'utilisateur (utilisée par le dashboard)
app.get('/api/utilisateur/:id', (req, res) => {
    const userId = req.params.id;
    
    db.query("SELECT solde FROM utilisateurs WHERE id = ?", [userId], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Erreur DB" });
        }
        if (results.length > 0) {
            res.json({ success: true, user: { solde: results[0].solde } });
        } else {
            res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
        }
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

app.get('/api/verif-destinataire/:id', (req, res) => {
    // On enlève le "08000" pour ne garder que l'ID numérique (ex: 2)
    const idNettoye = req.params.id.replace("08000", "").trim();

    db.query("SELECT nom FROM utilisateurs WHERE id = ?", [idNettoye], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Erreur base de données" });
        }
        
        if (results.length > 0) {
            // Le destinataire existe
            res.json({ success: true, nom: results[0].nom });
        } else {
            // Personne n'a été trouvé
            res.json({ success: false, message: "Destinataire introuvable" });
        }
    });
});


// ROUTE DE TRANSFERT
app.post('/api/verif-destinataire', (req, res) => {
    const { receiverId } = req.body;
    
    // On nettoie l'ID au cas où l'utilisateur a écrit 080002 au lieu de 2
    const cleanId = receiverId.toString().replace("08000", "").trim();

    console.log("Vérification du destinataire ID:", cleanId);

    const sql = "SELECT nom FROM utilisateurs WHERE id = ?";
    db.query(sql, [cleanId], (err, results) => {
        if (err) {
            console.error("Erreur SQL:", err);
            return res.status(500).json({ success: false, message: "Erreur technique base de données" });
        }

        if (results.length > 0) {
            // L'utilisateur existe !
            res.json({ success: true, message: "Oui, le destinataire " + results[0].nom + " existe !" });
        } else {
            // L'utilisateur n'existe pas
            res.json({ success: false, message: "Non, ce destinataire n'existe pas dans la base." });
        }
    });
});

// ÉCOUTE DU PORT (CRUCIAL POUR RENDER)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Serveur démarré sur le port " + PORT);
});
