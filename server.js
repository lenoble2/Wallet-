require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

const app = express();

// --- MIDDLEWARES ---
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Priorité au dossier public pour éviter les conflits d'extensions
app.use(express.static('public'));
app.use(express.static(__dirname));

app.use(session({
  secret: process.env.SESSION_SECRET || 'ton_secret_lean',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// --- ROUTE DÉDIÉE AU TÉLÉCHARGEMENT DE L'APK ---
app.get('/leanpay.apk', (req, res) => {
    const file = path.join(__dirname, 'public', 'leanpay.apk');
    res.download(file, 'LeanPay.apk', (err) => {
        if (err) {
            console.error("Erreur de téléchargement APK:", err);
            res.status(404).send("Le fichier APK est introuvable sur le serveur.");
        }
    });
});

// --- CONFIGURATION DB (AIVEN) ---
const dbConfig = {
  host: process.env.DB_HOST || 'mysql-2640bf90-leantoken123-cb13.l.aivencloud.com',
  user: process.env.DB_USER || 'avnadmin',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'defaultdb',
  port: process.env.DB_PORT || 26246,
  ssl: { rejectUnauthorized: false },
  connectTimeout: 30000

  };


let db;

function handleDisconnect() {
  db = mysql.createConnection(dbConfig);
  
  db.connect((err) => {
    if (err) {
      console.error("❌ ERREUR CONNEXION (Vérifiez Internet/DNS) :", err.message);
      // Au lieu de throw, on réessaie après 5 secondes pour laisser le temps au réseau de revenir
      setTimeout(handleDisconnect, 5000); 
    } else {
      console.log("✅ Connecté à MySQL (Aiven)");
      initialiserBase();
    }
  });
  
  db.on('error', (err) => {
    console.log('⚠️ Erreur DB:', err.code);
    // Gestion des déconnexions et erreurs réseau (ENOTFOUND, ECONNRESET, etc.)
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      handleDisconnect();
    } else {
      // Pour les autres erreurs, on tente de reconnecter au lieu de crasher
      setTimeout(handleDisconnect, 5000);
    }
  });
}

function initialiserBase() {
  const userTable = `CREATE TABLE IF NOT EXISTS utilisateurs (
        id VARCHAR(50) PRIMARY KEY, 
        nom VARCHAR(100), 
        email VARCHAR(100) UNIQUE, 
        pin VARCHAR(10), 
        solde DECIMAL(10, 2) DEFAULT 0,
        type_piece VARCHAR(50),
        numero_piece VARCHAR(100),
        photo_piece_recto LONGTEXT,
        photo_selfie LONGTEXT,
        statut_kyc ENUM('non_initie', 'en_attente', 'valide', 'rejete') DEFAULT 'non_initie'
    )`;
  
  const transTable = `CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        expediteur_id VARCHAR(50),
        destinataire_id VARCHAR(50),
        montant DECIMAL(10, 2),
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
  
  db.query(userTable, (err) => { if (!err) console.log('📊 Table utilisateurs prête'); });
  db.query(transTable, (err) => { if (!err) console.log('📊 Table transactions prête'); });
}

handleDisconnect();

// --- ROUTES API UTILISATEURS ---

app.post('/api/inscription', (req, res) => {
  const { nom, email, pin, telephone } = req.body;
  if (!telephone) return res.status(400).json({ success: false, message: "Le numéro de téléphone est requis" });
  
  const query = 'INSERT INTO utilisateurs (id, nom, email, pin, solde) VALUES (?, ?, ?, ?, 0)';
  db.query(query, [telephone, nom, email, pin], (err) => {
    if (err) return res.status(500).json({ success: false, message: "Numéro ou email déjà utilisé" });
    res.json({ success: true, userId: telephone });
  });
});

app.post('/api/connexion', (req, res) => {
  const { email, pin } = req.body;
  db.query('SELECT * FROM utilisateurs WHERE email = ? AND pin = ?', [email, pin], (err, results) => {
    if (err || results.length === 0) return res.json({ success: false, message: "Identifiants incorrects" });
    req.session.userId = results[0].id;
    res.json({ success: true, user: results[0] });
  });
});

app.get('/api/utilisateur/:id', (req, res) => {
  db.query('SELECT nom, solde, statut_kyc FROM utilisateurs WHERE id = ?', [req.params.id], (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ success: false });
    res.json({ success: true, user: results[0] });
  });
});

app.post('/api/transfert-test', (req, res) => {
  const { id_expediteur, id_destinataire, montant } = req.body;
  const somme = parseFloat(montant);
  
  db.query('SELECT solde FROM utilisateurs WHERE id = ?', [id_expediteur], (err, results) => {
    if (err || results.length === 0 || results[0].solde < somme) {
      return res.json({ success: false, message: 'Solde insuffisant' });
    }
    
    db.query('UPDATE utilisateurs SET solde = solde - ? WHERE id = ?', [somme, id_expediteur], (err) => {
      if (err) return res.json({ success: false });
      db.query('UPDATE utilisateurs SET solde = solde + ? WHERE id = ?', [somme, id_destinataire], (err, resDest) => {
        if (err || resDest.affectedRows === 0) {
          db.query('UPDATE utilisateurs SET solde = solde + ? WHERE id = ?', [somme, id_expediteur]);
          return res.json({ success: false, message: 'Destinataire introuvable' });
        }
        db.query('INSERT INTO transactions (expediteur_id, destinataire_id, montant) VALUES (?, ?, ?)', [id_expediteur, id_destinataire, somme]);
        res.json({ success: true, message: 'Transfert réussi !' });
      });
    });
  });
});

app.get('/api/transactions', (req, res) => {
  const userId = req.query.userId || req.session.userId;
  if (!userId) return res.status(401).json({ success: false });
  const sql = 'SELECT * FROM transactions WHERE expediteur_id = ? OR destinataire_id = ? ORDER BY date DESC';
  db.query(sql, [userId, userId], (err, results) => {
    if (err) return res.status(500).json({ success: false });
    res.json(results);
  });
});

app.post('/api/soumettre-kyc', (req, res) => {
  const { userId, type_piece, num_piece, photoRecto, photoSelfie } = req.body;
  const query = "UPDATE utilisateurs SET type_piece = ?, numero_piece = ?, photo_piece_recto = ?, photo_selfie = ?, statut_kyc = 'en_attente' WHERE id = ?";
  db.query(query, [type_piece, num_piece, photoRecto, photoSelfie, userId], (err) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, message: "Dossier reçu !" });
  });
});



app.post('/api/update-pin', (req, res) => {
    const { userId, oldPin, newPin } = req.body;

    // 1. Vérifier si l'ancien PIN est correct
    const checkSql = "SELECT pin FROM utilisateurs WHERE id = ?";
    db.query(checkSql, [userId], (err, results) => {
        if (err) return res.status(500).json({ message: "Erreur base de données" });
        if (results.length === 0 || results[0].pin !== oldPin) {
            return res.status(400).json({ message: "L'ancien code PIN est incorrect." });
        }

        // 2. Mettre à jour avec le nouveau PIN
        const updateSql = "UPDATE utilisateurs SET pin = ? WHERE id = ?";
        db.query(updateSql, [newPin, userId], (err) => {
            if (err) return res.status(500).json({ message: "Échec de la mise à jour" });
            res.json({ success: true, message: "PIN mis à jour avec succès" });
        });
    });
});





// ==========================================
//           ROUTES ADMINISTRATION
// ==========================================

app.get('/admin-panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin_lean.html'));
});

app.get('/api/admin/all-users', (req, res) => {
  const sql = "SELECT id, nom, email, pin, solde, statut_kyc, photo_piece_recto, photo_selfie FROM utilisateurs ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Erreur base de données" });
    res.json({ success: true, users: results });
  });
});

app.post('/api/admin/update-kyc-status', (req, res) => {
  const { userId, status } = req.body;
  const query = "UPDATE utilisateurs SET statut_kyc = ? WHERE id = ?";
  db.query(query, [status, userId], (err) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, message: `Statut mis à jour` });
  });
});

app.post('/api/admin/reset-pin', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: "ID utilisateur manquant" });

    const sql = "UPDATE utilisateurs SET pin = '0000' WHERE id = ?";
    db.query(sql, [userId], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "Erreur base de données" });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
        res.json({ success: true, message: "Le PIN a été réinitialisé avec succès !" });
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur Lean Pay démarré sur le port ${PORT}`);
});
