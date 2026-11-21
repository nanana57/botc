# Joueurs IA et Conteur automatique

## Principe

Le modèle de langage n'est **jamais** l'autorité. Un bot :

1. **observe** sa seule vue (`playerView`) et met à jour sa mémoire : revendications, accusations, morts, tirs, nominations, questions qui lui sont adressées ;
2. **raisonne** : il énumère tous les mondes possibles (qui est le Démon, qui sont les Sbires) et pondère chacun par sa vraisemblance au regard de ce qu'il sait ;
3. **décide** : voter, nommer, choisir une cible la nuit, tirer, ou prendre la parole avec une intention précise ;
4. **formule** : l'intention devient une phrase par gabarit, éventuellement reformulée par le LLM (sans changement de sens, sinon on garde le gabarit) ;
5. **soumet** son action au moteur, qui la valide.

## Raisonnement par mondes possibles

Avec 15 joueurs, il y a au plus 14 × C(13,3) = 4 004 mondes pour un joueur bon : on peut tous les évaluer. Observations prises en compte :

| Observation | Effet |
|---|---|
| Ma propre info | Vraisemblance pondérée par la confiance en moi (je peux être ivre ou empoisonné) |
| Info revendiquée par un autre | Si ce joueur est bon dans ce monde, son info doit être juste (tolérance selon le trait *confiance*) |
| Deux joueurs revendiquent le même rôle | Au moins un ment (sauf Ivrogne) |
| Changement de version sur son rôle | Suspicion |
| Mort pendant la nuit | Rarement le Démon ou un Sbire |
| La partie continue après la mort d'un joueur | Ce joueur n'était probablement pas le Démon |
| Tir de Pourfendeur raté | Si le tireur est bon, la cible n'est pas le Démon |

Le bot en tire `P(maléfique)` et `P(Démon)` pour chaque joueur, ainsi que **l'observation qui pèse le plus** sur chacun (calculée en retirant une observation à la fois). C'est ce qui lui permet de motiver ses accusations : « Hortense et Bérangère revendiquent tous deux Maire, quelqu'un ment ».

Les bots maléfiques calculent aussi la **vue publique** (ce qu'un villageois neutre peut déduire) pour choisir des boucs émissaires crédibles et anticiper les soupçons.

## Personnalités (effets mesurables)

Chaque profil est un vecteur de 11 traits. Effets dans le code :

- **Agressivité** : abaisse les seuils d'accusation, de nomination et de vote. Testé : un bot agressif vote plus souvent qu'un prudent dans les mêmes situations.
- **Prudence** : relève ces mêmes seuils ; choisit un bluff sans information, moins vérifiable.
- **Confiance** : tolérance accordée aux infos revendiquées par les autres.
- **Suivisme / opportunisme** : rejoindre une majorité qui va passer ; un opportuniste maléfique « lâche » un allié condamné pour paraître crédible.
- **Analyse** : poids du modèle logique par rapport à l'intuition.
- **Bluff** : choix d'un faux rôle à information et invention de fausses infos qui orientent le village.
- **Risque** : tir du Pourfendeur, transmission du Démon, usage du vote fantôme.
- **Influence** : propose des plans de vote.
- **Jour de révélation** : révèle son rôle d'emblée, ou tard.
- **Parole** : fréquence des prises de parole.

## Conversation autonome (couche sociale)

Chaque message public porte un **sens structuré** (revendication, info, accusation motivée ou non, confiance, demande de soutien, hypothèse…), une **cible** (`to`) et le **message auquel il répond** (`replyTo`). Les messages humains reçoivent le même traitement par analyse du texte. À chaque instant, un bot considère deux familles d'interventions :

- **Proactives** : se révéler, partager une nouvelle info, accuser avec un motif (en citant ceux qui pensent pareil), nommer, proposer un plan, interroger un silencieux, faire circuler une hypothèse de complicité (paire la plus probable dans ses mondes), se rétracter ou réorienter ses soupçons, tirer (Pourfendeur).
- **Réactives** (fil de conversation) : répondre « pourquoi ? » puis expliquer, approuver ou contester une accusation, contredire qui revendique son rôle ou le met en cause, confirmer une info juste, réagir à la défense d'un accusé (et parfois être convaincu, ce qui baisse réellement sa suspicion), répondre à une demande de soutien, proposer une alliance.

Le serveur choisit à chaque instant l'intervention la plus urgente de toute la table. Les **silences** sont naturels : délais aléatoires entre deux prises de parole, parole limitée chaque jour selon le trait *parole*, morts beaucoup moins bavards.

**Raisonnement imparfait** : un bot ne remarque chaque indice public qu'avec une probabilité de 50 % + 50 % × *analyse*. Le tirage est stable, donc ses erreurs restent cohérentes d'un instant à l'autre. Les bots peu analytiques donnent des raisons d'intuition (« je le sens mal ») et peuvent soupçonner un innocent, voire un mort.

**Votes** : à l'ouverture, chaque bot forme un avis personnel sans voir les mains des autres. Quand l'aiguille l'atteint, il revoit sa position : pression sociale proportionnelle au *suivisme*, abstention prudente si la majorité est déjà acquise, lâchage d'un allié condamné pour l'opportuniste du Mal.

**Démon** : il retient les victimes qui ont survécu à ses attaques (Soldat ou joueur protégé probable) et les évite ensuite.

## Traces et simulations

- `Room.trace` enregistre tout : paroles (avec intention et réponse), réveils et choix de nuit avec leur justification interne, informations secrètes livrées, décisions du Conteur, intentions et changements de vote, photographie des croyances de chaque bot à l'aube. Le tout est persisté avec le salon.
- L'onglet **Pensées** du Grimoire affiche ces raisonnements en direct au Conteur ou à l'observateur, jamais aux joueurs.
- `npm run simulate -- <joueurs> <graine> [humain]` écrit une transcription dans `simulations/`. `npx tsx scripts/stats.ts` mesure les comportements sur plusieurs parties.
- Les parties sont **reproductibles** : le hasard du rythme (délais, silences) est lui aussi tiré d'une graine.

Voir `docs/SIMULATION.md` pour une journée et une nuit commentées.

## Stratégies du Mal

- **Démon** : bluffe à partir de ses 3 rôles. Il tue en priorité les rôles d'information revendiqués et ceux qui accusent ses alliés. Il évite un Soldat déclaré si le bot est prudent. Il se sacrifie (transmission) s'il est démasqué et a un Sbire vivant.
- **Sbires** : choisissent un bluff qui n'a pas encore été revendiqué. Ils en changent si quelqu'un l'annonce avant eux, ce qui évite la double revendication entre alliés. L'**Espion** se sert du Grimoire pour donner de vraies infos sur des joueurs bons et gagner en crédibilité.
- **Fausses infos** : un faux Enquêteur accuse un bouc émissaire. Une fausse Lavandière confirme un vrai Villageois déjà déclaré. Un faux Empathe « voit » le Mal chez un voisin bon.
- **Votes** : jamais contre un allié, sauf lâchage opportuniste quand il est déjà condamné.

## Conteur automatique

Le moteur gère les règles et le narrateur la mise en scène. Rythme : nuit (réflexion des bots de 1,2 à 2,8 s), débat, plaidoiries, aiguille de vote, gong de fin de jour. Aucun appel LLM.

## Fournisseurs

`.env` : `AI_PROVIDER=anthropic|openai|gemini|compatible|none`, `AI_MODEL`, les clés et `AI_CALL_BUDGET_PER_GAME`. Sans fournisseur, tout fonctionne : les répliques viennent des gabarits.

Le LLM ne sert qu'à **reformuler**. La reformulation est rejetée si un nom, un rôle ou un chiffre change, ou si elle évoque l'IA.

## Limites actuelles (franchement)

- Les gabarits restent reconnaissables sur une longue partie. Le LLM améliore nettement le naturel.
- La compréhension des messages humains se fait par mots-clés (revendication, info chiffrée, accusation, question). Une phrase subtile peut échapper. Une extraction par LLM optionnelle est prévue.
- Pas encore de leçons entre parties (la v1 en stockait sous forme de texte libre). Prévu sous forme de statistiques par joueur humain : tendances de vote, fiabilité des revendications.
- Les bots ne mènent pas encore de conversations privées, et le Mal n'a pas de canal secret pour se concerter (l'Empoisonneur et le Démon visent parfois la même cible).
