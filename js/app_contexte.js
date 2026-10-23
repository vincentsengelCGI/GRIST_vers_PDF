// =====================================================
// =====================================================
// CONFIGURATION
// =====================================================
// =====================================================

let TABLE_UTILISATEURS = "Referentiel_utilisateurs";

let COLONNE_UTILISATEURS_EMAIL =
    "utilisateur_courriel";

let COLONNE_UTILISATEURS_NOMCOMPLET =
    "utilisateur_nomPrenom";

let TABLE_CONTEXTE_UTILISATEURS = 
    "Contextes_utilisateurs";

let COLONNE_CONTEXTE_PKO_ID =
    "PKO_ID";

let COLONNE_CONTEXTE_UTILISATEUR_ID = 
    "USER_ID";

let TABLE_SESSION_UTILISATEUR =
    "Session_utilisateur";

    
// =====================================================
// =====================================================
// ETAT APPLICATION
// =====================================================
// =====================================================


const state = {

    utilisateur: {id: null},

    synchronisationEnCours: false,

    contexte: null

};

// =====================================================
// =====================================================
// INITIALISATION
// =====================================================
// =====================================================

// =====================================================
// INIT
// =====================================================

window.addEventListener(
    "load",
    initialiserWidget
);

async function initialiserWidget() {

    console.log(
        "Initialisation widget"
    );

    if (typeof grist === "undefined") {

        console.error(
            "API Grist indisponible"
        );

        return;

    }

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
        .getElementById("save-btn")
        ?.addEventListener(
            "click",
            sauvegarderOptions
        );

    // 3 - Recherche utilisateur actuel
    try {

        console.log(
            "Identification utilisateur..."
        );

        state.utilisateur =
            await getUtilisateurCourant();

        if (!state.utilisateur) {

            console.error(
                "Utilisateur introuvable"
            );

            return;

        }

        console.log(
            "Utilisateur trouvé :",
            state.utilisateur[
                COLONNE_UTILISATEURS_NOMCOMPLET
            ]
        );

    // 4 - chargement ou création de la session utilisateur

        console.log("State : ", state);
        
        state.contexte = await getOrCreateSession(state.utilisateur.id);
        
        await chargerContexte();

        console.log(
            "INITIALISATION TERMINEE"
        );

        grist.onRecord(
            onSelectionRecord
        );
        
        console.log("Fin onRecord");

    } catch (error) {

        console.error(error);

    }

}

// =====================================================
// WIDGET OPTIONS
// =====================================================

function chargerOptions() {

grist.onOptions((options) => {

    if (!options) {
        return;
    }

    TABLE_UTILISATEURS =
        options.cfgNomTableUtilisateur
        || TABLE_UTILISATEURS;

    COLONNE_UTILISATEURS_EMAIL =
        options.cfgColonneEmail
        || COLONNE_UTILISATEURS_EMAIL;

    COLONNE_UTILISATEURS_NOMCOMPLET =
        options.cfgColonneNomcompletUtilisateur
        || COLONNE_UTILISATEURS_NOMCOMPLET;

    COLONNE_CONTEXTE_PKO_ID =
        options.cfgColonneContexte
        || COLONNE_CONTEXTE_PKO_ID;

    TABLE_SESSION_UTILISATEUR =
        options.cfgTableSessionUtilisateur
        || TABLE_SESSION_UTILISATEUR;

    document.getElementById(
        "table-utilisateur"
    ).value =
        TABLE_UTILISATEURS;

    document.getElementById(
        "colonne-email"
    ).value =
        COLONNE_UTILISATEURS_EMAIL;

    document.getElementById(
        "colonne-nom-complet"
    ).value =
        COLONNE_UTILISATEURS_NOMCOMPLET;

    document.getElementById(
        "colonne-contexte"
    ).value =
        COLONNE_CONTEXTE_PKO_ID;

    document.getElementById(
        "table-session-utilisateur"
    ).value =
        TABLE_SESSION_UTILISATEUR;
           
});

}

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
        "cfgColonneNomcompletUtilisateur",
        document.getElementById(
            "colonne-nom-complet"
        ).value
    );

    await grist.setOption(
        "cfgColonneContexte",
        document.getElementById(
            "colonne-contexte"
        ).value
    );

    await grist.setOption(
        "cfgTableSessionUtilisateur",
        document.getElementById(
            "table-session-utilisateur"
        ).value
    );

    document
        .getElementById(
            "config-panel"
        )
        .style.display =
        "none";

    document
        .getElementById(
            "main-view"
        )
        .style.display =
        "block";

}

// =====================================================
// EVENEMENT DE SELECTION
// =====================================================

async function onSelectionRecord(
    record
) {

    try {

        if (!record?.id) {
            return;
        }

        if (
            state.synchronisationEnCours
        ) {
            return;
        }

        const contexteActuel =
            state.contexte[
                COLONNE_CONTEXTE_PKO_ID
            ];

        if (
            contexteActuel ===
            record.id
        ) {
            return;
        }

        console.log(
            "Mise à jour contexte :",
            record.id
        );

        await mettreAJourContexte(
            record.id
        );

        console.log("Fin OnSelectionRecord")

    } catch (error) {

        console.error(error);

    }

}

// =====================================================
// CONTEXTE
// =====================================================

async function chargerContexte() {

    const contexteId =
    state.contexte[
        COLONNE_CONTEXTE_PKO_ID
    ];
    
    console.log(
        "SET CURSOR",
        contexteId
    );

    if (!contexteId) {

        console.log(
            "Aucun contexte enregistré"
        );

        return;

    }

    console.log(
        "Positionnement curseur :",
        contexteId
    );

    state.synchronisationEnCours =
        true;

    try {

        await grist.setCursorPos({

            rowId: contexteId

        });

    } finally {

        state.synchronisationEnCours =
            false;

    }

}

async function mettreAJourContexte(
    rowId
) {
    console.log("update contexte");

    await grist.docApi.applyUserActions([
            [
                "UpdateRecord",
                TABLE_CONTEXTE_UTILISATEURS,
                state.contexte.id,
                {
                    [COLONNE_SESSION_UTILISATEUR_CONTEXTE]: rowId
                }
            ]
        ]);


    state.contexte[
        COLONNE_CONTEXTE_PKO_ID
    ] = rowId;

    console.log(
        "UTILISATEUR contexte mis à jour"
    );
}


// =====================================================
// =====================================================
// UTILITAIRES GRIST
// =====================================================
// =====================================================

// =====================================================
// UTILISATEUR
// =====================================================

async function getUtilisateurCourant() {

    const utilisateurs =
        await lireTable(
            TABLE_UTILISATEURS
        );

    const email =
        await getUtilisateurEmail();

    const utilisateur_courant = utilisateurs.find(

        utilisateur =>

            utilisateur[
                COLONNE_UTILISATEURS_EMAIL
            ] === email

    );

    console.log("> Utilisateur courant : ", utilisateur_courant);

    return utilisateur_courant

}

// =====================================================
// SESSION / EMAIL
// =====================================================

async function getUtilisateurEmail() {
    console.log(
        "CREATE SESSION ROW"
    );

      try {
    // 1. Demander à Grist de créer une ligne vide dans notre table tampon
    const nouvelleLigne = await grist.getTable(TABLE_SESSION_UTILISATEUR).create({ fields: {} });

    // 2. Récupérer l'ID de la ligne créée
    const rowId = nouvelleLigne.id;

    // 3. Lire la ligne pour récupérer la valeur injectée par la formule Grist
    const records = await lireTable(TABLE_SESSION_UTILISATEUR)

    const session = records.find(r => r.id === rowId);

    const emailUtilisateur = session.email;
    
    console.log(
    "DESTROY SESSION ROW"
    );

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

// =====================================================
// LECTURE TABLE
// =====================================================

async function lireTable(
    tableName
) {

    const tableData =
        await grist.docApi.fetchTable(
            tableName
        );

    return tableToRecords(
        tableData
    );

}

function tableToRecords(
    tableData
) {

    const records = [];

    const colonnes =
        Object.keys(tableData);

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
//  récupérer session ou la créer si vide
// =====================================================

async function getOrCreateSession(
    utilisateurId
) {
    const contextes =
    await lireTable(
        TABLE_CONTEXTE_UTILISATEURS
    );
    
    console.log(contextes);

    if (utilisateurId) {


        let session =
        contextes.find(
            s =>
                s[COLONNE_CONTEXTE_UTILISATEUR_ID]
            === utilisateurId
        );
        
        if (session) {
            return session;
        }
    
    }
        
    await grist.docApi.applyUserActions([
        [
            "AddRecord",
            TABLE_CONTEXTE_UTILISATEURS,
            null,
            {
                [COLONNE_CONTEXTE_UTILISATEUR_ID]:
                    utilisateurId
            }
        ]
    ]);

    const contextesMaj =
        await lireTable(
            TABLE_CONTEXTE_UTILISATEURS
        );

    return contextesMaj.find(
        s =>
            s[COLONNE_CONTEXTE_UTILISATEUR_ID]
            === utilisateurId
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