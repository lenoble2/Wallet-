require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- CONFIGURATION DB (Adaptée de server.js) ---
const dbConfig = {
  host: 'mysql-2640bf90-leantoken123-cb13.l.aivencloud.com', //
  user: 'avnadmin', //
  password: 'AVNS_tYZKEn9utteLIFKyPSj', // Votre vrai mot de passe
  database: 'defaultdb', //
  port: 26246, //
  ssl: {
    rejectUnauthorized: false // Requis pour Aiven
  },
  connectTimeout: 20000 
};

const db = mysql.createConnection(dbConfig);

db.connect(err => {
  if (err) {
    console.error('❌ Erreur Aiven sur server2:', err.message);
  } else {
    console.log('✅ Connecté à Aiven via server2.js');
  }
});

// --- CONFIGURATION CINETPAY ---
const CINETPAY_CONFIG = {
    apikey: process.env.CINETPAY_APIKEY || "TON_API_KEY",    
    site_id: process.env.CINETPAY_SITE_ID || "TON_SITE_ID", 
    currency: "XOF"
};

// --- LOGIQUE CINETPAY & ROUTES ---
const appelerAPIHub = async (data) => {
    try {
        const payload = {
            apikey: CINETPAY_CONFIG.apikey,
            site_id: CINETPAY_CONFIG.site_id,
            transaction_id: "LP-" + Date.now(), 
            amount: data.montant,
            currency: CINETPAY_CONFIG.currency,
            description: `Échange ${data.source} vers ${data.destination}`,
            notify_url: "https://ton-domaine.com/api/notification", 
            return_url: "https://ton-domaine.com/succes.html",
            channels: "ALL", 
            customer_name: "Client LeanPay",
            customer_surname: data.phone
        };

        const response = await axios.post("https://api-checkout.cinetpay.com/v2/payment", payload);

        if (response.data.code === '201') {
            return { success: true, payment_url: response.data.data.payment_url };
        } else {
            return { success: false, message: response.data.message };
        }
    } catch (error) {
        console.error("Erreur API CinetPay:", error.message);
        return { success: false, message: "Erreur de connexion à CinetPay" };
    }
};

app.post('/api/echange', async (req, res) => {
    const result = await appelerAPIHub(req.body);
    if (result.success) {
        res.json({ success: true, payment_url: result.payment_url });
    } else {
        res.status(400).json({ error: result.message });
    }
});

app.get('/api/historique', (req, res) => {
  const phone = req.query.phone;
  const sql = `SELECT destinataire_id, montant, date FROM transactions WHERE expediteur_id = ? ORDER BY date DESC LIMIT 5`;
  db.query(sql, [phone], (err, results) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true, transactions: results });
  });
});

// --- LANCEMENT ---
const PORT = 10001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur server2.js actif sur le port ${PORT}`);
});
