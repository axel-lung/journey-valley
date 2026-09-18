# Le recadrage : de l'outil qui compte juste à l'outil qui fait vendre

Confrontation du nouveau contexte produit avec ce qui est réellement dans le
dépôt au commit `ad22d2e`. Ce document ne remplace pas
`analyse-produit.md` (l'inventaire des manques reste vrai) mais il **remplace
le positionnement** de `besoins-et-entree-marche.md`.

---

## 1. Ce que ce contexte change

**Fait.** Le produit construit jusqu'ici est un back-office financier et
réglementaire : marge, TVA sur marge, devis opposable, facture Factur-X,
registre, carnet, application mobile. Son argument était « les chiffres sont
justes et la facture passera 2027 ».

**Fait.** Le nouveau contexte dit trois choses qui déplacent le centre de
gravité :

- le produit **ne doit pas** être un CRM, un moteur de réservation ni une
  application de voyage complète ;
- il doit être « d'abord un outil de vente simple, centré sur la présentation
  du voyage et la prise de décision » ;
- son entrée, ce n'est plus la saisie d'un dossier, c'est **l'import du
  programme que l'agence a déjà préparé**.

**Recommandation.** Assumer que c'est un changement de produit, pas une
fonctionnalité de plus. La question n'est plus « la marge est-elle juste ? »
mais « le client a-t-il compris, s'est-il projeté, a-t-il répondu ? ».

## 2. Le point qui compte : ce cadrage résout l'objection qui bloquait

Il y a deux itérations, j'ai écarté la stratégie du complément avec un argument
que je crois toujours juste :

> Nos chiffres tombent du dossier. Un complément ne peut donc prendre que deux
> formes : ou l'agence ressaisit ses coûts chez nous en plus de son outil — la
> double saisie, sa douleur n°1 — ou on importe tout et on devient un add-on
> dont l'avantage tient à un connecteur copiable.

**Ce nouveau cadrage échappe aux deux**, et c'est sa force principale.

Un outil dont **l'entrée est le programme déjà écrit** n'a pas de double
saisie *par construction* : le conseiller ne re-saisit rien, il dépose un PDF.
Et il n'est pas un add-on fiscal : ce qu'il produit — la page que le client
ouvre, commente et valide — est le livrable lui-même, pas un fichier annexe.

Conséquence directe : **la cible peut redevenir l'agence sur-mesure déjà
équipée** (Ezus, Toogo, Caladeo), qui était hors d'atteinte. On ne remplace
rien, on ne demande aucune migration, et le coût de bascule — 4 à 12 semaines,
le vrai frein — ne s'applique pas.

**Hypothèse à vérifier, et c'est la plus importante du projet :** que
l'extraction depuis un PDF d'agence soit assez bonne pour que corriger coûte
moins cher que retaper. Si elle ne l'est pas, la promesse s'inverse et le
produit fait perdre du temps. Voir §7.

## 3. Ce que le code fait déjà pour ce MVP

Plus que je ne l'attendais. Le mécanisme central de la « proposition
interactive » existe déjà sous un autre nom — le devis public.

| Brique du MVP | Ce qui existe | Où |
| --- | --- | --- |
| Page privée, sans compte | Le jeton du lien fait foi, n'ouvre que ce devis | `quotes.ts`, `app/devis/[token]/` |
| Jour par jour | Programme reconstruit, journées libres nommées | `itinerary.ts` |
| Prix, inclus / exclus | Lignes figées à l'envoi, total, acompte | `quotes.ts`, `quote_lines` |
| Marque blanche | Couleur d'agence, en-tête, mentions | `agency.brand_colour`, `documents.ts` |
| Responsive | Toute l'interface | Tailwind, vérifié au smoke |
| Taux d'ouverture | `opened_at`, première ouverture seulement | `mail-store.ts`, écran conseiller |
| Passage à l'action | Accepter / décliner, nom + horodatage + IP | `decide-form.tsx`, `quotes.decide` |
| Envoi et relance | File d'envoi, statut, réponse serveur telle quelle | `mail.ts`, `mail-store.ts` |
| Médias stockés | Téléversement, visibilité par rôle, service sécurisé | `attachments.ts`, `app/(app)/pieces/` |
| Export PDF | Devis, formulaire standardisé, carnet | `pdf.ts`, `documents.ts` |

**Fait.** Environ la moitié de la « proposition interactive » est donc déjà
écrite, testée bout en bout, et respecte déjà la séparation conseiller /
voyageur.

**Recommandation.** Ne pas repartir de zéro. Le devis public *est* le
prototype de la proposition : il lui manque l'immersion et l'interaction, pas
la plomberie.

## 4. Ce qui manque, par impact × complexité

| Manque | Impact commercial | Complexité | Verdict |
| --- | --- | --- | --- |
| **Import + extraction** d'un programme (PDF, Word, e-mail, texte) | Décisif — c'est la promesse | Élevée, et incertaine | Le prototyper **en premier**, avant tout le reste |
| **Médias par étape** (photos, vidéos, cartes) | Fort — c'est l'immersion | Moyenne | Après l'import |
| **Commentaires par étape** | Fort — c'est le signal explicite | Faible | Rapide, à faire tôt |
| **Variantes** (2–3 options validées) | Fort sur le sur-mesure | Moyenne | Après les commentaires |
| **Options sélectionnables** par le client | Moyen | Moyenne | Avec les variantes |
| « **Demander un ajustement** » | Moyen | Faible | Avec les commentaires |
| **Notifications de relance** | Moyen | Faible | Une fois les signaux là |
| Mesure du **temps de préparation** | Fort pour *vendre le produit* | Faible | Instrumenter dès le pilote |

**Recommandation de séquence :** import → commentaires + demande d'ajustement →
médias → variantes et options → relances. L'import d'abord parce que c'est lui
qui est incertain : tout le reste est du développement connu, lui seul peut
faire échouer la promesse.

## 5. Ce qui sort du périmètre — et ce qu'on en fait

**Fait.** Le nouveau contexte exclut explicitement le moteur de réservation et
l'application de voyage complète. Cela met hors MVP :

- l'**application Android** (`mobile/`) — une app de voyage complète, dit le
  cadrage ;
- l'**espace voyageur post-vente** (`/mon-voyage`) — il sert après la vente,
  pas pendant ;
- la **facturation** : factures, acompte/solde, Factur-X, registre de TVA.

**Recommandation : ne rien supprimer.** Ces modules sont écrits, testés, et ne
coûtent rien à laisser dormir — ils ne sont sur le chemin de personne. Ils
redeviennent un avantage le jour où une agence pilote demande « et ensuite,
qu'est-ce qui se passe quand le client dit oui ? ». Répondre « la facture sort
conforme et la TVA sur marge est calculée » est un argument que personne
d'autre n'a.

**Hypothèse.** Ce qui était le différenciateur devient l'**argument de
deuxième rendez-vous**. On entre par la proposition, on retient par les
chiffres.

## 6. Les risques

**Le risque que vous nommez est le bon**, et il se joue entièrement sur
l'import : un outil esthétique mais long à utiliser. Deux autres, moins
visibles :

**L'extraction par IA suppose ce que cet environnement n'a pas.** Pas de réseau
sortant vers un fournisseur de modèle, et `CLAUDE.md` interdit tout test qui
suppose un appel réel. Ce n'est pas qu'un détail de développement : en
production, cela veut dire envoyer le programme d'une agence — donc des données
de ses clients — chez un tiers. À trancher avant de promettre quoi que ce soit
en rendez-vous.

**Recommandation d'architecture, qui suit ce que le dépôt fait déjà** :
séparer le *parseur* (pur, testé sur des programmes enregistrés) du
*fournisseur d'extraction* (l'appel réseau), exactement comme `src/lib/api/`
sépare déjà URLs + parseurs de `live.ts`. On peut alors développer et tester
l'import sans réseau, et brancher le modèle en un point unique.

**Le prix de vente reste un forfait global.** Une proposition sur-mesure
s'écrit « 2 480 € par personne, base 2 participants ». Sans prix par personne
ni variantes chiffrées, la page ne sait pas dire ce que le métier dit. C'est le
seul manque du modèle de prix qui devienne bloquant dans ce cadrage — les
autres (remises, frais de dossier, net/commissionnable) peuvent attendre.

## 7. Les tests à faire avant de développer

Dans cet ordre, et aucun ne demande d'écrire le produit.

1. **Le test de l'extraction, sur papier.** Récupérer dix programmes réels
   auprès de trois agences. Les extraire à la main en une heure chacun, puis
   mesurer : combien de champs (dates, hôtels, transports, activités) une
   machine pourrait-elle en tirer sans ambiguïté ? Si la réponse est « moins
   des deux tiers », la promesse « sans ressaisie » ne tient pas et il faut la
   reformuler avant de coder.
2. **Le test du temps, avant/après.** Chronométrer un conseiller qui prépare
   une proposition comme aujourd'hui. C'est la ligne de base sans laquelle
   « fait gagner du temps » n'est pas mesurable — et c'est votre premier
   indicateur.
3. **Le test de la page, sans l'outil.** Prendre un devis réel, en faire une
   proposition interactive **à la main** (une page, deux heures), l'envoyer à
   un vrai prospect de l'agence, observer. C'est le test le moins cher du cœur
   de la thèse : est-ce que ça change la conversation ?
4. **Le test du signal.** Sur cette page manuelle, mettre un champ de
   commentaire par journée. Compter combien de clients écrivent quelque chose.
   Si personne ne commente, l'interaction n'est pas le bon levier et il faut
   regarder ailleurs — l'immersion seule, ou la variante chiffrée.
5. **Le test du portefeuille.** Demander à trois agences pilotes de payer
   avant que le produit soit complet. Une agence qui dit « très intéressant »
   sans sortir sa carte a répondu non.

Le dépôt permet déjà de faire les tests 3 et 4 **sans écrire une ligne** : un
devis public avec ses lignes, son programme, sa couleur d'agence et sa page
d'acceptation existe et fonctionne. C'est le prototype le moins cher
disponible.
