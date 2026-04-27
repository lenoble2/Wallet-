const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

const app = express();

// --- CONFIGURATION MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.use(session({
    secret: 'lean_secret',
    resave: false,
    saveUninitialized: true
}));

// --- CONNEXION BASE DE DONNÉES (AIVEN) ---
const db = mysql.createConnection({
    host: 'mysql-2640bf90-leantoken123-cb13.l.aivencloud.com',
    port: 26246,
    user: 'avnadmin',
    password: 'AVNS_tYZKEn9utteLIFKyPSj',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false }
});

db.connect(err => {
    if (err) {
        console.error('❌ Erreur connexion DB:', err.message);
    } else {
        console.log('🚀 Connecté à Aiven Cloud - Système Lean Wallet');
        
        // Initialisation de la table transactions
        const sqlTable = `
            CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                expediteur_id VARCHAR(50),
                destinataire_id VARCHAR(50),
                montant DECIMAL(10, 2),
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`;
        db.query(sqlTable, (err) => {
            if (err) console.log("Erreur création table:", err);
            else console.log("✅ Table transactions prête");
        });
    }
});

// --- ROUTES NAVIGATION ---
app.get('/test', (req, res) => res.sendFile(path.join(__dirname, 'test_local.html')));

// --- ROUTE 1 : CONNEXION ---
app.post('/api/login-test', (req, res) => {
    const { id_client } = req.body;
    if (!id_client) return res.json({ success: false, message: "ID requis" });

    // Nettoyage de l'ID (on enlève le préfixe si présent)
    const cleanId = id_client.toString().replace("08000", "");

    db.query('SELECT * FROM utilisateurs WHERE id = ?', [cleanId], (err, results) => {
        if (err) return res.json({ success: false, message: 'Erreur SQL' });
        
        if (results.length > 0) {
            req.session.user = results[0];
            res.json({ success: true, user: results[0] });
        } else {
            res.json({ success: false, message: `ID ${cleanId} non trouvé` });
        }
    });
});

// --- ROUTE 2 : TRANSFERT AVEC TRANSACTION SQL ---
app.post('/api/transfert-test', (req, res) => {
    const { id_expediteur, id_destinataire, montant } = req.body;
    const somme = parseFloat(montant);

    const cleanSenderId = id_expediteur.toString().replace("08000", "");
    const cleanReceiverId = id_destinataire.toString().replace("08000", "");

    if (!cleanSenderId || !cleanReceiverId || isNaN(somme) || somme <= 0) {
        return res.json({ success: false, message: "Données invalides" });
    }

    // Vérification du solde
    db.query('SELECT solde FROM utilisateurs WHERE id = ?', [cleanSenderId], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: 'Expéditeur introuvable' });

        const soldeExp = results[0].solde;
        if (soldeExp < somme) return res.json({ success: false, message: 'Solde insuffisant' });

        // Débit expéditeur
        db.query('UPDATE utilisateurs SET solde = solde - ? WHERE id = ?', [somme, cleanSenderId], (err) => {
            if (err) return res.json({ success: false, message: 'Erreur débit' });

            // Crédit destinataire
            db.query('UPDATE utilisateurs SET solde = solde + ? WHERE id = ?', [somme, cleanReceiverId], (err, resultDest) => {
                if (err || resultDest.affectedRows === 0) {
                    // Remboursement si le destinataire n'existe pas
                    db.query('UPDATE utilisateurs SET solde = solde + ? WHERE id = ?', [somme, cleanSenderId]);
                    return res.json({ success: false, message: 'Destinataire inexistant' });
                }

                // Enregistrement dans l'historique
                const sqlLog = "INSERT INTO transactions (expediteur_id, destinataire_id, montant) VALUES (?, ?, ?)";
                db.query(sqlLog, [cleanSenderId, cleanReceiverId, somme], (errHist) => {
                    if (errHist) console.log("Erreur log transaction:", errHist);
                });

                res.json({ 
                    success: true, 
                    message: `Transfert de ${somme} XOF réussi vers l'ID ${cleanReceiverId} !` 
                });
            });
        });
    });
});

// --- ROUTE 3 : HISTORIQUE ---
app.get('/api/historique/:id', (req, res) => {
    const userId = req.params.id.toString().replace("08000", "");

    const sql = `
        SELECT * FROM transactions 
        WHERE expediteur_id = ? OR destinataire_id = ? 
        ORDER BY date DESC LIMIT 20`;

    db.query(sql, [userId, userId], (err, results) => {
        if (err) return res.json({ success: false, message: 'Erreur historique' });
        res.json({ success: true, transactions: results });
    });
});

// Lancement
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ Serveur Lean Wallet actif sur http://localhost:${PORT}`);
});

