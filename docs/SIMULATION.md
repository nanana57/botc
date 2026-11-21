# Simulation commentée — bots autonomes et Conteur automatique

Toutes les parties ci-dessous ont été jouées **sans intervention humaine** : bots joueurs et Conteur automatique, sans API de langage (les phrases viennent des gabarits locaux). Elles sont reproductibles à l'identique : même graine, même partie.

```powershell
npm run simulate -- 10 203
```

Ces commandes regénèrent ces transcriptions (fichier `simulations/auto-10-203.md`) :

| Fichier | Mode | Joueurs | Issue |
|---|---|---|---|
| `simulations/auto-10-203.md` | C — tout automatique | 10 bots, les 10 personnalités | Bien, jour 4 |
| `simulations/auto-10-201.md`, `auto-10-202.md` | C | 10 bots | Mal, jours 6 et 7 |
| `simulations/auto-15-5.md` | C | 15 bots | Mal, jour 9 |
| `simulations/humain-8-301.md` | A — un humain simulé + 7 bots | 8 | Mal, jour 4 |
| `simulations/statistiques-8-parties.txt` | C | 8 parties × 9 bots | 4 victoires du Bien, 4 du Mal |

Les transcriptions contiennent tout : paroles (avec le message auquel chacune répond), raisonnements internes des bots (🧠, jamais visibles des joueurs), dialogue de nuit avec le Conteur (🌙 réveil et choix, 🔒 information secrète), intentions de vote (✋), changements de vote (🔁) et votes verrouillés (⏱).

---

## 1. Une journée complète — partie 203, Jour 2

**Distribution (secrète)** : Aldric (Analytique) Diablotin · Fantine (Charismatique) Femme écarlate · Hortense (Méfiant) Espion — Bérangère (Prudent) Lavandière · Corentin (Agressif) Empathe · Domitille (Manipulateur) Chef · Éloi (Discret) Enquêteur · Gaspard (Opportuniste) Bibliothécaire · Ignace (Suiveur) Voyante · Joséphine (Stratège) Maire.

**Situation au lever du jour.** Corentin a été tué cette nuit. La veille, **Fantine (Femme écarlate) a revendiqué « Lavandière »**, le rôle de Bérangère. Ce que chacun pense en se réveillant (extraits) :

> 🧠 **Éloi** (discret, 10 indices remarqués sur 11) — Suspects : Fantine 84 %, Joséphine 39 %, Hortense 38 %
> 🧠 **Joséphine** (stratège, 8/10) — Suspects : Bérangère 56 %, Domitille 53 %, Fantine 49 %
> 🧠 **Ignace** (suiveur, 6/11) — Suspects : Corentin 56 %, Aldric 46 %, Gaspard 41 %

Éloi a sa propre info (« Joséphine ou Fantine est Femme écarlate ») et voit juste. Joséphine hésite entre les deux Lavandières. Ignace, peu analytique, n'a remarqué que 6 indices sur 11 et soupçonne un mort.

### Qui prend la parole spontanément

> **Ignace** _[info]_ : « Nouvelle info cette nuit : Éloi et Domitille : non, aucun Démon. »
> **Hortense** _[claim]_ : « Je n'y crois pas. Je suis Moine. »
> **Corentin** _[accuse]_ : « Ignace, je pense que c'est toi. Sa propre annonce ne tient pas debout. »

Personne ne parle à la place des bots. La Voyante partage aussitôt son résultat (un joueur du Bien partage **exactement** son information de nuit, ce que vérifie un test). L'Espion annonce un faux rôle de Moine. Corentin, mort mais toujours bavard (les morts parlent, comme autour d'une vraie table), lance une accusation : son raisonnement le trompe ici, Ignace est une vraie Voyante.

### Qui accuse, qui répond, qui se rétracte

> **Ignace** _[defend]_ ↪ à Corentin : « Corentin, je comprends, mais je ne suis pas le Démon. Je suis Voyante. »
> **Domitille** _[accuse]_ : « Vous ne trouvez pas étrange que Ignace reste si discret ? Son récit se contredit avec les autres infos. Corentin le pense aussi. »
> **Gaspard** _[agree]_ ↪ à Corentin : « Bon, si Corentin le dit… Ignace, ça se tient. »
> **Domitille** _[react-defense]_ ↪ à Ignace : « D'accord, Ignace, ça se tient. Je retire. »

Domitille (Manipulateur) relance l'accusation en ralliant Corentin (« Corentin le pense aussi »). Gaspard (Opportuniste) suit le mouvement par pur suivisme. Puis Domitille **change d'avis** après la défense d'Ignace : la persuasion baisse réellement sa suspicion (−14 points pour la journée), ce n'est pas qu'une phrase.

### Le cœur du jour : deux Lavandières

> **Hortense** _[accuse]_ : « Méfiance : mon soupçon va vers Bérangère : Fantine et Bérangère revendiquent tous deux Lavandière, quelqu'un ment. »
> **Bérangère** _[defend]_ ↪ à Hortense : « Hortense, je comprends le doute, vraiment. Je suis Lavandière. Mais si vous me tuez, le vrai Démon respire. »
> **Éloi** _[hypothesis]_ : « Fantine et Hortense… Ensemble ? Ça expliquerait beaucoup. »
> **Bérangère** _[contradict]_ ↪ à Fantine : « Fantine, c'est impossible : Lavandière, c'est moi. L'un de nous deux ment, et ce n'est pas moi. »
> **Hortense** _[contradict]_ ↪ à Éloi : « Faux, Éloi. Je n'ai rien à voir avec Fantine. »
> **Éloi** _[claim]_ ↪ à Hortense : « Je suis Enquêteur. Joséphine ou Fantine est Femme écarlate. »
> **Fantine** _[contradict]_ ↪ à Éloi : « Faux, Éloi. Je suis Lavandière. »
> **Joséphine** _[contradict]_ ↪ à Éloi : « Faux, Éloi. Je suis Maire. »

C'est la séquence la plus « humaine » de la partie :

- **L'Espion (Hortense) pousse contre la vraie Lavandière.** Bérangère est un bouc émissaire idéal puisqu'elle est dans un conflit de revendication.
- **Éloi (Discret) fait circuler une hypothèse** de complicité Fantine + Hortense, deux joueurs du Mal : il a raison. Accusé de rien, il ne dévoile son rôle qu'au moment où on le contredit (il ne révèle volontiers qu'au jour 3).
- **Son info d'Enquêteur est exacte**, mais elle ne tranche pas entre Joséphine et Fantine. Les deux nient, chacune avec son rôle. Le village ne sait pas qui croire, ce qui est fidèle au jeu.

### Proposer une nomination, chercher du soutien, voter

> ⚖️ **Domitille** nomme Bérangère _(motif : Fantine et Bérangère revendiquent tous deux Lavandière)_
> **Bérangère** _[defend]_ : « Domitille, je comprends le doute, vraiment. Je suis Lavandière et Ignace ou Éloi est Voyante. Mais si vous me tuez, le vrai Démon respire. »
> **Domitille** _[ask-support]_ : « Hortense, tu me suis sur Bérangère ? J'ai besoin de voix. »
> **Hortense** _[answer-support]_ ↪ à Domitille : « Compte sur moi. »

Domitille nomme d'elle-même et demande du renfort à celle qui accusait déjà Bérangère. Hortense (Espion) accepte, trop contente. Bérangère sort son info de Lavandière, qui est vraie (Ignace est bien la Voyante), mais trop tard pour convaincre.

**Comment les votes sont décidés.** À l'ouverture du vote, chaque bot forme un avis personnel « à l'aveugle » :

> ✋ **Gaspard** lève la main — _Suspicion 53 %, seuil 45 %._
> ✋ **Hortense** lève la main — _Un joueur du Bien sur le billot (soupçon public 33 %) : tant mieux._
> ✋ **Ignace** garde la main baissée — _Suspicion 49 %, seuil 50 %._
> ✋ **Aldric** lève la main — _Un joueur du Bien sur le billot (soupçon public 33 %) : tant mieux._
> ✋ **Corentin** garde la main baissée — _Suspicion 27 %, seuil 68 %._ (mort : le vote fantôme exige une forte conviction)

Puis l'aiguille tourne. Quand elle atteint Ignace, il voit deux mains déjà levées :

> 🔁 **Ignace** lève finalement la main — _Suspicion 49 %, seuil 38 %, 2 main(s) déjà levée(s)._
> **Bérangère reçoit 4 voix (seuil 4) et monte sur le billot.**

Ignace (Suiveur) n'était pas convaincu, mais la pression sociale abaisse son seuil. C'est sa voix qui fait basculer le vote, et le Mal (Hortense, Aldric) vote évidemment contre une joueuse du Bien.

### La suite de la journée

> ⚖️ **Ignace** nomme Éloi — « Je nomme Éloi. Je le sens mal, c'est tout. »
> ✋ **Gaspard**, **Ignace**, **Joséphine**, **Corentin** : _Je préfère le joueur déjà sur le billot._
> **Éloi reçoit 2 voix (seuil 4, à battre : 4) : rien ne change.**
> **Gaspard** _[accuse]_ : « Franchement, mon soupçon va vers Bérangère : sa façon de voter me gêne. »
> **Hortense** _[ask-why]_ ↪ à Gaspard : « Sur quoi tu te bases, Gaspard ? »
> **Gaspard** _[explain]_ ↪ à Hortense : « Parce que je le sens mal, c'est tout. »
> **Corentin** _[react-defense]_ ↪ à Aldric : « Tu réponds à côté, Aldric. »
> **Domitille** _[plan]_ : « Je propose un plan : on nomme Aldric, et si ça ne passe pas, Éloi. »
> **Bérangère est exécutée.**

Les raisonnements sont parfois mauvais, et c'est voulu. Ignace nomme sur un ressenti, et la plupart refusent de déplacer le billot. Gaspard justifie une accusation par « je le sens mal » quand on lui demande des comptes. Domitille propose enfin le bon plan (le Diablotin Aldric d'abord), mais trop tard dans la journée.

**Bilan du jour.** Le Bien exécute sa propre Lavandière, piégé par la contre-revendication de la Femme écarlate et poussé par l'Espion. Le village se rattrape ensuite (victoire du Bien au jour 4).

---

## 2. Une séquence nocturne complète — partie à 15 joueurs, Nuit 2

**Distribution utile** : Hortense Diablotin, Gaspard Empoisonneur, Prosper Espion, Corentin Baron — Lazare est **l'Ivrogne mais croit être Moine**, Bérangère Empathe, Joséphine Fossoyeur, Ignace Majordome, Néréé Bibliothécaire.

Le Conteur réveille chaque rôle dans l'ordre du script. À chaque réveil, il pose la question prévue par la capacité. Le bot choisit une cible parmi les choix **légaux** que le moteur accepte, puis reçoit **uniquement** l'information à laquelle il a droit :

> 🌙 **Le Conteur** réveille Gaspard (Empoisonneur) : « Choisis le joueur à empoisonner cette nuit. »
> 🌙 **Gaspard** désigne Néréé — _raisonnement : Néréé revendique Bibliothécaire : son information doit être faussée._
> 📜 _Grimoire : Gaspard empoisonne Néréé_
>
> 🌙 **Le Conteur** réveille Lazare (Moine) : « Choisis un joueur (pas toi) à protéger du Démon cette nuit. »
> 🌙 **Lazare** désigne Néréé — _raisonnement : Je protège Néréé, qui me paraît fiable (suspicion 25 %)._
> 📜 _Grimoire : Lazare protège Néréé (sans effet)_
>
> 🌙 **Le Conteur** réveille Hortense (Diablotin) : « Choisis ta victime. Te désigner toi-même transmet ta nature à un Sbire. »
> 🌙 **Hortense** désigne Néréé — _raisonnement : Néréé accuse mes alliés : il doit disparaître._
> 📜 _Grimoire : Hortense tue Néréé._
>
> 🔒 Le Conteur → **Bérangère** : Parmi tes voisins vivants (Aldric et Corentin), 1 est maléfique.
> 🔒 Le Conteur → **Joséphine** : Le joueur exécuté, Fantine, est Lavandière.
>
> 🌙 **Le Conteur** réveille Ignace (Majordome) : « Désigne ton Maître pour demain (pas toi). »
> 🌙 **Ignace** désigne Lazare — _raisonnement : Lazare sera mon Maître : c'est le joueur en qui j'ai le plus confiance._
> 🔒 Le Conteur → **Ignace** : Ton Maître pour demain : Lazare.
> 🔒 Le Conteur → **Prosper** : Tu consultes le Grimoire.

Ce que montre cette nuit :

- **Le moteur, pas le LLM, décide des effets.** Lazare croit protéger Néréé, mais il est l'Ivrogne : la protection est « sans effet » et Néréé meurt. Lazare ne le sait pas, et sa vue ne le lui dira jamais.
- **Les informations sont exactes et calculées sur l'état réel.** L'Empathe Bérangère reçoit « 1 » entre Aldric et Corentin (Corentin est le Baron). Le Fossoyeur apprend le vrai rôle de la joueuse exécutée.
- **Isolation stricte.** Chaque information n'apparaît que dans la vue de son destinataire. L'Espion, lui, reçoit le Grimoire, comme le prévoit sa capacité.
- **Exploitation le lendemain.** Au lever du Jour 3, presque tous les bots du Bien placent Corentin (Baron) et Gaspard (Empoisonneur) en tête de leurs suspects :

> 🧠 **Bérangère** (prudente, 12/17) — Suspects : Corentin 97 %, Joséphine 54 %, Gaspard 48 %
> 🧠 **Joséphine** (stratège, 15/15) — Suspects : Corentin 78 %, Gaspard 76 %, Bérangère 32 %
> 🧠 **Mahaut** (prudente, 12/15) — Suspects : Gaspard 75 %, Corentin 55 %, Fantine 40 %

Le village a correctement démasqué deux Sbires… mais pas le Diablotin, Hortense, qui finira par gagner.

---

## 3. Mode A — un humain parmi les bots (`simulations/humain-8-301.md`)

L'humain (simulé) écrit en français libre. Le serveur en extrait le sens (rôle, information, accusation, question), exactement comme pour un vrai joueur :

> **Camille** _[humain]_ : « Je suis Enquêteur : Aldric ou Corentin est Femme écarlate. »
> **Aldric** _[contradict]_ ↪ à Camille : « Faux, Camille. Je suis Majordome. »
> **Corentin** _[contradict]_ ↪ à Camille : « Faux, Camille. Je suis Voyante. »

Corentin est la vraie Femme écarlate : il nie en s'abritant derrière un faux rôle de Voyante. Les bots répondent aussi aux interpellations (« Bérangère, tu es quoi ? ») et reprennent les accusations de l'humain.

---

## 4. Mesures sur 8 parties automatiques (9 bots)

Commande : `npx tsx scripts/stats.ts 8 9` (résultat dans `simulations/statistiques-8-parties.txt`).

| Mesure | Valeur |
|---|---|
| Messages de bots | 1 119 |
| … dont réponses directes à un autre bot | 577 (52 %) |
| Nominations décidées par des bots | 57 |
| Changements de vote en cours de scrutin | 36 |
| Défenses jugées convaincantes (rétractations) | 10 |
| Contradictions / demandes d'explication / explications | 70 / 36 / 36 |
| Demandes de soutien / réponses | 46 / 26 |
| Hypothèses de complicité / alliances | 16 / 15 |
| Victoires | Bien 4 · Mal 4 |

## 5. Ce qui reste perfectible

- **Formulations** : sans API, les gabarits restent reconnaissables au fil d'une longue partie (« Faux, X. Je suis… » revient souvent). Avec un fournisseur configuré, chaque réplique est reformulée par le modèle, sans pouvoir en changer le sens.
- **Coordination du Mal** : l'Empoisonneur et le Diablotin visent souvent la même personne (le poison est alors gaspillé). Les joueurs du Mal n'ont pas encore de canal secret pour se concerter.
- **Bavardage** : un joueur accusé peut répéter presque la même défense deux fois dans la journée.
- **Morts** : ils parlent encore (c'est conforme aux règles), mais certains restent un peu trop présents.
- **Humain réel** : la compréhension se fait par mots-clés. Une phrase subtile ou ironique peut être mal comprise. L'extraction par LLM est prévue en complément optionnel.
