require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
});

app.get('/api/admin/utilisateurs', (req, res) => {
    // On récupère tout le monde
    db.query('SELECT id, nom, solde FROM utilisateurs', (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json(results); 
    });
});



app.get('/api/admin/utilisateurs', (req, res) => { /* ta requête SQL */ });


app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.use(express.static(__dirname));


// Configuration de la base de données
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

db.connect((err) => {
    if (err) {
        console.error("❌ ERREUR CRITIQUE DE CONNEXION :");
        console.error("Message :", err.message);
        console.error("Code d'erreur :", err.code);
        // On ne coupe pas le serveur pour pouvoir lire les logs sur Render
    } else {
        console.log("✅ Connecté à la base de données MySQL");
        initialiserBase();
    }
});

    db.on('error', (err) => {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect();
        } else {
            throw err;
        }
    });
}

function initialiserBase() {
const tableQuery = 'CREATE TABLE IF NOT EXISTS utilisateurs (id INT AUTO_INCREMENT PRIMARY KEY, nom VARCHAR(100), email VARCHAR(100) UNIQUE, pin VARCHAR(10), solde DECIMAL(15, 2) DEFAULT 0.00)';
    db.query(tableQuery, (err) => {
        if (err) console.error('❌ Erreur :', err.message);
        else console.log('📊 Table prête');
    });
}


handleDisconnect();

// --- ROUTES ---

// 1. Inscription
app.post('/api/inscription', (req, res) => {
    const { nom, email, pin } = req.body;
    const query = 'INSERT INTO utilisateurs (nom, email, pin) VALUES (?, ?, ?)';
    db.query(query, [nom, email, pin], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: "Email déjà utilisé ou erreur DB" });
        }
        res.json({ success: true, message: "Compte créé avec succès" });
    });
});

// 2. Connexion
app.post('/api/connexion', (req, res) => {
    const { email, pin } = req.body;
    const query = 'SELECT * FROM utilisateurs WHERE email = ? AND pin = ?';
    db.query(query, [email, pin], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
        if (results.length === 0) {
            return res.json({ success: false, message: "Identifiants incorrects" });
        }
        res.json({ success: true, user: results[0] });
    });
});

// 3. Récupérer infos utilisateur
app.get('/api/utilisateur/:id', (req, res) => {
    const userId = req.params.id;
    db.query('SELECT nom, solde FROM utilisateurs WHERE id = ?', [userId], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        if (results.length > 0) {
            res.json({ success: true, user: results[0] });
        } else {
            res.status(404).json({ success: false, message: "Non trouvé" });
        }
    });
});

// 4. Vérification destinataire
app.get('/api/verif-destinataire/:id', (req, res) => {
    const idNettoye = req.params.id.replace("08000", ""); // Ton système de nettoyage
    db.query('SELECT nom FROM utilisateurs WHERE id = ?', [idNettoye], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        if (results.length > 0) {
            res.json({ success: true, nom: results[0].nom });
        } else {
            res.json({ success: false, message: "Inconnu" });
        }
    });
});


// ROUT TRANSFERT

app.post('/api/transfert', (req, res) => {
    const { expediteurId, dest, montant, pin } = req.body;
    const montantNum = parseFloat(montant);
    const idDestinataire = dest.replace("08000", "");

    db.beginTransaction((err) => {
        if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });

        // 1. Vérifier l'expéditeur (Solde et PIN)
        db.query('SELECT solde, pin FROM utilisateurs WHERE id = ?', [expediteurId], (err, results) => {
            if (err || results.length === 0) {
                return db.rollback(() => res.json({ success: false, message: "Expéditeur introuvable" }));
            }

            const user = results[0];
            if (user.pin !== pin) {
                return db.rollback(() => res.json({ success: false, message: "Code PIN incorrect" }));
            }
            if (user.solde < montantNum) {
                return db.rollback(() => res.json({ success: false, message: "Solde insuffisant" }));
            }

            // 2. Débiter l'expéditeur
            db.query('UPDATE utilisateurs SET solde = solde - ? WHERE id = ?', [montantNum, expediteurId], (err) => {
                if (err) return db.rollback(() => res.json({ success: false, message: "Erreur débit" }));

                // 3. Créditer le destinataire
                db.query('UPDATE utilisateurs SET solde = solde + ? WHERE id = ?', [montantNum, idDestinataire], (err, result) => {
                    if (err || result.affectedRows === 0) {
                        return db.rollback(() => res.json({ success: false, message: "Destinataire inconnu" }));
                    }

                    // 4. Valider définitivement
                    db.commit((err) => {
                        if (err) return db.rollback(() => res.json({ success: false }));
                        res.json({ success: true, message: "Transfert effectué !" });
                    });
                }); 
            }); 
        }); 
    }); 
});

// Route pour récupérer tous les utilisateurs (Admin)
app.get('/api/admin/utilisateurs', (req, res) => {
    const query = "SELECT id, nom, email, solde FROM utilisateurs ORDER BY id ASC";
    
    db.query(query, (err, results) => {
        if (err) {
            console.error("Erreur SQL:", err);
            return res.status(500).json({ success: false, message: "Erreur base de données" });
        }
        
        // On formate l'ID pour l'affichage (ex: 1 devient 080001)
        const usersFormatted = results.map(user => ({
            ...user,
            idDisplay: user.id.toString().padStart(6, '0') 
        }));

        res.json({ success: true, users: usersFormatted });
    });
});

// Lancement du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});

