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


def construire_agents(pages):
    pass


def construire_indus(agent):
    pass