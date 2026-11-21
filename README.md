# Calcul d'indemnités de rupture — libre et pédagogique

Un outil gratuit et libre pour **calculer, et surtout comprendre**, les indemnités de rupture du contrat de travail selon la loi et les conventions collectives.

**Essayer l'outil : <https://lasiatdescotisations.github.io/outil-interne/>**

## Ce que fait l'outil

- Motifs : rupture conventionnelle, licenciement pour motif personnel, licenciement pour motif économique (avec CSP), inaptitude, mise à la retraite, départ volontaire à la retraite.
- Compare le minimum légal et le barème de la convention collective, retient le plus favorable, puis déduit les conséquences sociales et fiscales (contribution patronale, parts exonérées ou soumises).
- Près de 90 conventions collectives parmi les plus répandues, relues pour la plupart sur Légifrance (les dernières ajoutées sont signalées « non vérifiées »), à des niveaux de couverture variables (barème complet, partiel, ou minimum légal appliqué avec une alerte). Le détail par convention est dans l'onglet Règles de l'outil.
- Calendriers de procédure au plus tôt pour chaque motif.
- Exports au choix : PDF, image, texte à coller dans un mail, Excel ou fichier de sauvegarde.
- Messagerie privée « Contacter l'auteur » (optionnelle).

Les données de la fiche restent dans le navigateur : l'outil fonctionne sans serveur. Seul un message volontairement envoyé via « Contacter l'auteur » quitte la page.

## Principes

1. **Rien n'est opaque** : chaque résultat montre la formule et les mois retenus.
2. **Rien n'est deviné** : un barème non relevé donne le minimum légal, et l'outil le dit.
3. **L'humain décide** : une convention n'est « validée » que lorsqu'une personne l'a cochée.
4. **L'outil explique** : pour les juniors comme pour les confirmés.

Le livre blanc complet est dans [`docs/livre-blanc.md`](docs/livre-blanc.md) et dans l'onglet Paramètres de l'outil.

> **Avertissement.** Les résultats sont indicatifs. Cet outil est une aide au calcul, pas une consultation juridique. Les textes (lois, conventions collectives) sont nombreux, complexes et parfois ambigus : en cas de doute, consultez le texte officiel ou un professionnel du droit social.

## Organisation du dépôt

| Chemin | Contenu |
| --- | --- |
| `index.html` | L'outil complet, en un seul fichier (généré à partir de `src/`). |
| `src/` | Les sources : moteur de calcul (`engine.js`), tests (`tests.js`, `run-tests.js`), exports, aide, modèle de page (`template.html`), script de construction (`build.py`). |
| `docs/` | Livre blanc, méthode de recoupement, règles Firestore de la messagerie. |
| `LICENSE` | Licence GNU AGPL v3. |

## Construire et tester

Prérequis : Node.js et Python 3.

```bash
cd src
npm install        # dépendances d'export (jspdf, xlsx)
node run-tests.js  # tests automatiques des montants, calendriers, régime social et fiscal, CSP
python3 build.py   # génère src/index.html
```

Copiez ensuite `src/index.html` à la racine du dépôt pour le publier (GitHub Pages).

## Contribuer

Les retours sont les bienvenus : une lecture contestable d'un texte, une convention mal modélisée, un cas non couvert.

- Ouvrir une *issue* sur ce dépôt. **N'y indiquez aucune donnée personnelle** (nom, salaire ou dates d'un salarié réel).
- Proposer une correction par *pull request*, avec si possible le texte source (article de la convention ou du Code du travail) et un cas de test.
- Ou utiliser le formulaire « Contacter l'auteur » de l'onglet Paramètres.

Chaque convention suit le même cycle : lecture du texte, modélisation, recoupement quand il existe, tests, fiche de règles, validation humaine.

## Messagerie (facultatif)

La messagerie utilise Firebase (Authentication et Firestore). La configuration web présente dans le code est publique par conception : la sécurité repose sur les règles Firestore, données dans [`docs/firestore.rules`](docs/firestore.rules). Pour réutiliser l'outil avec votre propre projet Firebase, remplacez la configuration dans `src/retours.js`. Sans configuration, la messagerie est désactivée.

## Soutenir le projet

Le soutien est volontaire et ne donne accès à aucune fonction supplémentaire : <https://fr.tipeee.com/calcul-indemnites/>

## Licence

Ce projet est publié sous licence **GNU Affero General Public License v3.0 ou ultérieure** (AGPL-3.0-or-later). Vous pouvez utiliser, étudier, modifier et redistribuer l'outil ; toute version modifiée, y compris proposée comme service en ligne, doit rester sous la même licence et en rendre le code source accessible. Voir le fichier [`LICENSE`](LICENSE).

© 2026 — l'auteur de l'outil (gestionnaire de paie senior). Développé avec l'assistance de Claude (Anthropic).
