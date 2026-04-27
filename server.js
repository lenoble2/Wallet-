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
    // PLUS DE REPLACE : On utilise l'ID complet (ex: 080002)
    const userId = req.params.id;

    db.query('SELECT nom, solde FROM utilisateurs WHERE id = ?', [userId], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Erreur serveur" });
        }
        if (results.length > 0) {
            res.json({ success: true, user: results[0] });
        } else {
            res.json({ success: false, message: "Utilisateur non trouvé" });
        }
    });
});
// 4. Vérification destinataire
app.get('/api/verif-destinataire/:id', (req, res) => {
    // PLUS DE REPLACE : On utilise l'ID tel qu'il est saisi dans le champ
    const userId = req.params.id; 

    db.query('SELECT nom FROM utilisateurs WHERE id = ?', [userId], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        
        if (results.length > 0) {
            res.json({ success: true, nom: results[0].nom });
        } else {
            res.json({ success: false, message: "Inconnu" });
        }
    });
});


// --- CRÉATION DE LA TABLE (à mettre après db.connect) ---
const sqlCreateTable = `
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expediteur_id VARCHAR(50),
    destinataire_id VARCHAR(50),
    montant DECIMAL(10, 2),
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`;

db.query(sqlCreateTable, (err) => {
    if (err) {
        console.error("Erreur création table:", err);
    } else {
        console.log("✅ Table 'transactions' prête !");
    }
});

// --- ROUTE 3 : TRANSFERT ---
app.post('/api/transfert-test', (req, res) => {
    const { id_expediteur, id_destinataire, montant } = req.body;
    const somme = parseFloat(montant);

    const cleanSenderId = id_expediteur ? id_expediteur.toString().replace("08000", "") : null;
    const cleanReceiverId = id_destinataire ? id_destinataire.toString().replace("08000", "") : null;

    // CORRIGÉ : Ajout des || manquants
    if (!cleanSenderId || !cleanReceiverId || isNaN(somme) || somme <= 0) {
        return res.json({ success: false, message: "Données invalides" });
    }

    // 1. Vérifier l'expéditeur et son solde
    db.query('SELECT solde FROM utilisateurs WHERE id = ?', [cleanSenderId], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: 'Expéditeur introuvable' });

        const soldeExp = results[0].solde;
        if (soldeExp < somme) return res.json({ success: false, message: 'Solde insuffisant' });

        // 2. Débit expéditeur
        db.query('UPDATE utilisateurs SET solde = solde - ? WHERE id = ?', [somme, cleanSenderId], (err) => {
            if (err) return res.json({ success: false, message: 'Erreur débit' });

            // 3. Crédit destinataire
            db.query('UPDATE utilisateurs SET solde = solde + ? WHERE id = ?', [somme, cleanReceiverId], (err, resultDest) => {
                if (err || resultDest.affectedRows === 0) {
                    // Remboursement si erreur
                    db.query('UPDATE utilisateurs SET solde = solde + ? WHERE id = ?', [somme, cleanSenderId]);
                    return res.json({ success: false, message: 'Destinataire introuvable' });
                }

                // 4. Enregistrement historique
                const sqlHist = "INSERT INTO transactions (expediteur_id, destinataire_id, montant) VALUES (?, ?, ?)";
                db.query(sqlHist, [cleanSenderId, cleanReceiverId, somme], (errH) => {
                    if (errH) console.error("Erreur historique:", errH);
                    
                    // CORRIGÉ : Backticks ajoutés pour le message
                    res.json({ 
                        success: true, 
                        message: `Transfert de ${somme} XOF réussi vers l'ID ${cleanReceiverId} !` 
                    });
                });
            });
        });
    });
});

// --- ROUTE ADMIN ---
app.get('/api/admin/utilisateurs', (req, res) => {
    const query = "SELECT id, nom, email, solde FROM utilisateurs ORDER BY id ASC";
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Erreur DB" });
        
        const usersFormatted = results.map(user => ({
            ...user,
            idDisplay: user.id.toString().padStart(6, '0')
        }));
        res.json({ success: true, users: usersFormatted });
    });
});

// --- ROUTE HISTORIQUE ADAPTÉE ---

// --- ROUTE HISTORIQUE NETTOYÉE ---
app.get('/api/historique/:id', (req, res) => {
    const userId = req.params.id; // On garde l'ID complet (ex: 080005)

    const sql = `
        SELECT * FROM transactions
        WHERE expediteur_id = ? OR destinataire_id = ?
        ORDER BY date DESC LIMIT 20`;

    db.query(sql, [userId, userId], (err, results) => {
        if (err) return res.json({ success: false, message: 'Erreur SQL' });
        res.json({ success: true, transactions: results });
    });
});


// --- LANCEMENT ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    // CORRIGÉ : Backticks ajoutés
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});

