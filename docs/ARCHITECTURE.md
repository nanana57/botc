# Architecture v2

```
src/
  shared/      types et données de rôles (aucune dépendance)
  engine/      MOTEUR DE RÈGLES — pur, déterministe, testé
    engine.ts    actions validées : nuit, infos, morts, nominations, votes, victoire
    views.ts     vue individuelle d'un joueur / du Conteur / d'un spectateur
    rng.ts       hasard à graine stocké dans l'état
  ai/          JOUEURS IA (côté serveur)
    memory.ts    mémoire individuelle, alimentée uniquement par la vue du bot
    reasoner.ts  raisonnement par mondes possibles
    brain.ts     décisions : nuit, vote, nomination, bluff, prise de parole
    personalities.ts  10 profils à traits numériques
    speech.ts    intention → phrase (gabarits) → reformulation LLM validée
    parse.ts     sens public d'un message humain (rôle, info, accusation)
    providers.ts passerelle LLM (Anthropic, OpenAI, Gemini, compatible)
  storyteller/ narrator.ts : mise en scène et rythme du Conteur automatique
  server/      HTTP + WebSocket, salons, permissions, persistance
  client/      interface React (Vite), système de design maison
tests/         moteur, isolation des secrets, IA, fournisseurs, serveur
scripts/       simulate.ts : partie accélérée entre bots
legacy/        version 1, conservée telle quelle
```

## Les huit séparations demandées

| Couche | Où | Garantie |
|---|---|---|
| 1. Moteur de règles | `engine/engine.ts` | Seule autorité. Chaque action est validée et lève `RuleError` si elle est illégale. |
| 2. État réel | `GameState` (serveur uniquement) | Jamais envoyé à un joueur. |
| 3. Vue individuelle | `engine/views.ts` | Rôle cru (l'Ivrogne voit son faux rôle), ses messages privés, informations publiques. Tests anti-fuite sur 5 à 15 joueurs. |
| 4. Mémoire individuelle | `ai/memory.ts` | Construite à partir de la vue du bot, rien d'autre. |
| 5. Raisonnement | `ai/reasoner.ts`, `ai/brain.ts` | Local, déterministe, sans appel réseau. |
| 6. Génération des interventions | `ai/speech.ts` | Le cerveau choisit l'intention ; la forme vient d'un gabarit ou du LLM. |
| 7. Validation des actions | `server/room.ts` → moteur | Permission (qui ?) puis légalité (règles). Un choix de bot refusé est remplacé par un choix valide. |
| 8. Appels API | `ai/providers.ts` | Serveur uniquement : délai, nouvel essai, coupe-circuit, budget. |

## Flux d'une action

```
client (WebSocket) ──► Room.handle : permission (jeton → siège / Conteur / hôte)
                                   └─► engine.* : validation des règles, mutation
                       Room.flush : pour chaque client, viewFor(grant) ─► envoi
Room.tick (400 ms) : bots (observe → think → proposition → moteur), aiguille de vote,
                     délais de nuit, fin du jour (Conteur automatique)
```

## Conteur : deux modes

- **Automatique** : le moteur résout tout. Les choix laissés au Conteur (quelle fausse info donner, qui hérite du Démon, qui meurt à la place du Maire) sont tirés parmi les options valides que le moteur énumère. Le module `storyteller/narrator.ts` ne fait que la mise en scène.
- **Humain** : le moteur met la partie en pause à chaque choix et présente au Conteur la liste des options légales, avec une suggestion.

Aucun LLM n'intervient dans les règles.

## Persistance

`data/rooms/<CODE>.json`, écrit de façon atomique avec un délai de 400 ms après chaque changement, puis rechargé au démarrage. Les cerveaux des bots sont reconstruits à partir de leur vue. Rien n'est supprimé automatiquement.

## Coûts IA

| | v1 | v2 |
|---|---|---|
| Appels par décision | 1 appel LLM par décision et par bot (parole, vote, nuit, observation) | 0 : les décisions sont locales |
| Appels par prise de parole | 1 | 1 au plus, seulement si un fournisseur est configuré |
| Taille du prompt | 2 à 4 Ko | ≈ 0,6 Ko (réplique + 6 derniers messages) |
| En cas de panne | IA désactivée | Retour automatique aux gabarits |

Budget configurable : `AI_CALL_BUDGET_PER_GAME`.

## Sécurité

- Jetons de 144 bits par siège, stockés dans le navigateur du joueur.
- Clés API dans `.env` (ignoré par Git).
- Messages WebSocket limités à 16 Ko et à 60 par tranche de 5 s.
- Fichiers statiques protégés contre la traversée de chemin.
- Reste à faire avant une mise en ligne publique : HTTPS (derrière un proxy), limitation par adresse IP, expiration des salons.
