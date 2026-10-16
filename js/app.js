// -----------------------------------------------------
// Configuration
// -----------------------------------------------------

const PKO_NOM_COLONNE_PJ = "A_FichierSource";
const PKO_NOM_COLONNE_ID = "id";

const TABLE_AGENTS = "Agents";
const TABLE_PKO = "PKO";
const TABLE_PKO_PAGES = "PKO_Pages";
const TABLE_INDUS = "Indus";

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
        allowSelectBy: true
    });

    grist.onRecord(record => {

        console.log("Record reçu :", record);

        if (!record) {
            statusDiv.innerText = "Aucune ligne sélectionnée";
            return;
        }

        currentRecordId = record.id;

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
}

// -----------------------------------------------------
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

        const pagesJson =
            await pyodide.runPythonAsync(`
        construire_pages_pko(
            pko_id,
            pdf_pages
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
        console.log(
            await grist.docApi.listTables()
        );

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

        const resultat_actions = await grist.docApi.applyUserActions(
            actions_lignes_indus
        );

        statusDiv.innerText =
            "lignes indus créés";

        grist.setCursorPos({rowId: 2});

        const record = await grist.docApi.fetchSelectedRecord();

        console.log(record);


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
