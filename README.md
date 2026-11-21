# Minuit au Clocher

Plateforme de jeu en ligne de déduction sociale, compatible avec les règles de *Blood on the Clocktower* (projet de fan non officiel). Elle propose un moteur de règles déterministe, des joueurs IA qui raisonnent, un Conteur automatique ou humain, et une direction artistique gothique originale.

![Accueil](docs/captures/01-accueil.jpg)

## Lancer

Prérequis : Node.js 20 ou plus.

```powershell
npm install
npm start
```

Puis ouvrir <http://localhost:8787>. `npm start` compile l'interface et lance le serveur.

En développement, avec rechargement à chaud (l'interface est sur <http://localhost:5173>) :

```powershell
npm run dev
```

### IA (facultatif)

Sans configuration, les bots jouent entièrement : ils raisonnent localement et parlent grâce à des gabarits. Pour des répliques plus naturelles, copier `.env.example` en `.env` et renseigner par exemple `AI_PROVIDER=anthropic` et `ANTHROPIC_API_KEY=…`. Les clés restent sur le serveur.

## Tester

```powershell
npm test
```

Les tests couvrent :
- **moteur** : répartition, informations, poison, Ivrogne, morts, nominations, votes, victoires ;
- **isolation des secrets** : 5 à 15 joueurs, plusieurs nuits ;
- **IA** : raisonnement, personnalités, bluffs, erreurs des fournisseurs ;
- **serveur** : WebSocket réel, permissions, reprise de session, persistance après redémarrage ;
- **parties complètes** entre bots.

Pour simuler une partie accélérée entre bots (transcription complète dans `simulations/`) :

```powershell
npm run simulate -- 10 203
```

Avec un joueur humain simulé :

```powershell
npm run simulate -- 8 301 humain
```

Une simulation commentée (une journée et une nuit complètes) est présentée dans [docs/SIMULATION.md](docs/SIMULATION.md).

## Trois façons de jouer

À l'accueil, en fondant un village :

- **Je joue** (mode A) : tu t'assieds parmi les joueurs, les bots complètent la table, le Conteur automatique mène la partie.
- **Je conte** (mode B) : tu tiens le Grimoire ; humains et bots jouent ensemble.
- **J'observe** (mode C) : une partie entière entre bots, menée par le Conteur automatique. Tu suis le Grimoire, la place et l'onglet « Pensées » (raisonnements internes des bots).

## Ce qui fonctionne aujourd'hui

- Accueil, création et accès à un salon par code ou lien, reprise automatique après rechargement.
- Lobby : registre, bots avec personnalité au choix, script, durée du débat.
- Script **Trouble Brewing complet** (22 rôles), de 5 à 15 joueurs.
- Partie jouable : actions de nuit, carnet secret, place publique, nominations, plaidoiries, aiguille de vote, votes fantômes, Pourfendeur, exécutions, victoire.
- Grimoire du Conteur humain : rôles, marqueurs (poison, protection, Ivrogne, leurre, Maître), ordre de réveil, décisions limitées aux options légales, historique des votes, journal secret, messages privés, activité des bots.
- Bots autonomes : ils lancent la discussion, se répondent, se contredisent, demandent des comptes, cherchent du soutien, forment des alliances, changent d'avis et de vote, nomment d'eux-mêmes. Raisonnement par mondes possibles, d'une qualité inégale selon la personnalité. Bluffs et fausses infos cohérents dans le camp du Mal.
- Interface adaptée au mobile.

## Pas encore fait

- Scripts Bad Moon Rising et Sects & Violets (affichés « pas encore pris en charge »).
- Audio/vidéo, synthèse vocale, conversations privées entre joueurs (présents dans la v1).
- Leçons apprises par les bots d'une partie à l'autre.
- Analyse des vidéos No Rolls Barred (voir `docs/BEHAVIOR_LIBRARY.md`).
- Déploiement public : HTTPS, limitation par adresse IP, expiration des salons, vérification des droits (voir `docs/LEGAL.md`).

## Documentation

- [Audit de la v1](docs/AUDIT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Règles : officiel, implémentation, propositions](docs/RULES.md)
- [IA et Conteur](docs/AI.md)
- [Bibliothèque comportementale](docs/BEHAVIOR_LIBRARY.md)
- [Droits et licences](docs/LEGAL.md)

La version 1 est conservée dans `legacy/` et sous le tag Git `v1-legacy`.
