<?php
$host = 'localhost';
$db   = 'defaultdb';
$user = 'votre_utilisateur'; // À remplacer
$pass = 'votre_mot_de_passe'; // À remplacer

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db", $user, $pass);
    
    // Récupération des données du formulaire
    $idSource = $_POST['id_source'];
    $idDest   = $_POST['id_dest'];
    $montant  = $_POST['montant'];

    if ($montant <= 0) {
        die("Le montant doit être positif.");
    }

    // Début de la transaction
    $pdo->beginTransaction();

    // 1. Vérifier si l'envoyeur a assez d'argent
    $stmt = $pdo->prepare("SELECT solde FROM utilisateurs WHERE id = ? FOR UPDATE");
    $stmt->execute([$idSource]);
    $user = $stmt->fetch();

    if (!$user || $user['solde'] < $montant) {
        throw new Exception("Fonds insuffisants ou compte inexistant.");
    }

    // 2. Débiter l'envoyeur
    $stmt = $pdo->prepare("UPDATE utilisateurs SET solde = solde - ? WHERE id = ?");
    $stmt->execute([$montant, $idSource]);

    // 3. Créditer le destinataire
    $stmt = $pdo->prepare("UPDATE utilisateurs SET solde = solde + ? WHERE id = ?");
    $stmt->execute([$montant, $idDest]);

    // Valider les changements
    $pdo->commit();
    echo "Transfert réussi !";

} catch (Exception $e) {
    // En cas d'erreur, on annule tout pour éviter les doublons ou pertes
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo "Erreur : " . $e->getMessage();
}
?>
