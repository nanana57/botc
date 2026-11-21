# Bibliothèque de situations comportementales

## État de la phase « analyse vidéo » (No Rolls Barred)

**Non réalisée dans cette itération.** Je n'ai visionné ni analysé aucune vidéo de la chaîne : je n'en ai pas les moyens techniques dans cet environnement (pas de lecture audio/vidéo), et je n'ai pas récupéré de transcriptions. Aucune fiche ci-dessous ne provient de ces parties.

Protocole proposé pour la suite :

1. Choisir trois parties Trouble Brewing avec sous-titres disponibles, en vérifiant que l'usage prévu (extraction d'enseignements généraux, sans reproduction) est compatible avec les conditions de la plateforme.
2. Récupérer les sous-titres (outil local, hors de ce dépôt), puis les annoter jour par jour avec le format ci-dessous.
3. Ne garder que des enseignements **généraux** : aucun dialogue, nom, tic de langage ni personnalité de participant.
4. Pour chaque enseignement, indiquer le paramètre ou la règle du bot qui le traduit, et ajouter un test.

## Format d'une fiche

```yaml
id: B-000
source: (partie / horodatage, ou « connaissance générale »)
contexte: …
phase: J2 | N3 …
role_du_joueur: …
infos_connues: …
infos_publiques: …
declarations_des_autres: …
probleme_strategique: …
reaction: …
decision: …
consequences: …
enseignement_IA: …
implementation: (fichier / trait / test)
```

## Fiches initiales (source : connaissance générale de la stratégie du jeu)

| id | Situation | Enseignement | Implémentation |
|---|---|---|---|
| B-001 | Deux joueurs revendiquent le même rôle d'information | Au moins un ment ; on pèse avec les autres infos, sans exécuter les deux à l'aveugle | `reasoner` : observation `double-claim` ; accusation motivée |
| B-002 | Un Sbire découvre que son bluff vient d'être revendiqué par un autre | Changer de bluff avant de l'annoncer plutôt que créer un conflit avec un allié | `brain.publicIdentity` : nouveau plan |
| B-003 | Un joueur nommé reste silencieux | Le silence coûte des voix : se défendre, puis révéler son rôle si la pression monte | `brain.think` : défense prioritaire, révélation sous pression |
| B-004 | Un joueur change de rôle revendiqué | Fort indice de mensonge | observation `role-switch` |
| B-005 | Le Démon choisit sa victime | Viser les rôles d'information crédibles et ceux qui accusent juste | `nightChoice` (imp) |
| B-006 | Un allié du Mal est condamné | Voter contre lui peut acheter de la crédibilité (lâchage) | `decideVote` (opportunisme) |
| B-007 | Une fausse info d'un faux Villageois | Plus elle confirme des faits vérifiables, plus elle est crue : l'Espion donne des infos vraies sur des joueurs bons | `fakeInfo` (washerwoman/spy) |
| B-008 | Un joueur mort avec son vote fantôme | Le garder pour une exécution décisive, en fin de partie | `decideVote` (fantôme) |
| B-009 | Un joueur n'a jamais révélé son rôle au jour 2 | Légère suspicion ; on l'interroge, sans le condamner pour ça seul | `suspicion` (+0,06) et intention `question` |
| B-010 | Le Pourfendeur hésite à tirer | Tirer quand la probabilité d'avoir trouvé le Démon est forte, ou en fin de partie | `think` (trait risque) |
