# parser.py
import json

def construire_pages_pko(pko_id, pages):

    resultat = []

    for numero_page, contenu in enumerate(
        pages,
        start=1
    ):

        resultat.append({
            "PKO_id": pko_id,
            "numero_page_pko": numero_page,
            "contenu_pagepko": contenu
        })

    return json.dumps(resultat)


def construire_agents(pagesPko):

    agents = {}
    for page in pagesPko:

        numero_agent = page["numero_enregistrement"]
        if numero_agent not in agents:
            agents[numero_agent] = []

        agents[numero_agent].append(
            page["id"]
        ) 

    resultat = []

    for pages_ID in agents:
        print(f"pages_ID: {pages_ID}, agents[pages_ID]: {agents[pages_ID]}")
        resultat.append({
            "PAGE_PKO_ID": str(agents[pages_ID])
    })

    return json.dumps(resultat)

def construire_indus(induAgents):

    resultat = []

    for indu_agent in induAgents:
        for indu in indu_agent["Indus_agents_liste_text"]:
            if indu.count('I') < 24:
                resultat.append({
                    "indu_brut": indu,
                    "agent_ID": indu_agent["id"]
                })
            else:
                continue

    return json.dumps(resultat)