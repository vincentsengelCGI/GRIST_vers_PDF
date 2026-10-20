// -----------------------------------------------------
// Configuration
// -----------------------------------------------------

const PKO_NOM_COLONNE_PJ = "A_FichierSource";
const PKO_NOM_COLONNE_ID = "id";

const TABLE_AGENTS = "Agents";
const TABLE_PKO = "PKO";
const TABLE_PKO_PAGES = "PKO_Pages";
const TABLE_INDUS = "Indus";

let TABLE_UTILISATEURS = "Referentiel_utilisateurs";
let COLONNE_UTILISATEURS_EMAIL = "utilisateur_courriel";
let COLONNE_UTILISATEURS_NOMCOMPLET = "utilisateur_nomPrenom";
let TABLE_SESSION_UTILISATEUR = "Session_utilisateur";
let COLONNE_UTILISATEURS_ACADEMIE = "Academie";

let pyodide = null;

pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// -----------------------------------------------------
// Variables
// -----------------------------------------------------

const btn = document.getElementById("btn-extract");
const statusDiv = document.getElementById("status");
const fileInfoDiv = document.getElementById("file-info");

let currentRecordId = null;
let currentAttachmentId = null;
let id_PKO = null;
let id_utilisateur = null;
let aca_utilisateur = null;

// -----------------------------------------------------
// Widget
// -----------------------------------------------------

async function initialiserWidget() {

    console.log("Initialisation widget");
	statusDiv.innerText = "Initialisation Python...";
    await initPyodide();
    await chargerParser()
    
	statusDiv.innerText = "Connexion à Grist...";

    if (typeof grist === "undefined") {
        statusDiv.innerText = "API Grist introuvable";
        return;
    }

    console.log("grist OK");
    console.log("pdfjsLib OK :", pdfjsLib.version);
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
            if (options.cfgColonneAcademieUtilisateur) {
                COLONNE_UTILISATEURS_ACADEMIE = options.cfgColonneAcademieUtilisateur;
            }
            if (options.cfgColonneSession) {
                TABLE_SESSION_UTILISATEUR = options.cfgColonneSession;
            }
            
            // Remplir le champ de saisie avec la valeur stockée pour que l'utilisateur la voie
            document.getElementById('table-utilisateur').value = TABLE_UTILISATEURS;
            document.getElementById('colonne-email').value = COLONNE_UTILISATEURS_EMAIL;
            document.getElementById('colonne-nom-complet').value = COLONNE_UTILISATEURS_NOMCOMPLET;
            document.getElementById('colonne-academie').value = COLONNE_UTILISATEURS_ACADEMIE;
            document.getElementById('table-session').value = TABLE_SESSION_UTILISATEUR;
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

        const utilisateur_trouve = contexte.find(row => row[COLONNE_UTILISATEURS_EMAIL] === userEmail);
        
        console.log(utilisateur_trouve[COLONNE_UTILISATEURS_NOMCOMPLET])

        id_utilisateur = utilisateur_trouve.id
        aca_utilisateur = utilisateur_trouve[COLONNE_UTILISATEURS_ACADEMIE]
        console.log("id utilisateur trouvé : ")
        console.log(utilisateur_trouve[COLONNE_UTILISATEURS_ACADEMIE])

    }, 500);


    document.getElementById('save-btn').addEventListener('click', async function() {
        const new_TABLE_UTILISATEURS = document.getElementById('table-utilisateur').value;
        const new_COLONNE_UTILISATEURS_EMAIL = document.getElementById('colonne-email').value;
        const new_COLONNE_UTILISATEURS_NOMCOMPLET = document.getElementById('colonne-nom-complet').value;
        const new_COLONNE_UTILISATEURS_ACADEMIE = document.getElementById('colonne-academie').value;
        const new_TABLE_SESSION_UTILISATEUR = document.getElementById('table-session').value;
        
        // Sauvegarde persistante directement dans Grist
        await grist.setOption('cfgNomTableUtilisateur', new_TABLE_UTILISATEURS);
        await grist.setOption('cfgColonneEmail', new_COLONNE_UTILISATEURS_EMAIL);
        await grist.setOption('cfgColonneNomcompletUtilisateur', new_COLONNE_UTILISATEURS_NOMCOMPLET);
        await grist.setOption('cfgColonneAcademieUtilisateur', new_COLONNE_UTILISATEURS_ACADEMIE);
        await grist.setOption('cfgColonneSession', new_TABLE_SESSION_UTILISATEUR);

        
        // Ré-afficher la vue principale et masquer la configuration
        document.getElementById('config-panel').style.display = 'none';
        document.getElementById('main-view').style.display = 'block';
    });


    // action à effectuer lorsque l'utilisateur sélectionne un enregistrement dans la table PKO
    grist.onRecord(async (record) => {

        console.log("Record reçu :", record);

        if (!record) {
            statusDiv.innerText = "Aucune ligne sélectionnée";
            return;
        }

        currentRecordId = record.id;

        // lecture des pièces jointes et de l'id du PKO
        const attachment = record[PKO_NOM_COLONNE_PJ];
        id_PKO = record[PKO_NOM_COLONNE_ID];

        console.log("Champ PJ :", attachment);

        currentAttachmentId = null;

        if (typeof attachment === "number") {
            currentAttachmentId = attachment;
        }

        if (Array.isArray(attachment)) {

            for (const item of attachment) {

                if (typeof item === "number") {
                    currentAttachmentId = item;
                    break;
                }

                if (item && item.id) {
                    currentAttachmentId = item.id;
                    break;
                }
            }
        }

        if (currentAttachmentId) {

            fileInfoDiv.innerText =
                `PDF détecté : ${currentAttachmentId}`;

            statusDiv.innerText =
                "Prêt pour l'extraction";

            btn.disabled = false;

        } else {

            fileInfoDiv.innerText =
                "Aucune pièce jointe trouvée";

            statusDiv.innerText =
                "Sélectionner un enregistrement contenant un PDF";

            btn.disabled = true;
        }

    });

    return "chat"
}

// ---------------------------------------------    --------
// parser python
// -----------------------------------------------------


async function chargerParser() {

    const response = await fetch(
        "python/parser.py"
    );

    const codePython =
        await response.text();

    await pyodide.runPythonAsync(
        codePython
    );

    console.log(
        "Parser Python chargé"
    );

}

// -----------------------------------------------------
// Pyodide
// -----------------------------------------------------

async function initPyodide() {
    console.log("Chargement de Pyodide...");
    pyodide = await loadPyodide();
    console.log("Pyodide prêt");
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
// Extraction
// -----------------------------------------------------

async function executerExtraction() {

    console.log("=== EXTRACTION DEMARREE ===");
	
    try {

        console.log("Attachment ID :", currentAttachmentId);

        const tokenInfo =
            await grist.docApi.getAccessToken({});

        console.log("Token obtenu :", tokenInfo);

        const pdfUrl =
            `${tokenInfo.baseUrl}/attachments/${currentAttachmentId}/download?auth=${encodeURIComponent(tokenInfo.token)}`;

        console.log("URL PDF :", pdfUrl);

        const response = await fetch(pdfUrl);

        console.log("Réponse fetch :", response.status);

        const pdfData = await response.arrayBuffer();

        console.log("Taille PDF :", pdfData.byteLength);

        const loadingTask =
            pdfjsLib.getDocument({
                data: pdfData
            });

        const pdf =
            await loadingTask.promise;

        const agents = [];

        // -----------------------------------------------------
        // Découpage du pdf en pages agent
        // -----------------------------------------------------

        for (let i = 1; i <= pdf.numPages; i++) {

            const page = await pdf.getPage(i);

            const textContent =
                await page.getTextContent();

            const textePage =
                textContent.items
                    .map(item => item.str)
                    .join(" ");

            agents.push(
                textePage.trim()
            );

        }

        pyodide.globals.set(
            "pko_id",
            id_PKO
        );

        pyodide.globals.set(
            "pdf_pages",
            agents
        );

        pyodide.globals.set(
            "utilisateur_aca",
            aca_utilisateur
        );

        const pagesJson =
            await pyodide.runPythonAsync(`
        construire_pages_pko(
            pko_id,
            pdf_pages,
            utilisateur_aca
        )
        `);

        const pagesPko =
            JSON.parse(pagesJson);

        // -----------------------------------------------------
        // Ecriture des pages agent dans la page agent
        // -----------------------------------------------------

        const actions = [];

        for (const page of pagesPko) {
            console.log(page);
            actions.push([
                "AddRecord",
                TABLE_PKO_PAGES,
                null,
                page
            ]);

        }
        console.log("action pages pko >>>>>>>");
        console.log(actions);

        await grist.docApi.applyUserActions(
            actions
        );

        statusDiv.innerText =
            "Extraction PKO terminée";

        // -----------------------------------------------------
        // récupération des données des pages pko extraites
        // -----------------------------------------------------

        const pages =
            await lireTable(TABLE_PKO_PAGES);

        const pagesDuPko =
            pages.filter(
                p => p.PKO_id === currentRecordId
            );
        
        const valeurLigneFin = currentRecordId;

        statusDiv.innerText =
            "lecture des données agents...";

        // -----------------------------------------------------
        // construction liste des agents
        // -----------------------------------------------------

        pyodide.globals.set(
            "pages_Du_Pko",
            pagesDuPko
        );

        const agents_JSON =
           await pyodide.runPythonAsync(`
            construire_agents(
                pages_Du_Pko.to_py()
            )
       `);

        const agents_a_creer =
            JSON.parse(agents_JSON);

        // -----------------------------------------------------
        // Ecriture des pages agent dans la page agent
        // -----------------------------------------------------

        const table_existante =
            await lireTable(TABLE_AGENTS);

        console.log("table existante >>>>>>>");
        console.log(table_existante);

        statusDiv.innerText =
            "création des lignes agents...";

        const actions_lignes_agents = [];

        for (const ligne_agent of agents_a_creer) {
            console.log(ligne_agent);
            actions_lignes_agents.push([
                "AddRecord",
                TABLE_AGENTS,
                null,
                ligne_agent
            ]);

        }

        console.log(actions_lignes_agents);

        await grist.docApi.applyUserActions(
            actions_lignes_agents
        );

        statusDiv.innerText =
            "lignes agents créés";

        // -----------------------------------------------------
        // Lecture des indus brut depuis la table agents
        // -----------------------------------------------------
            
        const table_agents =
            await lireTable(TABLE_AGENTS);

        console.log("table agents:");
        console.log(table_agents);

        const indus_agents =
        table_agents.filter(
            p => p.PKO_ID === currentRecordId
        );

        console.log("indus_agents:");
        console.log(indus_agents);
        
        statusDiv.innerText =
        "lecture des données indus...";

        // -----------------------------------------------------
        // construction liste des indus
        // -----------------------------------------------------

        console.log("construire indus python >>>>>>>");
        
        pyodide.globals.set(
            "indus_agents",
            indus_agents
        );

        const indus_JSON =
           await pyodide.runPythonAsync(`
            construire_indus(
                indus_agents.to_py()
            )
       `);

        const indus_a_creer =
            JSON.parse(indus_JSON);
        console.log("indus_a_creer:");
        console.log(indus_a_creer);

        // -----------------------------------------------------
        // Ecriture des pages indus dans la page indus
        // -----------------------------------------------------

        statusDiv.innerText =
            "création des lignes indus...";

        const actions_lignes_indus = [];

        for (const ligne_indus of indus_a_creer) {
            console.log(ligne_indus);
            actions_lignes_indus.push([
                "AddRecord",
                TABLE_INDUS,
                null,
                ligne_indus
            ]);

        }
        console.log("actions_lignes_indus >>");
        console.log(actions_lignes_indus);

        await grist.docApi.applyUserActions(
            actions_lignes_indus
        );

        statusDiv.innerText =
            "lignes indus créés";


        console.log("valeurLigneFin:", valeurLigneFin);

        await grist.setCursorPos({rowId: valeurLigneFin});

        console.log("curseur bougé")

    }
    
        // -----------------------------------------------------
        // Gestion des erreurs
        // -----------------------------------------------------

    catch (err) {

        console.error(err);

        statusDiv.innerText =
            "Erreur : " + err.message;
    }
    finally {

        btn.disabled = false;
    }
}

// -----------------------------------------------------
// Bouton
// -----------------------------------------------------

btn.onclick = executerExtraction;

// -----------------------------------------------------
// Démarrage
// -----------------------------------------------------

initialiserWidget();
