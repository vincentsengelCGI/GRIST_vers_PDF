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

        resultat.append({
            "PAGE_PKO_ID": agents[pages_ID]
    })

    return json.dumps(resultat)

def construire_indus(agent):
    pass