// -----------------------------------------------------
// Configuration
// -----------------------------------------------------

const NOM_COLONNE_PJ = "A_FichierSource";
const NOM_COLONNE_TEXTE = "contenu_pdf";
const NOM_COLONNE_ID = "id";

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

        const attachment = record[NOM_COLONNE_PJ];
        id_PKO = record[NOM_COLONNE_ID];

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

        console.log("Test Python >>>>>>>>>>>");
        console.log(id_PKO);

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
        // Ecriture de tout le texte dans la ligne PKO
        // -----------------------------------------------------
        /* let texteComplet = "";

        for (let i = 1; i <= pdf.numPages; i++) {

            statusDiv.innerText =
                `Lecture page ${i}/${pdf.numPages}`;

            const page =
                await pdf.getPage(i);

            const textContent =
                await page.getTextContent();

            const textePage =
                textContent.items
                    .map(item => item.str)
                    .join(" ");

            console.log(">>> 02");
            texteComplet +=
                `--- Page ${i} ---\n${textePage}\n\n`;
        }

        const tableId =
            await grist.getSelectedTableId();

 */
        // -----------------------------------------------------
        // Ecriture des pages agent dans la page agent
        // -----------------------------------------------------


        const actions = [];

        for (const page of pagesPko) {

            actions.push([
                "AddRecord",
                "PKO_Pages",
                null,
                page
            ]);

        }

        await grist.docApi.applyUserActions(
            actions
        );

        statusDiv.innerText =
            "Extraction terminée";

    }
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
