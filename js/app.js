// -----------------------------------------------------
// Configuration
// -----------------------------------------------------

const PKO_NOM_COLONNE_PJ = "A_FichierSource";
const PKO_NOM_COLONNE_ID = "id";

const TABLE_AGENTS = "agents";
const TABLE_PKO = "PKO";
const TABLE_PKO_PAGES = "PKO_Pages";

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
        requiredAccess: "full"
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

        console.log("Pages :", pdf.numPages);

        const agents = [];

        let texteAgentCourant = "";


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

        console.log(pagesPko);
        console.log("Fin");

        // -----------------------------------------------------
        // Ecriture des pages agent dans la page agent
        // -----------------------------------------------------

        const actions = [];

        for (const page of pagesPko) {

            actions.push([
                "AddRecord",
                TABLE_PKO_PAGES,
                null,
                page
            ]);

        }

        await grist.docApi.applyUserActions(
            actions
        );

        statusDiv.innerText =
            "Extraction terminée";

        // -----------------------------------------------------
        // récupération des données des pages pko extraites
        // -----------------------------------------------------

        const pages =
            await lireTable(TABLE_PKO_PAGES);

        console.log(pages);

        const pagesDuPko =
            pages.filter(
                p => p.PKO_id === currentRecordId
            );

        // -----------------------------------------------------
        // construction liste des agents
        // -----------------------------------------------------
        console.log(pagesDuPko);

        console.log("A");
        pyodide.globals.set(
            "pages_Du_Pko",
            pagesDuPko
        );

        console.log("B");
        const agents_JSON =
           await pyodide.runPythonAsync(`
            construire_agents(
                pages_Du_Pko
            )
       `);
            console.log("CCC");
        const agents_a_creer =
        JSON.parse(agents_JSON);

       console.log("agents à créer >>>>>>>>");
       console.log(agents_JSON);

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
