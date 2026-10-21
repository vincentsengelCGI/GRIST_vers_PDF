// =====================================================
// =====================================================
// CONFIGURATION
// =====================================================
// =====================================================

const CONFIG = {

    PKO_COL_PJ: "A_FichierSource",

    TABLE_PKO: "PKO",
    TABLE_PKO_PAGES: "PKO_Pages",
    TABLE_AGENTS: "Agents",
    TABLE_INDUS: "Indus",

    TABLE_UTILISATEURS: "Referentiel_utilisateurs",

    TABLE_SESSION_UTILISATEUR: "Session_utilisateur",

    COL_EMAIL: "utilisateur_courriel",
    COL_NOM: "utilisateur_nomPrenom",
    COL_ACADEMIE: "Academie"

};
``

// =====================================================
// =====================================================
// ETAT APPLICATION
// =====================================================
// =====================================================

const state = {

    utilisateur: null,

    pko: {
        rowId: null,
        attachmentId: null
    },

    extractionEnCours: false

};

// =====================================================
// =====================================================
// INITIALISATION
// =====================================================
// =====================================================


async function initialiserWidget() {

    console.log(
        "Initialisation widget"
    );

    // 1 - Déclaration du widget auprès de Grist
    grist.ready({
        requiredAccess: "full",
        allowSelectBy: true,
        onEditOptions() {
            ouvrirConfiguration();
        }
    });

    // 2 - Chargement éventuel des options
    chargerOptions();

    document
    .getElementById(
        "save-btn"
    )
    ?.addEventListener(
        "click",
        sauvegarderOptions
    );


    // 3 - Identification utilisateur
    await chargerUtilisateur();

    // 4 - Déclaration des événements
    enregistrerEvenements();

    // 5 - Mise à jour interface
    mettreAJourInterface();

    console.log(
        "Widget prêt"
    );

}



// =====================================================
// =====================================================
// EXTRACTION
// =====================================================
// =====================================================


// ---------------------------------------------- 
// Executer Extraction
// ---------------------------------------------- 

async function executerExtraction() {

    console.log("Extraction démarrée...");

    if (
        state.extractionEnCours
    ) {
        return;
    }

    const btnExtract  =
    document.getElementById(
        "btn-extract"
    );

    try {

        btnExtract.disabled = true;
        state.extractionEnCours = true;

        if (!state.pko.rowId) {

            throw new Error(
                "Aucun PKO sélectionné"
            );

        }

        if (!state.pko.attachmentId) {

            throw new Error(
                "Aucun PDF associé"
            );

        }

        statut_afficher("Téléchargement PDF...");
        console.log("Chargement PDF...");
        const pdfData =
            await telechargerPdf(
                state.pko.attachmentId
            );

        statut_afficher("Lecture PDF...");

        const pagesPdf =
            await lirePagesPdf(
                pdfData
            );

        const pagesPko =
            construirePagesPko(
                state.pko.rowId,
                pagesPdf,
                state.utilisateur.academie
            );

        await ajouterLignes(
            CONFIG.TABLE_PKO_PAGES,
            pagesPko
        );

        const pagesRechargees =
            await lireTable(
                CONFIG.TABLE_PKO_PAGES
            );

        const pagesDuPko =
            pagesRechargees.filter(
                p =>
                    p.PKO_ID
                    === state.pko.rowId
            );

        const agents =
            construireAgents(
                pagesDuPko
            );

        await ajouterLignes(
            CONFIG.TABLE_AGENTS,
            agents
        );

        const tableAgents =
            await lireTable(
                CONFIG.TABLE_AGENTS
            );

        console.log("Table agents créée : ", tableAgents);
        console.log("Création des indus...");

        const agentsDuPko =
            tableAgents.filter(
                a =>
                    a.PKO_ID
                    === state.pko.rowId
            );

        console.log("Agents du PKO : ", agentsDuPko);

        const indus =
            construireIndus(
                agentsDuPko
            );

        console.log("Indus à créer : ", indus);

        await ajouterLignes(
            CONFIG.TABLE_INDUS,
            indus
        );

        statut_afficher("Extraction terminée");
        console.log("Extraction terminee");
    }
    catch(error) {

        console.error(error);

        statut_afficher(error.message);

    }
    finally {

        btnExtract.disabled = false;
        state.extractionEnCours = false;
    }

}

// ---------------------------------------------- 
// Executer lire PDF
// ---------------------------------------------- 

async function lirePagesPdf(
    pdfData
) {

    const pdf =
        await pdfjsLib
            .getDocument({
                data: pdfData
            })
            .promise;

    const pages = [];

    for (
        let i = 1;
        i <= pdf.numPages;
        i++
    ) {

        const page =
            await pdf.getPage(i);

        const contenu =
            await page.getTextContent();

        pages.push(
            contenu.items
                .map(x => x.str)
                .join(" ")
                .trim()
        );

    }

    return pages;

}

// ---------------------------------------------- 
// Executer télécharger PDF
// ---------------------------------------------- 

async function telechargerPdf(
    attachmentId
) {

    const token =
        await grist.docApi
            .getAccessToken({});

    const url =
        `${token.baseUrl}/attachments/${attachmentId}/download?auth=${encodeURIComponent(token.token)}`;

    const response =
        await fetch(url);

    if (!response.ok) {

        throw new Error(
            "Téléchargement PDF impossible"
        );

    }

    return response.arrayBuffer();

}

// ---------------------------------------------- 
// Construire pages PKO
// ---------------------------------------------- 

function construirePagesPko(
    pkoId,
    pages,
    academie
) {

    return pages.map(
        (
            contenu,
            index
        ) => ({

            PKO_ID: pkoId,

            numero_page_pko:
                index + 1,

            contenu_pagepko:
                contenu,

            academie:
                academie

        })
    );

}

// ---------------------------------------------- 
//  Construire indus
// >> à partir de la liste des agents, construit 
//    la liste des indus à créer
// ---------------------------------------------- 

function construireIndus(
    agents
) {

    const resultat = [];

    for (const agent of agents) {

        const liste =
            agent.Indus_agents_liste_text
            || [];

        for (const indu of liste) {
            if (!indu) {
                continue;
                }
                
            const nbI =
                (
                    indu.match(/I/g)
                    || []
                ).length;

            if (nbI > 24) {

                resultat.push({

                    indu_brut: indu,

                    agent_ID: agent.id

                });

            }

        }

    }

    return resultat;

}

// ---------------------------------------------- 
//  Construire agents
// >> à partir des pagesPKO, construit la liste
//    des agents à créer
// ---------------------------------------------- 

function construireAgents(
    pagesPko
) {

    const groupes = {};

    for (const page of pagesPko) {
        if (
                !page.numero_enregistrement
            ) {

                continue;

            }
        const numero =
            page.numero_enregistrement;

        if (!groupes[numero]) {

            groupes[numero] = [];

        }

        groupes[numero].push(page.id);

    }

    return Object.values(groupes)
        .map(
            ids => ({
                PAGE_PKO_ID:
                    JSON.stringify(ids)
            })
        );

}

// ---------------------------------------------- 
// Selection du pko
// ---------------------------------------------- 

async function onSelectionPko(
    record
) {

    if (!record?.id) {

        setPkoSelection(
            null,
            null
        );

        return;

    }

    setPkoSelection(

        record.id,

        getAttachmentId(
            record
        )

    );

}

function setPkoSelection(
    rowId,
    attachmentId
) {

    state.pko.rowId =
        rowId;

    state.pko.attachmentId =
        attachmentId;

    mettreAJourInterface();

}

// =====================================================
// =====================================================
// UTILITAIRES GRIST
// =====================================================
// =====================================================

// ---------------------------------------------- 
//  Ajouter des lignes
// ---------------------------------------------- 

async function ajouterLignes(
    table,
    lignes
) {

    if (!lignes.length) {
        return;
    }

    const actions = lignes.map(
        ligne => [
            "AddRecord",
            table,
            null,
            ligne
        ]
    );

    await grist.docApi.applyUserActions(
        actions
    );

}

// ---------------------------------------------- 
//  Lire table
// ---------------------------------------------- 

async function lireTable(
    table
) {

    const data =
        await grist.docApi.fetchTable(
            table
        );

    return tableToRecords(data);

}


// ---------------------------------------------- 
//  table vers record
// ---------------------------------------------- 

function tableToRecords(
    tableData
) {

    const records = [];

    const colonnes =
        Object.keys(
            tableData
        );

    const nbLignes =
        tableData.id.length;

    for (
        let i = 0;
        i < nbLignes;
        i++
    ) {

        const record = {};

        for (
            const colonne
            of colonnes
        ) {

            record[colonne] =
                tableData[colonne][i];

        }

        records.push(record);

    }

    return records;

}

// =====================================================
// SESSION / EMAIL
// =====================================================

async function getUtilisateurEmail() {

    try {

        const nouvelleLigne =
            await grist
                .getTable(
                    CONFIG.TABLE_SESSION_UTILISATEUR
                )
                .create({
                    fields: {}
                });

        const rowId =
            nouvelleLigne.id;

        const records =
            await lireTable(
                CONFIG.TABLE_SESSION_UTILISATEUR
            );

        const session =
            records.find(
                r =>
                    r.id === rowId
            );

        if (!session) {

            throw new Error(
                "Session introuvable"
            );

        }

        const emailUtilisateur =
            session.email;

        await grist
            .getTable(
                CONFIG.TABLE_SESSION_UTILISATEUR
            )
            .destroy(rowId);

        console.log(
            "Utilisateur trouvé :",
            emailUtilisateur
        );

        return emailUtilisateur;

    } catch (error) {

        console.error(
            "Impossible de récupérer l'utilisateur",
            error
        );

        return null;

    }

}

// ---------------------------------------------- 
// Charger utilisateur
// ---------------------------------------------- 

async function chargerUtilisateur() {

    const email =
        await getUtilisateurEmail();

    const utilisateurs =
        await lireTable(
            CONFIG.TABLE_UTILISATEURS
        );

    const utilisateur =
        utilisateurs.find(

            u =>

                u[
                    CONFIG.COL_EMAIL
                ] === email

        );

    if (!utilisateur) {

        throw new Error(
            "Utilisateur introuvable"
        );

    }

    state.utilisateur = {

        id: utilisateur.id,

        email: email,

        nom:
            utilisateur[
                CONFIG.COL_NOM
            ],

        academie:
            utilisateur[
                CONFIG.COL_ACADEMIE
            ]

    };

    console.log(
        "Utilisateur chargé :",
        state.utilisateur
    );

}

// ---------------------------------------------- 
// enregistrer les évènements
// ---------------------------------------------- 

function enregistrerEvenements() {

    grist.onRecord(
        onSelectionPko
    );

    document
        .getElementById(
            "btn-extract"
        )
        .addEventListener(
            "click",
            executerExtraction
        );

}

// ---------------------------------------------- 
// mise à jour de l'interface
// ---------------------------------------------- 

function mettreAJourInterface() {

    const btn =
        document.getElementById(
            "btn-extract"
        );

    const info =
        document.getElementById(
            "file-info"
        );

    if (
        !state.pko.rowId
    ) {

        btn.disabled = true;

        info.textContent =
            "Aucun PKO sélectionné";

        return;

    }

    if (
        !state.pko.attachmentId
    ) {

        btn.disabled = true;

        info.textContent =
            "Aucun PDF détecté";

        return;

    }

    btn.disabled = false;

    info.textContent =
        `PKO ${state.pko.rowId} prêt pour extraction`;

}

// ---------------------------------------------- 
// affichage du statut
// ---------------------------------------------- 

function statut_afficher(message) {

    document
        .getElementById(
            "status"
        )
        .textContent = message;

}

// ---------------------------------------------- 
// CHARGEMENT DES OPTIONS DU WIDGET
// ----------------------------------------------

function chargerOptions() {

    grist.onOptions((options) => {

        if (!options) {
            return;
        }

        CONFIG.TABLE_UTILISATEURS =
            options.cfgNomTableUtilisateur
            || CONFIG.TABLE_UTILISATEURS;

        CONFIG.COL_EMAIL =
            options.cfgColonneEmail
            || CONFIG.COL_EMAIL;

        CONFIG.COL_NOM =
            options.cfgColonneNomComplet
            || CONFIG.COL_NOM;

        CONFIG.COL_ACADEMIE =
            options.cfgColonneAcademie
            || CONFIG.COL_ACADEMIE;

        CONFIG.TABLE_SESSION_UTILISATEUR =
            options.cfgNomTableSession
            || CONFIG.TABLE_SESSION_UTILISATEUR;

            
        const champ_1 =
            document.getElementById(
                "table-utilisateur"
            );
        if (champ_1) {
            champ_1.value =
                CONFIG.TABLE_UTILISATEURS;
        }


        const champ_2 =
            document.getElementById(
                "colonne-email"
            );
        if (champ_2) {
            champ_2.value =
                CONFIG.COL_EMAIL;
        }


        const champ_3 =
            document.getElementById(
                "colonne-nom-complet"
            );
        if (champ_3) {
            champ_3.value =
                CONFIG.COL_NOM;
        }
        

        const champ_4 =
            document.getElementById(
                "colonne-academie"
            );
        if (champ_4) {
            champ_4.value =
                CONFIG.COL_ACADEMIE;
        }


        const champ_5 =
            document.getElementById(
                "table-session"
            );    
        if (champ_5) {
            champ_5.value =
                CONFIG.TABLE_SESSION_UTILISATEUR;
        }


        console.log(
            "Configuration chargée",
            CONFIG
        );

    });

}

// ---------------------------------------------- 
// SAUVEGARDE DES OPTIONS
// ---------------------------------------------- 

async function sauvegarderOptions() {

    await grist.setOption(
        "cfgNomTableUtilisateur",
        document.getElementById(
            "table-utilisateur"
        ).value
    );

    await grist.setOption(
        "cfgColonneEmail",
        document.getElementById(
            "colonne-email"
        ).value
    );

    await grist.setOption(
        "cfgColonneNomComplet",
        document.getElementById(
            "colonne-nom-complet"
        ).value
    );

    await grist.setOption(
        "cfgColonneAcademie",
        document.getElementById(
            "colonne-academie"
        ).value
    );

    await grist.setOption(
        "cfgNomTableSession",
        document.getElementById(
            "table-session"
        ).value
    );

    location.reload();

    console.log(
        "Options enregistrées"
    );

}

// ---------------------------------------------- 
// ouvrir panneau de config
// ---------------------------------------------- 

function ouvrirConfiguration() {

    document.getElementById(
        "main-view"
    ).style.display = "none";

    document.getElementById(
        "config-panel"
    ).style.display = "block";

}

// ---------------------------------------------- 
//  récupérer pièce jointe
// ---------------------------------------------- 

function getAttachmentId(record) {

    const attachment =
        record[
            CONFIG.PKO_COL_PJ
        ];

    if (!attachment) {
        return null;
    }

    if (
        typeof attachment
        === "number"
    ) {
        return attachment;
    }

    if (
        Array.isArray(
            attachment
        )
    ) {

        const premier =
            attachment[0];

        if (
            typeof premier
            === "number"
        ) {

            return premier;

        }

        if (
            premier &&
            typeof premier
            === "object"
        ) {

            return premier.id;

        }

    }

    return null;

}


// =====================================================
// =====================================================
// Démarrage
// =====================================================
// =====================================================

window.addEventListener(
    "DOMContentLoaded",
    initialiserWidget
);