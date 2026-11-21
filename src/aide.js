/* Bulles d'aide de la fiche : [sélecteur du champ ou 'h:N' (titre de l'encadré N), texte] */
const AIDE = [
 ['h:1',"Identifiez le salarié et la convention collective : c'est elle, avec le motif, qui fixe le barème applicable."],
 ['#ccn-q',"La convention collective applicable figure en général sur le bulletin de paie (numéro IDCC à 4 chiffres, par exemple 1486 pour Syntec). Elle peut prévoir une indemnité supérieure au minimum légal. Si elle n'est pas connue, choisissez « Code du travail seul » : l'outil calcule alors uniquement le minimum légal."],
 ['#classif',"Niveau, coefficient ou échelon indiqué sur le bulletin de paie. Information de dossier, utile pour retrouver la catégorie quand la convention en distingue."],
 ['#statut',"Ouvrier, employé, agent de maîtrise ou cadre. Certaines conventions prévoient des barèmes différents selon la catégorie."],
 ['#categorie',"Catégorie prévue par la convention choisie. Elle change le barème : à relever sur le contrat ou le bulletin de paie."],
 ['#motif',"Le motif décide des règles : la rupture conventionnelle garantit au moins l'indemnité légale de licenciement ; l'inaptitude d'origine professionnelle double l'indemnité légale ; la retraite (départ ou mise à la retraite) a ses propres barèmes. Le licenciement pour motif économique (difficultés, mutation technologique, réorganisation…) est un motif à part : certaines conventions y prévoient des majorations ou un autre barème, et le CSP peut être proposé."],
 ['#naissance',"Sert à calculer l'âge, qui joue dans certaines conventions (majorations à partir de 50 ou 55 ans, retraite) et dans le régime social et fiscal."],
 ['#ageRef',"Date à laquelle l'âge est apprécié. Par défaut la fin de contrat ; certaines conventions retiennent plutôt la notification ou la signature : voir la fiche de la convention."],
 ['#age',"À remplir seulement si la date de naissance est inconnue : elle est ignorée dès qu'une date de naissance est saisie."],
 ['h:2',"L'ancienneté se compte entre l'entrée et la sortie, moins les absences qui ne comptent pas (étape suivante)."],
 ['#entree',"Date d'entrée dans l'entreprise, point de départ de l'ancienneté. En cas d'ancienneté reprise (par exemple après un transfert de contrat), saisissez la date d'ancienneté conservée."],
 ['#sortie',"Date de fin du contrat de travail. Elle sert à calculer l'ancienneté et à apprécier certains seuils (âge, taux de contribution patronale)."],
 ['#dateRef',"Date de signature de la convention (rupture conventionnelle) ou de notification (licenciement). Les 12 mois de rémunération pris en compte sont ceux qui précèdent cette date."],
 ['h:3',"Certaines absences (maladie longue, congé sans solde…) ne comptent pas dans l'ancienneté, selon la loi ou la convention. Ajoutez celles qui ont eu lieu : l'outil indique si elles sont déduites."],
 ['h:4',"Saisissez le brut mensuel des 12 derniers mois. L'outil retient la moyenne la plus favorable (12 mois ou 3 derniers mois), sauf règle propre à la convention. La colonne « Reconstitué » sert à rétablir un mois réduit par une absence indemnisée ; la case « Moy. » permet d'exclure un mois."],
 ['h:5',"Montants négociés ou facturés en plus de l'indemnité calculée, et réglages du total."],
 ['#supra',"Somme négociée en plus du minimum (légal ou conventionnel), typiquement en rupture conventionnelle. Elle s'ajoute à l'indemnité retenue."],
 ['#taux',"Contribution patronale sur les indemnités de rupture conventionnelle et de mise à la retraite : 40 % pour une fin de contrat à compter du 01/01/2026. Laissez « auto » pour que l'outil applique le taux en vigueur."],
 ['#honoraires',"Honoraires du dossier. Le montant proposé dépend du motif et se règle dans Paramètres. Sans effet sur l'indemnité."],
 ['#arrondi',"Règle d'arrondi de l'indemnité retenue. Par défaut : dizaine d'euros supérieure en rupture conventionnelle, euro supérieur sinon."],
 ['#remCcn',"Commentaire libre sur la convention, utile pour expliquer un choix de lecture."],
 ['#csp',"Dispositif proposé au salarié licencié pour motif économique. S'il l'accepte, le contrat prend fin sans préavis et l'employeur verse à France Travail l'équivalent de l'indemnité de préavis, avec les charges."],
 ['#preavisMois',"Durée du préavis que le salarié aurait effectué (légal ou conventionnel). Laissez vide pour appliquer le minimum légal."],
 ['#preavisBase',"Salaire qui sert à valoriser le préavis non effectué : dernier salaire mensuel, ou salaire de référence."],
 ['#cspTaux',"Taux de charges (patronales et salariales) ajouté pour estimer la contribution « chargée ». Valeur par défaut réglable dans Paramètres."],
 ['#cspMontant',"Si votre logiciel de paie a déjà calculé le montant chargé, saisissez-le : il remplace l'estimation."],
 ['#remN1',"Rémunération brute totale de l'année civile précédant la rupture. Elle sert au seuil d'exonération « 2 fois la rémunération annuelle » du régime social et fiscal."],
 ['#droitRetraite',"À cocher si le salarié peut déjà prétendre à une pension de retraite : l'indemnité de rupture conventionnelle est alors imposable en totalité (le régime social ne change pas)."],
 ['#remAbs',"Commentaire libre sur le traitement des absences, utile pour expliquer un choix de lecture."],
 ['#auteur',"Nom ou initiales de la personne qui établit le calcul. Prérempli depuis Paramètres ; peut être affiché ou masqué à l'export."],
 ['#notes',"Hypothèses retenues, échanges, points à vérifier. Enregistré avec la fiche."]
];
function initAide(){
  AIDE.forEach(([sel,txt])=>{
    let anchor, after;
    if(sel.startsWith('h:')){ const hs=[...document.querySelectorAll('#v-fiche h2')].filter(h=>h.querySelector('.n')&&h.querySelector('.n').textContent===sel.slice(2)); anchor=hs[0]; after=anchor; }
    else { const el=document.querySelector(sel); if(!el) return; const box=el.closest('.f,.chk')||el.parentElement; anchor=box.querySelector(':scope > span'); after=anchor; }
    if(!anchor) return;
    const b=document.createElement('button'); b.type='button'; b.className='qh'; b.textContent='?'; b.setAttribute('aria-label','Aide'); b.setAttribute('aria-expanded','false');
    const pop=document.createElement('div'); pop.className='qh-pop'; pop.hidden=true; pop.textContent=txt;
    anchor.appendChild(b); after.parentNode.insertBefore(pop,after.nextSibling);
    b.addEventListener('click',e=>{ e.preventDefault(); e.stopPropagation(); pop.hidden=!pop.hidden; b.setAttribute('aria-expanded',String(!pop.hidden)); });
  });
}
function applyAide(){ document.body.classList.toggle('no-aide', PARAMS.aide===false); }
