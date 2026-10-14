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
        print(json.dumps(page, indent=2))
"""        numero_agent = page["numero_enregistrement"]
        print(f"numero_agent: {numero_agent}")
        if numero_agent not in agents:
            print(f"Creating entry for agent: {numero_agent}")
            agents[numero_agent] = []

        agents[numero_agent].append(
            page["numero_enregistrement"]
        ) 


    resultat = []

    for numero_agent, pages_ID in agents.items():

        resultat.append({
            "PAGE_PKO_ID": pages_ID
        })"""

    return None
#    return json.dumps(resultat)

def construire_indus(agent):
    pass