// -----------------------------------------------------
// Configuration
// -----------------------------------------------------

let TABLE_UTILISATEURS = "Referentiel_utilisateurs";
let COLONNE_UTILISATEURS_EMAIL = "utilisateur_courriel";
let COLONNE_UTILISATEURS_NOMCOMPLET = "utilisateur_nomPrenom";
let TABLE_SESSION_UTILISATEUR = "Session_utilisateur";
let COLONNE_SESSION_UTILISATEUR_CONTEXTE = "???";

// -----------------------------------------------------
// Variables
// -----------------------------------------------------

const statusDiv = document.getElementById("status");

let currentRecordId = null;
let lastRecordId = null;
let userEmail = null;
let dernierCurseurPko = null;
let dernierContextePko = null;


// -----------------------------------------------------
// Widget
// -----------------------------------------------------

async function initialiserWidget() {

    console.log("Initialisation widget");

    if (typeof grist === "undefined") {
        statusDiv.innerText = "API Grist introuvable";
        return;
    }

    console.log("grist OK");

    console.log("selectedTable =", grist.selectedTable);

    grist.ready({
        requiredAccess: "full",
        allowSelectBy: true,
        onEditOptions: function() {
            document.getElementById('main-view').style.display = 'none';
            document.getElementById('config-panel').style.display = 'block';
        }
    });

    grist.onOptions(function(options) {
        console.log("chargement des options")
        if (options) {
        // Grist renvoie toutes les options enregistrées. Si elles existent, on les applique
            if (options.cfgNomTableUtilisateur) {
                TABLE_UTILISATEURS = options.cfgNomTableUtilisateur;
            }
            if (options.cfgColonneEmail) {
                COLONNE_UTILISATEURS_EMAIL = options.cfgColonneEmail;
            }
            if (options.cfgColonneNomcompletUtilisateur) {
                COLONNE_UTILISATEURS_NOMCOMPLET = options.cfgColonneNomcompletUtilisateur;
            }
            if (options.cfgColonneSession) {
                TABLE_SESSION_UTILISATEUR = options.cfgColonneSession;
            }
            if (options.cfgColonneContexte) {
                COLONNE_SESSION_UTILISATEUR_CONTEXTE = options.cfgColonneContexte;
            }
            
                // Remplir le champ de saisie avec la valeur stockée pour que l'utilisateur la voie
                document.getElementById('table-utilisateur').value = TABLE_UTILISATEURS;
                document.getElementById('colonne-email').value = COLONNE_UTILISATEURS_EMAIL;
                document.getElementById('colonne-nom-complet').value = COLONNE_UTILISATEURS_NOMCOMPLET;
                document.getElementById('table-session').value = TABLE_SESSION_UTILISATEUR;
                document.getElementById('colonne-contexte').value = COLONNE_SESSION_UTILISATEUR_CONTEXTE;
            }
        
    });

    // appel de la fonction pour récupérer l'email de l'utilisateur
    console.log("identification de l'utilisateur...");
    userEmail = await getUtilisateurEmail();
    
    console.log("recherche email utilisateur...")
    setTimeout( async () => {

        console.log("recherche de :", userEmail, " dans la table des utilisateurs...");

        // recherche de l'utilisateur dans la table des utilisateurs
        const contexte = await lireTable(TABLE_UTILISATEURS)

        console.log("Contexte utilisateur :", contexte);

        const utilisateur_trouve = contexte.find(row => row[COLONNE_UTILISATEURS_EMAIL] === userEmail);
        
        await chargerContexte(userEmail);
        console.log(utilisateur_trouve[COLONNE_UTILISATEURS_NOMCOMPLET])

    }, 500);

    console.log(userEmail);


    document.getElementById('display-var').innerText = maVariable;

    document.getElementById('save-btn').addEventListener('click', async function() {
        const new_TABLE_UTILISATEURS = document.getElementById('table-utilisateur').value;
        const new_COLONNE_UTILISATEURS_EMAIL = document.getElementById('colonne-email').value;
        const new_COLONNE_UTILISATEURS_NOMCOMPLET = document.getElementById('colonne-nom-complet').value;
        const new_TABLE_SESSION_UTILISATEUR = document.getElementById('table-session').value;
        const new_COLONNE_SESSION_UTILISATEUR_CONTEXTE = document.getElementById('colonne-contexte').value;
        
        // Sauvegarde persistante directement dans Grist
        await grist.setOption('cfgNomTableUtilisateur', new_TABLE_UTILISATEURS);
        await grist.setOption('cfgColonneEmail', new_COLONNE_UTILISATEURS_EMAIL);
        await grist.setOption('cfgColonneNomcompletUtilisateur', new_COLONNE_UTILISATEURS_NOMCOMPLET);
        await grist.setOption('cfgColonneSession', new_TABLE_SESSION_UTILISATEUR);
        await grist.setOption('cfgColonneContexte', new_COLONNE_SESSION_UTILISATEUR_CONTEXTE);

        
        // Ré-afficher la vue principale et masquer la configuration
        document.getElementById('config-panel').style.display = 'none';
        document.getElementById('main-view').style.display = 'block';
    });


    // action à effectuer lorsque l'utilisateur sélectionne un enregistrement dans la table PKO

    grist.onRecord(async (record) => {

        console.log("Record reçu :", record);

        currentRecordId = record.id;

        
        // recherche de l'utilisateur dans la table des utilisateurs

        const contexte = await lireTable(TABLE_UTILISATEURS)

        console.log("Contexte utilisateur :", contexte);

        console.log("user email :", userEmail);
        const utilisateur_trouve = contexte.find(row => row[COLONNE_UTILISATEURS_EMAIL] === userEmail);

        // mise à jour du contexte PKO dans la table des utilisateurs
        console.log("Contexte PKO à mettre à jour :", record.id);
        console.log(utilisateur_trouve);
        console.log(utilisateur_trouve[COLONNE_UTILISATEURS_NOMCOMPLET]);
        console.log(utilisateur_trouve[COLONNE_UTILISATEURS_EMAIL]);
        console.log(utilisateur_trouve[COLONNE_SESSION_UTILISATEUR_CONTEXTE]);
        
        if (utilisateur_trouve[COLONNE_SESSION_UTILISATEUR_CONTEXTE] !== record.id) {
            console.log("ecriture contexte pko");
            await grist.docApi.applyUserActions([
                [
                    "UpdateRecord",
                    TABLE_UTILISATEURS,
                    utilisateur_trouve.id,
                    {
                        [COLONNE_SESSION_UTILISATEUR_CONTEXTE]: record.id
                    }
                ]
            ]);
            dernierCurseurPko = record.id;
        }

    });
}

grist.onRecords(async () => {

    const contextePko = await user_actuel_contexte(userEmail);

    if (
        contextePko &&
        contextePko !== dernierCurseurPko &&
        contextePko !== dernierContextePko
    ) {

        dernierContextePko = contextePko;

        await grist.setCursorPos({
            rowId: contextePko
        });
    }

});


// -----------------------------------------------------
// identification utilisateur
// -----------------------------------------------------

async function getUtilisateurEmail() {
  try {
    // 1. Demander à Grist de créer une ligne vide dans notre table tampon
    const nouvelleLigne = await grist.getTable(TABLE_SESSION_UTILISATEUR).create({ fields: {} });

    // 2. Récupérer l'ID de la ligne créée
    const rowId = nouvelleLigne.id;

    // 3. Lire la ligne pour récupérer la valeur injectée par la formule Grist
    const records = await lireTable(TABLE_SESSION_UTILISATEUR)

    const session = records.find(r => r.id === rowId);

    const emailUtilisateur = session.email;
    
    // 4. Nettoyer la table en supprimant la ligne temporaire
    await grist.getTable(TABLE_SESSION_UTILISATEUR).destroy(rowId);
    
    // Vous avez maintenant le nom de l'utilisateur !
    console.log("Utilisateur trouvé :", emailUtilisateur);
    return emailUtilisateur;

  } catch (error) {
    console.error("Impossible de récupérer le nom d'utilisateur", error);
    return null;
  }
}


// -----------------------------------------------------
// conversion table grist colonne -> lignes
// -----------------------------------------------------

function tableToRecords(tableData) {

    const rows = [];

    const rowCount =
        tableData.id.length;

    const columns =
        Object.keys(tableData);

    for (let i = 0; i < rowCount; i++) {

        const row = {};

        for (const column of columns) {
            row[column] =
                tableData[column][i];
        }

        rows.push(row);
    }

    return rows;
}

// -----------------------------------------------------
// helper lecture des tables
// -----------------------------------------------------

async function lireTable(tableName) {

    const tableData =
        await grist.docApi.fetchTable(
            tableName
        );

    const lignes = [];

    const colonnes =
        Object.keys(tableData);

    const nbLignes =
        tableData.id.length;

    for (let i = 0; i < nbLignes; i++) {

        const ligne = {};

        for (const colonne of colonnes) {

            ligne[colonne] =
                tableData[colonne][i];
        }

        lignes.push(ligne);
    }

    return lignes;
}

// -----------------------------------------------------
// Synchroniser le curseur sur la ligne en cours
// -----------------------------------------------------

async function chargerContexte(userEmail) {
    const current_user = user_actuel_contexte(userEmail);

    if (!current_user) return;

    if (!current_user[COLONNE_SESSION_UTILISATEUR_CONTEXTE]) return;

    await grist.setCursorPos({rowId: current_user[COLONNE_SESSION_UTILISATEUR_CONTEXTE]});
}

async function user_actuel_contexte(userEmail) {
    
    const contexte = await lireTable(TABLE_UTILISATEURS)

    const current_user = contexte.find(row => row[COLONNE_UTILISATEURS_EMAIL] === userEmail);

    return current_user
}


// -----------------------------------------------------
// Démarrage
// -----------------------------------------------------

initialiserWidget();
