# Règles : officiel, implémentation, propositions

Les règles sont résumées et reformulées. Ce document ne reproduit pas les textes de l'éditeur.

## 1. Règles officielles prises en charge (Trouble Brewing)

| Domaine | Règle | Où / test |
|---|---|---|
| Mise en place | Répartition par nombre de joueurs (5 à 15) ; le Baron ajoute 2 Étrangers | `startGame`, `validateComposition` — test « répartition » |
| Ivrogne | Croit être un Villageois absent ; capacité inopérante | test « Ivrogne » |
| Bluffs | 3 rôles bons absents, donnés au Démon | test « bluffs » |
| Infos du Mal | Sbires et Démon se connaissent à partir de 7 joueurs | test « à partir de 7 joueurs » |
| Ordre de nuit | Première nuit et nuits suivantes, selon l'ordre du script | `beginNight` |
| Poison | Pendant la nuit et le jour suivant ; prend fin si l'Empoisonneur meurt | `isPoisoned` |
| Infos | Lavandière, Bibliothécaire, Enquêteur, Chef, Empathe, Voyante (avec leurre), Fossoyeur, Gardien des corbeaux, Espion | tests « Première nuit » |
| Apparences | Le Reclus peut paraître maléfique, Sbire ou Démon ; l'Espion peut paraître bon, Villageois ou Étranger | `canRegisterAs` |
| Démon | Ne tue pas la première nuit ; Moine, Soldat ; transmission par suicide ; mort déviée du Maire | tests « Nuits suivantes » |
| Femme écarlate | Devient Démon si au moins 5 joueurs vivants à la mort du Démon | test |
| Nominations | Une par nominateur vivant et par nommé, par jour | test |
| Votes | Ordre horaire à partir du nommé ; seuil = moitié des vivants arrondie au supérieur ; il faut battre le score du billot ; égalité = personne | test « seuil » |
| Morts | Un vote fantôme unique ; plus de nomination | test |
| Majordome | Son vote ne compte que si son Maître vote | test |
| Vierge | Exécute un Villageois qui la nomme en premier | tests |
| Pourfendeur | Un tir public ; seul un vrai Pourfendeur en bonne santé a un effet (le bluff est possible) | test |
| Victoire | Démon mort → Bien ; 2 vivants → Mal ; Sainte exécutée → Mal ; Maire à 3 sans exécution → Bien | tests « Conditions de victoire » |

## 2. Choix d'implémentation

- **Choix du Conteur automatique** : tirage parmi des options valides, avec un générateur à graine. Une info fausse (Ivrogne, poison) est choisie différente de la vérité ; une fausse info ne nomme jamais l'Ivrogne à l'Ivrogne.
- **Apparences** : le Reclus apparaît comme Démon au Pourfendeur avec une probabilité de 0,4. L'Espion apparaît comme Villageois à la Vierge avec une probabilité de 0,5.
- **Exécution par la Vierge** : la journée continue jusqu'à la fin du minuteur, mais plus aucune nomination n'est possible. Le Conteur automatique clôt le jour 6 secondes après.
- **Débat d'une nomination** : 18 s si le nommé est humain, 9 s si c'est un bot. Ensuite, l'aiguille avance d'un votant toutes les 1,3 s.
- **Délai de nuit** : 60 s pour un humain (réglable), puis choix aléatoire valide.
- **Les morts peuvent parler** sur la place, comme dans le jeu en présentiel.

## 3. Améliorations proposées (non faites)

1. Scripts Bad Moon Rising et Sects & Violets : le moteur est prêt à les accueillir (énumération d'options, apparences, étapes conditionnelles). Il faut ajouter leurs rôles un par un, avec leurs tests.
2. Voyageurs et Fabled.
3. Choix « dramaturgiques » du Conteur automatique : favoriser les parties serrées (par exemple, la cible d'une fausse info), au lieu d'un tirage uniforme.
4. Conversations privées entre joueurs (de jour comme de nuit), visibles du Conteur.
5. Rejouer une partie à l'identique à partir de sa graine et du journal des actions.
