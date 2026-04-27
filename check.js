const mysql = require('mysql2');
const db = mysql.createConnection("lean3.orender.com/api");

db.connect((err) => {
    if (err) throw err;
    // Cette commande liste toutes les tables de votre base
    db.query("SHOW TABLES", (err, results) => {
        if (err) throw err;
        console.log("Tables présentes dans la base :", results);
        process.exit();
    });
});
