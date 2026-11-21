# Audit de la version 1 (prototype)

État audité : `main` au commit `4c95e3b` (conservé sous le tag `v1-legacy` et dans `legacy/index.html`).

## Architecture constatée

- Un seul fichier `index.html` de 5 570 lignes (≈ 390 Ko) : React 18 + Babel compilé **dans le navigateur**, Tailwind via CDN (versions non figées), PeerJS pour l'audio/vidéo.
- Un composant `App()` de ≈ 4 850 lignes regroupe tout : synchronisation, jeu, IA, Conteur IA, interface.
- Synchronisation : base Firebase Realtime **publique**, interrogée toutes les secondes par chaque client (`PUT`/`PATCH` sans authentification).
- Catalogue de rôles et icônes téléchargés depuis le dépôt tiers `bra1n/townsquare` (textes et images officiels).
- Historique Git : 39 commits, presque tous « Update index.html » ou envois de fichiers complets ; aucun test, aucune branche.

## Constats par fonctionnalité

| Fonctionnalité | État réel | Décision |
|---|---|---|
| Salons (code à 6 lettres) | Fonctionne | Reconstruit côté serveur (code à 5 signes, jetons) |
| Arrivée des joueurs | Fonctionne, sans authentification : n'importe qui peut écrire l'état de n'importe qui | Reconstruit |
| **Secret des rôles** | **Défaillant** : rôles, bluffs du Démon et messages privés sont écrits dans une base publique, et le filtrage se fait seulement côté client. Un joueur qui ouvre les outils du navigateur voit tout. | Reconstruit (vues individuelles produites par le serveur) |
| Clés API | Saisies et stockées dans le navigateur (`localStorage`), appels directs avec `anthropic-dangerous-direct-browser-access` | Reconstruit (clés uniquement côté serveur) |
| Attribution des rôles | Fonctionne (répartition officielle) | Réécrite dans le moteur, testée |
| Script Trouble Brewing | **Incomplet** : Gardien des corbeaux et Vierge absents de la liste | Complet dans la v2 |
| Capacités nocturnes | Non appliquées par le code : le Conteur humain ou le LLM les interprètent | Reconstruit (moteur déterministe) |
| Conteur IA | Le LLM reçoit le Grimoire et décide des morts, des infos et des effets en JSON libre. Résultats non vérifiés, coûteux, non reproductibles. | Remplacé : moteur + Conteur automatique |
| Nominations / votes | Partiellement : règles d'une nomination par jour gérées, aiguille de vote présente | Reconstruit dans le moteur (Majordome, votes fantômes, égalités) |
| Victoire | Vérification partielle (Sainte, Maire, Femme écarlate gérés à la main dans le Conteur IA) | Moteur |
| Bots IA | Un appel LLM par décision (parler, voter, nuit), prompts de 2 à 4 Ko, budget de 400 appels. Les bots maléfiques reçoivent les bluffs de leurs alliés en clair. La personnalité ne change que le style du texte. | Reconstruit (raisonnement local, LLM optionnel pour la forme) |
| Mémoire et leçons | Notes libres réécrites par le LLM ; leçons stockées dans le navigateur | Remplacé par une mémoire structurée (leçons inter-parties : à venir) |
| Audio/vidéo (PeerJS), synthèse vocale, salons d'aparté, fonds d'écran | Fonctionnels mais liés au monolithe | Non repris pour l'instant (voir « À reprendre ») |
| Scripts BMR, S&V, scripts maison | Listés, aucune mécanique implémentée | Affichés « pas encore pris en charge » |

## Problèmes de droits

- Icônes officielles chargées depuis un dépôt tiers, textes de capacités officiels : retirés de la v2 (voir `LEGAL.md`).

## À reprendre de la v1

- Audio/vidéo entre joueurs (PeerJS), synthèse vocale des bots.
- Salons d'aparté de jour et « cottages » de nuit (conversations privées entre joueurs).
- Éditeur de scripts personnalisés et jetons de rappel libres du Conteur.
