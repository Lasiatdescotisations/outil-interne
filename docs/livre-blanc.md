# Livre blanc — Calcul des indemnités de rupture

Ce document explique comment l'outil calcule une indemnité de rupture, pourquoi on peut s'y fier et où s'arrêtent ses limites. Il se lit à deux niveaux : le texte courant suffit pour comprendre et utiliser l'outil ; les paragraphes **Pour aller plus loin** donnent les règles, les articles et les formules à ceux qui veulent vérifier le détail.

## 1. L'essentiel en deux minutes

L'outil calcule l'indemnité due à un salarié dont le contrat prend fin (rupture conventionnelle, licenciement, inaptitude, mise ou départ à la retraite). Il compare deux montants, le minimum prévu par le Code du travail et le barème de la convention collective, retient le plus favorable au salarié, puis en déduit les conséquences sociales et fiscales.

Quatre idées guident l'ensemble :

1. **Rien n'est opaque.** Chaque fiche montre la formule, les mois retenus et le calcul ligne par ligne : on peut le refaire à la main.
2. **Rien n'est deviné.** Quand le barème d'une convention n'a pas été relevé, l'outil applique le minimum légal et le dit.
3. **L'humain décide.** L'outil prépare, compare et alerte ; une convention n'est « validée » que lorsqu'une personne l'a cochée.
4. **L'outil explique.** Il s'adresse aussi bien à qui découvre le sujet qu'à qui connaît déjà les textes : chaque résultat dit d'où il vient, chaque notion est définie, et le détail technique reste à portée de clic sans encombrer l'essentiel. Cette philosophie vaut pour l'ensemble de l'outil, pas seulement pour ce livre blanc.

À ce jour : 71 conventions collectives, tous les motifs de rupture courants, un calendrier de procédure pour chaque motif, le régime social et fiscal, le contrat de sécurisation professionnelle (CSP), des exports PDF et image, et 140 tests automatiques.

## 2. Les notions de base

Avant de calculer, il faut s'entendre sur quelques mots. Ils reviennent partout dans l'outil.

| Notion | Ce qu'elle veut dire |
| --- | --- |
| Ancienneté | Durée de présence dans l'entreprise, comptée en mois. Certaines absences (maladie longue, congé sans solde…) se déduisent ou non, selon la loi ou la convention. |
| Salaire de référence | Le salaire mensuel qui sert de base au calcul. Souvent le plus favorable entre la moyenne des 12 derniers mois et celle des 3 derniers. |
| Indemnité légale | Le minimum fixé par le Code du travail pour un licenciement. |
| Indemnité conventionnelle | Le barème de la convention collective, quand il existe. |
| IDCC | Le numéro d'identification d'une convention collective (par exemple 1486 pour Syntec). |
| Supra-légale | La part versée en plus du minimum, par exemple négociée en rupture conventionnelle. |
| PASS | Plafond annuel de la sécurité sociale, utilisé pour les seuils d'exonération. 48 060 € en 2026. |
| CSP | Contrat de sécurisation professionnelle, proposé en cas de licenciement économique. |

**Pour aller plus loin.** L'indemnité légale de licenciement est de 1/4 de mois de salaire par année d'ancienneté jusqu'à 10 ans, puis 1/3 de mois au-delà, avec une condition de 8 mois d'ancienneté. En rupture conventionnelle, l'indemnité ne peut pas être inférieure à cette indemnité légale (L1237-13). Quand une convention prévoit mieux, le plus favorable s'applique.

## 3. Pourquoi un outil : un calcul court, des pièges nombreux

Le calcul tient en quelques opérations, mais chacune cache un choix qui change le montant : quelle ancienneté retenir, quelles absences déduire, quelle assiette de salaire, lequel de deux barèmes appliquer.

Les erreurs coûtent des deux côtés : un salarié sous-payé réclame la différence, un employeur qui verse trop supporte une contribution patronale sur une somme qu'il ne devait pas. Les conventions collectives aggravent le problème : des centaines de textes, des rédactions qui varient (seuils, plafonds, majorations liées à l'âge, catégories), et des synthèses publiques parfois contradictoires.

**Des textes nombreux, complexes et parfois ambigus.** La France compte des centaines de conventions collectives, rédigées à des époques différentes, modifiées par avenants, et d'une précision très inégale. Une formule peut se lire de deux façons (« 1/3 de mois par année » sur toutes les années ou seulement au-delà d'un seuil ? « plus de 55 ans » ou « 55 ans révolus » ? salaire du dernier mois ou moyenne ?). Les synthèses publiques, voire les simulateurs officiels, ne retiennent pas toujours la même lecture que le texte.

Il en résulte une réalité qu'il vaut mieux dire franchement : **dans certains cas, il n'existe pas de réponse tranchée évidente.** L'auteur de l'outil, qui a l'habitude de ces textes, s'est lui-même souvent interrogé en les relisant. Plutôt que de masquer le doute, l'outil retient une lecture explicite, la signale dans les « points ambigus » de la fiche, et laisse la décision à l'utilisateur.

Le besoin est donc double : un outil rapide, et surtout **explicable et contrôlable**.

## 4. Comment l'outil raisonne, pas à pas

Chaque fiche suit la même démarche, que l'on peut suivre à l'écran.

1. **Choisir le motif et la convention.** La convention se recherche par nom, mot-clé ou numéro IDCC.
2. **Calculer l'ancienneté.** À partir des dates d'entrée et de sortie, en retirant les absences qui ne comptent pas.
3. **Déterminer le salaire de référence.** Saisie mois par mois (ou import de la fiche de paie), puis choix de l'assiette la plus favorable.
4. **Calculer les deux montants.** Légal d'un côté, conventionnel de l'autre, avec le détail de la formule.
5. **Retenir le plus favorable**, puis arrondir selon la règle du motif et ajouter une éventuelle part supra-légale.
6. **Déduire les conséquences.** Contribution patronale, part exonérée ou soumise, coût du CSP, calendrier de la procédure.

**Pour aller plus loin.** Le salaire de référence est, selon la convention, la moyenne sur 12 mois, sur 3 mois, le dernier salaire, ou le plus favorable de ces lectures ; la fiche affiche celle qui s'applique. L'arrondi par défaut est la dizaine supérieure en rupture conventionnelle et l'euro supérieur en licenciement ; il reste modifiable. Quand les sources divergent, l'outil le signale dans les points d'attention : par exemple, pour la convention des experts-comptables (IDCC 0787), les sources parlent du dernier salaire mensuel, et la lecture retenue est la plus favorable parmi les trois assiettes.

## 5. Les motifs de rupture

Chaque motif a ses règles propres, que l'outil applique automatiquement.

| Motif | Ce qu'il faut retenir |
| --- | --- |
| Rupture conventionnelle | Indemnité au moins égale à l'indemnité légale de licenciement ; délai de rétractation puis homologation ; contribution patronale de 40 % sur la part exonérée de cotisations. |
| Licenciement pour motif personnel | Indemnité légale ou conventionnelle, hors faute grave ou lourde. |
| Licenciement pour motif économique | Motif à part entière dans l'outil, avec son calendrier et son indicateur : même indemnité de base, plus les règles propres de certaines conventions (majorations) et le CSP avec son délai de réflexion de 21 jours. |
| Inaptitude | Pas de préavis exécuté ; l'indemnité est doublée en cas d'origine professionnelle. |
| Mise à la retraite | À l'initiative de l'employeur ; indemnité de licenciement ou indemnité propre à la convention si plus favorable. |
| Départ volontaire à la retraite | Indemnité de départ, souvent proche du barème légal ; imposable et soumise aux cotisations dès le premier euro. |

## 6. Les calendriers de procédure

Chaque motif a ses délais, et une erreur de date peut rendre la procédure irrégulière. L'outil calcule la date **au plus tôt** de chaque étape, jours fériés compris, avec une option pour l'Alsace-Moselle.

Trois façons de compter, à ne pas confondre :

- **jours calendaires** : tous les jours, dimanches et fériés compris ;
- **jours ouvrables** : du lundi au samedi, hors fériés ;
- **jours ouvrés** : du lundi au vendredi, hors fériés.

| Motif | Principales étapes calculées |
| --- | --- |
| Rupture conventionnelle | Rétractation de 15 jours calendaires, instruction de 15 jours ouvrables, rupture au plus tôt le lendemain de l'homologation. |
| Licenciement | Entretien au moins 5 jours ouvrables après la convocation, lettre au moins 2 jours ouvrables après l'entretien, puis préavis. |
| Licenciement économique | Lettre au moins 7 jours ouvrables après l'entretien (15 pour un cadre), CSP : 21 jours de réflexion. |
| Inaptitude | Reprise du salaire un mois après l'avis, rupture à la notification de la lettre. |
| Retraite | Interrogation écrite 3 mois avant l'anniversaire pour une mise à la retraite avant 70 ans, puis préavis. |

**Pour aller plus loin.** Articles de référence : L1232-2 et L1232-6 (entretien et notification), L1233-15 et L1233-67 (économique et CSP), L1226-4 et L1226-11 (inaptitude), L1237-5 (mise à la retraite), L1237-13 et L1237-14 (rupture conventionnelle). Un délai qui expire un samedi, un dimanche ou un jour férié est prorogé au premier jour ouvrable suivant (R1231-1). Le préavis, exprimé en mois, commence à la première présentation de la lettre et se termine la veille de la date anniversaire.

## 7. Le régime social et fiscal

Une fois l'indemnité calculée, la question suivante est : que doit-on payer dessus ? L'outil répond pour les indemnités légales, conventionnelles et supra-légales.

- Les indemnités de **licenciement** sont en grande partie exonérées d'impôt et de cotisations, dans des limites liées au plafond de la sécurité sociale.
- En **rupture conventionnelle** et **mise à la retraite**, l'employeur verse en plus une contribution patronale de 40 % sur la part exonérée de cotisations.
- Le **départ volontaire** à la retraite est imposable et soumis aux cotisations dès le premier euro.
- Au-delà de 10 plafonds annuels, tout est soumis dès le premier euro.

**Pour aller plus loin.** Pour un licenciement, la part exonérée d'impôt est le plus élevé entre l'indemnité légale ou conventionnelle et le plus petit de deux plafonds : le maximum entre 2 fois la rémunération de l'année précédente et la moitié de l'indemnité totale, d'une part, 6 PASS d'autre part. La part exonérée de cotisations est limitée à 2 PASS. La CSG et la CRDS (9,7 %) portent sur la fraction qui dépasse l'indemnité légale ou conventionnelle. La contribution patronale est de 40 % (fin de contrat à compter du 1er janvier 2026). Non calculés : cotisations salariales, montant de l'impôt du foyer, PSE, mandataires sociaux, indemnités transactionnelles.

## 8. Les conventions collectives

La couverture progresse par vagues. Elle suit le nombre d'établissements : les 70 conventions les plus répandues (rangs établis sur les déclarations sociales de juillet 2026), plus le caoutchouc.

| Niveau | Nombre | Signification |
| --- | --- | --- |
| Barème modélisé | 20 | Texte relu, barème complet, recoupé quand c'est possible. |
| Partiel | 35 | Un motif ou une catégorie modélisés, le reste au minimum légal. |
| Légal appliqué | 16 | Barème non relevé : seul le minimum légal est calculé, avec une alerte. |

Pour chaque convention et chaque motif, un **indicateur** résume la situation : légal toujours plus favorable, conventionnel égal au légal, conventionnel toujours supérieur ou égal, ou cas par cas (selon l'ancienneté, l'âge, la catégorie ou le salaire). Il indique aussi à partir de quelle ancienneté le conventionnel l'emporte.

**Pour aller plus loin.** L'indicateur est établi en balayant une grille de cas (ancienneté de 9 mois à 40 ans, âges de 40, 57 et 63 ans, chaque catégorie, assiettes sur 12 et 3 mois, avec et sans motif économique) et en comparant les deux montants à 1 centime près. Il ne couvre pas les situations atypiques. Il se régénère à chaque construction de l'outil.

## 9. Comment la fiabilité est assurée

Cinq contrôles se complètent, du texte de la convention jusqu'à la décision humaine.

1. **Sources hiérarchisées.** Chaque règle renvoie à un article de Légifrance quand il existe. Les synthèses secondaires sont signalées et classées par niveau de fiabilité.
2. **Recoupement avec le simulateur officiel** du Code du travail numérique, sur une grille de cas, quand il couvre la convention. Chaque écart est analysé : le texte de la convention l'emporte, et un écart assumé est documenté.
3. **Tests automatiques.** 140 cas calculés à la main : 104 montants, 17 calendriers, 4 âge, 8 régime social et fiscal, 7 CSP.
4. **Veille des textes.** Un script compare les articles suivis à une photographie de référence de la base ouverte des conventions (KALI) et signale tout article modifié ou disparu, avec un brouillon de fiche à relire. Il ne modifie jamais le moteur.
5. **Validation humaine.** Une case « validée par moi » par convention ; tant qu'elle n'est pas cochée, la fiche reste marquée provisoire.

## 10. Utiliser l'outil

- **Une fiche par salarié**, enregistrée dans le navigateur. L'export (fichier .json, Excel, PDF ou image) permet de la conserver ou de la partager.
- **Les exports** (PDF ou image) se composent à la carte : blocs à afficher, version « client » ou complète, design de l'outil ou version neutre imprimable en noir et blanc, notes libres.
- **Les paramètres** règlent la couleur, le nom de l'auteur du calcul, les honoraires par défaut et le taux de charges du CSP.
- **Les données restent locales.** L'outil tient dans une page web qui fonctionne sans serveur : aucune donnée de salarié n'est envoyée.

## 11. Limites assumées

L'outil est une aide au calcul, pas une consultation juridique. Ses limites sont affichées plutôt que cachées.

- La couverture des conventions est inégale : 16 sur 71 sont au minimum légal, et la retraite conventionnelle reste à relever pour beaucoup.
- Le classement par nombre d'établissements est indicatif ; les rangs 26 à 60 de la source sont déduits de tableaux sectoriels.
- Certains textes n'existent ni dans la base ouverte ni dans le simulateur officiel : il faut les relever sur Légifrance.
- Les calendriers donnent des dates au plus tôt ; les délais conventionnels plus longs, les salariés protégés, le PSE et le congé de reclassement ne sont pas traités.
- L'indicateur légal / conventionnel porte sur des cas types.

## 12. Feuille de route

L'ordre suit les besoins, sans date fixée.

1. Relire sur Légifrance les textes manquants (le travail est engagé par vagues sur Légifrance : rangs 21 à 32 et 36 à 50 faits ; restent les rangs 52 à 70).
2. Compléter la retraite conventionnelle (départ et mise à la retraite).
3. Valider le régime social et fiscal sur les textes de référence (BOSS) et l'ajouter à l'export Excel.
4. Figer la veille : reconstruire la référence des textes après validation humaine, puis contrôler périodiquement.
5. Étendre la procédure (salariés protégés, PSE, congé de reclassement) si le besoin se présente.

Chaque nouvelle convention suit le même cycle : lecture du texte, modélisation, recoupement quand il existe, tests, fiche de règles, validation.

## 13. À propos de l'auteur et de la conception

**L'auteur** est gestionnaire de paie senior : dix ans de métier, dont huit en cabinet. L'outil est né de questions rencontrées sur le terrain (quelle ancienneté retenir, quelle convention appliquer, quel montant justifier) et de fiches de calcul réellement utilisées. Il garde ce regard de praticien : il vise ce qui sert au quotidien, sans prétendre remplacer l'avis d'un juriste.

**La conception technique** : l'application est codée avec l'assistance de Claude Sonnet (modèle d'Anthropic), actuellement Claude Sonnet 5.5. Si un autre modèle intervient lors de développements futurs, il sera indiqué ici et dans l'historique des mises à jour. L'auteur oriente, relit et tranche ; les calculs sont vérifiés par des tests automatiques et, quand c'est possible, par recoupement avec le simulateur officiel.

**Une démarche éducative.** L'outil est pensé pour un public large, du débutant au confirmé. Cette ambition guide l'ensemble des écrans : vocabulaire expliqué, calcul décomposé, sources citées et limites affichées.

**Un projet ouvert, par volonté de l'auteur.** L'outil est conçu comme un projet open source : son code est lisible et vérifiable, ce qui permet à chacun de contrôler les calculs, de signaler une erreur ou de proposer une correction. Le code est publié dans un [dépôt GitHub public](https://github.com/Lasiatdescotisations/outil-interne), sous licence GNU AGPL v3 : chacun peut l'utiliser, l'étudier, le modifier et le redistribuer, à condition que les versions modifiées restent sous la même licence et que leur code reste accessible. Ouvrir le code est cohérent avec la démarche du livre blanc : des règles qu'on peut lire, discuter et améliorer collectivement.

**Un soutien possible, jamais obligatoire.** L'outil reste gratuit et identique pour tous. Ceux qui le souhaitent peuvent le soutenir sur [la page de soutien](https://fr.tipeee.com/calcul-indemnites/) : les contributions servent à relire les textes conventionnels, à ajouter des conventions et à couvrir les frais de fonctionnement.

**Un retour d'expérience est le bienvenu.** Une lecture contestable, une convention mal modélisée ou un cas non couvert : ces retours alimentent la feuille de route. Le formulaire « Contacter l'auteur » de l'onglet Paramètres envoie un message privé, que l'utilisateur peut accompagner de la fiche calculée, anonymisée : il choisit les éléments joints (le nom et le prénom du salarié sont réduits à leurs initiales) et voit un aperçu avant l'envoi. Un lien permet aussi d'ouvrir un signalement public sur le dépôt GitHub.

## 14. Sources et liens utiles

Les articles du Code du travail cités dans ce livre blanc sont cliquables et renvoient au texte sur le Code du travail numérique. Quelques ressources pour aller plus loin :

- [Code du travail numérique](https://code.travail.gouv.fr/) : le Code du travail, les fiches pratiques du ministère et des simulateurs (licenciement, rupture conventionnelle, retraite).
- [Simulateurs du Code du travail numérique](https://code.travail.gouv.fr/outils) : utiles pour recouper un résultat.
- [Rupture conventionnelle (service-public.fr)](https://www.service-public.gouv.fr/particuliers/vosdroits/F11251) : la procédure vue par l'administration.
- [TéléRC](https://www.telerc.travail.gouv.fr/) : le service de saisie en ligne de la demande d'homologation.
- [BOSS](https://boss.gouv.fr/) : le bulletin officiel de la sécurité sociale, référence pour les cotisations et la contribution patronale.
- [Base KALI en open data](https://www.data.gouv.fr/datasets/kali-conventions-collectives-nationales) : le texte des conventions collectives, mis à jour par la DILA.
- [API Légifrance (PISTE)](https://www.data.gouv.fr/dataservices/legifrance/) : accès programmable aux textes officiels, gratuit après inscription.
