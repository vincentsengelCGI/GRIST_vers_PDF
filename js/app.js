// -----------------------------------------------------
// Configuration
// -----------------------------------------------------

const NOM_COLONNE_PJ = "A_FichierSource";
const NOM_COLONNE_TEXTE = "contenu_pdf";
const NOM_COLONNE_ID = "PKO_ID";

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
// Pyodide
// -----------------------------------------------------

async function initPyodide() {
    console.log("Chargement de Pyodide...");
    pyodide = await loadPyodide();
    console.log("Pyodide prêt");
}

async function testPython() {
	const texte = "bonjour depuis javascript";
	
	pyodide.globals.set(
	    "texte_recu",
	    texte
	);
	
	const resultat = await pyodide.runPythonAsync(`
		texte_recu.upper()
	`);
	
	console.log(resultat);
}

// -----------------------------------------------------
// Extraction
// -----------------------------------------------------

async function executerExtraction() {

    console.log("=== EXTRACTION DEMARREE ===");


    await testPython();

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
        console.log(">>> 01");
        const agents = [];

        let texteAgentCourant = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            console.log(">>> 02");
            console.log(i);

            const page = await pdf.getPage(i);

            const textContent =
                await page.getTextContent();

            const textePage =
                textContent.items
                    .map(item => item.str)
                    .join(" ");

            texteAgentCourant +=
                `--- Page ${i} ---\n${textePage}\n\n`;

            const finAgent =
                /REF\s+ETAT\s*:\s*PKO\s+TOTAL\s+UP\s+PAIGKM/i
                    .test(textePage);

            console.log(finAgent);
            if (finAgent) {

                agents.push(
                    texteAgentCourant.trim()
                );

                texteAgentCourant = "";
            }

        }

        // -----------------------------------------------------
        // Ecriture de tout le texte dans la ligne PKO
        // -----------------------------------------------------
        let texteComplet = "";

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

        console.log("Table :", tableId);
        console.log(">>> 05");
        console.log(">>> 05");

        const valeurs = {};

        valeurs[NOM_COLONNE_TEXTE] = texteComplet;

		pyodide.globals.set(
			    "texte_pdf",
			    texteComplet
			);
			
			const agents_lecture =
				await pyodide.runPythonAsync(`
					import re
					texte = texte_pdf
					return_value = len(
					    texte.split("--- Page")
					)
					return_value
				`);
				
			console.log(
				"Nombre trouvé :",
				agents_lecture
			);

        await grist.docApi.applyUserActions([
            [
                "UpdateRecord",
                tableId,
                currentRecordId,
                valeurs
            ]
        ]);

        // -----------------------------------------------------
        // Ecriture des pages agent dans la page agent
        // -----------------------------------------------------

        const actions = [];

        for (const texteAgent of agents) {

            actions.push([
                "AddRecord",
                "Agents",
                null,
                {
                    texte_PKO: texteAgent,
                    PKO_iD: id_PKO
                }
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
