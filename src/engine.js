/* ===== Moteur de calcul — indemnités de rupture (V2, d'après les fiches du cabinet) =====
   Règles = données + petites fonctions pures. Montants bruts. */

const MOTIFS = {
  rc:        'Rupture conventionnelle',
  lic:       'Licenciement (motif personnel, hors faute grave ou lourde)',
  licEco:    'Licenciement pour motif économique',
  inaptNP:   'Inaptitude — origine non professionnelle',
  inaptP:    'Inaptitude — origine professionnelle (AT/MP)',
  miseRet:   'Mise à la retraite (initiative de l\'employeur)',
  departRet: 'Départ volontaire à la retraite'
};

/* Traitement des absences dans l'ancienneté (Code du travail, d'après justice.fr).
   t : 'compte' · 'moitie' · 'exclu'. Une convention peut surcharger avec
   { t:'plafond', max:<jours>, groupe:<nom> } = retenue dans la limite de max jours cumulés. */
const ABS_TYPES = [
  { id:'cp',          label:'Congés payés',                                  t:'compte' },
  { id:'mat',         label:'Maternité / paternité / adoption',              t:'compte' },
  { id:'atmp',        label:'Accident du travail / maladie professionnelle', t:'compte' },
  { id:'parental_tp', label:'Congé parental à temps partiel',                t:'compte' },
  { id:'preavis_emp', label:'Préavis non effectué à la demande de l\'employeur', t:'compte' },
  { id:'parental',    label:'Congé parental à temps plein',                  t:'moitie' },
  { id:'maladie',     label:'Maladie non professionnelle',                   t:'exclu' },
  { id:'trajet',      label:'Accident de trajet',                            t:'exclu' },
  { id:'sans_solde',  label:'Congé sans solde',                              t:'exclu' },
  { id:'sabbatique',  label:'Congé sabbatique',                              t:'exclu' },
  { id:'creation',    label:'Congé création / reprise d\'entreprise',        t:'exclu' },
  { id:'activite_partielle', label:'Activité partielle',                     t:'exclu', incertain:true },
  { id:'greve',       label:'Grève',                                         t:'exclu' },
  { id:'mise_a_pied', label:'Mise à pied disciplinaire',                     t:'exclu' },
  { id:'preavis_sal', label:'Préavis non effectué à la demande du salarié',  t:'exclu' }
];
const ABS_BY_ID = Object.fromEntries(ABS_TYPES.map(a => [a.id, a]));

/* ---------- utilitaires ---------- */
function parseISO(s){ if(!s) return null; const p=String(s).split('-').map(Number); if(p.length!==3||!p[0]) return null; return new Date(Date.UTC(p[0],p[1]-1,p[2])); }
function toISO(d){ return d.toISOString().slice(0,10); }
function addDays(d,n){ return new Date(d.getTime()+n*86400000); }
function monthsBetween(s,e){
  let m=(e.getUTCFullYear()-s.getUTCFullYear())*12+(e.getUTCMonth()-s.getUTCMonth());
  if(e.getUTCDate()<s.getUTCDate()) m--;
  return m;
}
const r2 = x => Math.round((x+Number.EPSILON)*100)/100;
const fmtMois = x => (Math.round(x*10000)/10000).toLocaleString('fr-FR',{maximumFractionDigits:4});
const fmtEur = x => x.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const fmtAnc = m => { const y=Math.floor(m/12), r=m%12; return (y?y+' an'+(y>1?'s':''):'')+(y&&r?' ':'')+(r||!y?r+' mois':''); };
const yf = m => { const y=Math.floor(m/12), r=m%12; return r? `(${y}+${r}/12)` : `${y}`; };   // écriture « à la main » des fiches

function tranche(m, seuilMois, r1, r2){
  const a=Math.min(m,seuilMois)/12, b=Math.max(m-seuilMois,0)/12;
  return { a, b, mois: a*r1 + b*r2 };
}
const legalMois = m => tranche(m,120,1/4,1/3).mois;                 // R1234-2
const legalExpr = m => m<=120 ? `${yf(m)}/4` : `10/4+${yf(m-120)}/3`;
const departLegalMois = m => { const y=Math.floor(m/12); return y>=30?2:y>=20?1.5:y>=15?1:y>=10?0.5:0; }; // D1237-1

/* Arrondis observés dans les fiches : RC → dizaine supérieure, licenciement → euro supérieur. */
function arrondir(x, mode){
  if(mode==='dizaine') return Math.ceil(x/10-1e-9)*10;
  if(mode==='euro')    return Math.ceil(x-1e-9);
  return r2(x);
}

/* Salaire de référence depuis le tableau des 12 mois (Brut + Reconstitué). */
/* ---------- Licenciement économique : contrat de sécurisation professionnelle (CSP) ----------
   Salarié d'au moins 1 an d'ancienneté : l'employeur verse à France Travail l'indemnité de préavis que le salarié aurait perçue, dans la limite de 3 mois
   (charges patronales et salariales comprises) ; l'éventuel excédent est versé au salarié. Moins d'un an : indemnité de préavis due au salarié, aucune contribution. */
const preavisLegalMois = m => m>=24 ? 2 : m>=6 ? 1 : 0;   // L1234-1 : 1 mois de 6 mois à moins de 2 ans, 2 mois dès 2 ans
function calculCsp(p){
  const legal=preavisLegalMois(p.moisAnc), auto = p.preavisMois===null;
  const M = auto ? legal : p.preavisMois;
  const plus1an = p.moisAnc>=12;
  const icp = r2(M*p.salaire);
  const ft = plus1an ? r2(Math.min(M,3)*p.salaire) : 0;
  const salarie = plus1an ? r2(Math.max(0,M-3)*p.salaire) : icp;
  let ftCharge=null, mode=null;
  if(ft>0){
    if(p.montantCharge!==null){ ftCharge=r2(p.montantCharge); mode='paie'; }
    else if(p.tauxCharges!==null){ ftCharge=r2(ft*(1+p.tauxCharges/100)); mode='taux'; }
  }
  const alertes=[], lignes=[];
  lignes.push(`Préavis ${auto?'légal minimal':'retenu'} : ${fmtMois(M)} mois × ${fmtEur(p.salaire)} = ${fmtEur(icp)} d'indemnité de préavis équivalente (brut).`);
  if(plus1an) lignes.push(`Ancienneté de ${fmtAnc(p.moisAnc)} (au moins 1 an) : contribution à France Travail = ${fmtMois(Math.min(M,3))} mois, soit ${fmtEur(ft)} brut${M>3?` ; excédent de ${fmtMois(M-3)} mois (${fmtEur(salarie)}) versé au salarié`:''}.`);
  else lignes.push(`Ancienneté inférieure à 1 an : aucune contribution à France Travail ; l'indemnité de préavis (${fmtEur(icp)}) est versée au salarié.`);
  if(auto) alertes.push(`CSP : durée de préavis non renseignée, minimum légal retenu (${fmtMois(legal)} mois). Si la convention, le contrat ou les usages prévoient plus (souvent 3 mois pour les cadres), renseignez la durée.`);
  if(ft>0 && mode===null) alertes.push('CSP : contribution affichée en brut. France Travail appelle l\'indemnité de préavis charges patronales et salariales comprises : renseignez un taux de charges ou le montant chargé calculé par votre paie.');
  if(mode==='taux') alertes.push(`CSP : contribution chargée estimée au taux de ${p.tauxCharges} % ; à remplacer par le montant chargé calculé par votre logiciel de paie.`);
  alertes.push('CSP : le contrat est rompu le lendemain de l\'expiration du délai de réflexion de 21 jours, sans préavis : l\'ancienneté retenue s\'arrête à cette date (le préavis non exécuté n\'est pas compté). Date de fin de contrat à renseigner en conséquence.');
  alertes.push('CSP : la contribution est versée à France Travail (et non à l\'Urssaf), au plus tard le 25 du 2e mois civil suivant le début du CSP. L\'indemnité de licenciement et l\'indemnité compensatrice de congés payés (congés non pris) restent dues au salarié, au solde de tout compte. Pas de majoration de 10 % de congés payés sur le préavis équivalent : il n\'ouvre pas droit à congés payés.');
  return { moisAnc:p.moisAnc, plus1an, preavis:M, preavisLegal:legal, auto, salaire:p.salaire, icp, ft, ftCharge, mode, salarie, lignes, alertes };
}
function salaireDepuisMois(rows){
  const tot = rows.map(r => (+r.brut||0)+(+r.recon||0));
  const sel = tot.filter((_,i)=>rows[i].inclus!==false);
  const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
  /* Dernier salaire mensuel : dernier mois renseigné et pris en compte (utile aux conventions qui visent « le dernier salaire mensuel ») */
  let lastIdx=-1; for(let i=rows.length-1;i>=0;i--){ if(rows[i].inclus!==false && tot[i]>0){ lastIdx=i; break; } }
  return { sr12:avg(sel), sr3:avg(tot.slice(-3)), srLast: lastIdx>=0?tot[lastIdx]:0, lastIdx, n:sel.length, total:tot.reduce((x,y)=>x+y,0) };
}

/* Âge en années révolues à une date donnée (anniversaire atteint le jour même ; né un 29 février : le 1er mars en année non bissextile). */
function ageAt(naissanceISO, dateISO){
  const n=parseISO(naissanceISO), d=parseISO(dateISO); if(!n||!d) return null;
  let a=d.getUTCFullYear()-n.getUTCFullYear();
  if((d.getUTCMonth()+1)*100+d.getUTCDate() < (n.getUTCMonth()+1)*100+n.getUTCDate()) a--;
  return a;
}

/* ---------- jours fériés et calendrier de la rupture conventionnelle ---------- */
function paques(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
        h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
        mo=Math.floor((h+l-7*m+114)/31),j=((h+l-7*m+114)%31)+1;
  return new Date(Date.UTC(y,mo-1,j));
}
const _fer = {};
function feriesMap(y, am){ // jours fériés légaux (métropole) ; am : + Vendredi saint et 26 décembre (Alsace-Moselle)
  const k=y+(am?'a':'m'); if(_fer[k]) return _fer[k];
  const p=paques(y), o={}, put=(d,n)=>{ o[toISO(d)]=n; }, f=(m,d)=>new Date(Date.UTC(y,m-1,d));
  put(f(1,1),'Jour de l’an'); put(addDays(p,1),'Lundi de Pâques'); put(f(5,1),'Fête du Travail'); put(f(5,8),'Victoire 1945');
  put(addDays(p,39),'Ascension'); put(addDays(p,50),'Lundi de Pentecôte'); put(f(7,14),'Fête nationale'); put(f(8,15),'Assomption');
  put(f(11,1),'Toussaint'); put(f(11,11),'Armistice 1918'); put(f(12,25),'Noël');
  if(am){ put(addDays(p,-2),'Vendredi saint'); put(f(12,26),'Saint-Étienne (26 décembre)'); }
  return (_fer[k]=o);
}
const JOURS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const frDate = d => { const s=toISO(d).split('-'); return s[2]+'/'+s[1]+'/'+s[0]; };
const jourLong = d => JOURS[d.getUTCDay()]+' '+frDate(d);
const plurJ = (n,w) => n+' '+w+(n>1&&!/s$/.test(w)?'s':'');
function jours(am){
  const ferie = d => feriesMap(d.getUTCFullYear(),am)[toISO(d)] || null;
  return { ferie,
    ouvrable: d => d.getUTCDay()!==0 && !ferie(d),                              // lundi à samedi, hors fériés
    ouvre:    d => d.getUTCDay()>=1 && d.getUTCDay()<=5 && !ferie(d),           // lundi à vendredi, hors fériés
    proroge:  d => d.getUTCDay()===0 || d.getUTCDay()===6 || !!ferie(d) };      // délai prorogé (R1231-1)
}
const RC_DEFAUT = { mode:'sig', ent:'', dEnt:'0', d_ret:'', d_rup:'', sigOuvre:true, depOuvre:false, mDep:'0', post:'0', mRup:'0', am:false };
function rcOptions(c){
  c = Object.assign({}, RC_DEFAUT, c||{});
  return { mode:c.mode, sigOuvre:c.sigOuvre!==false, depOuvre:!!c.depOuvre, am:!!c.am,
    mDep:Math.max(0,parseInt(c.mDep,10)||0), post:Math.max(0,parseInt(c.post,10)||0), mRup:Math.max(0,parseInt(c.mRup,10)||0),
    dEnt:Math.max(0,parseInt(c.dEnt,10)||0), ent:c.ent, d_ret:c.d_ret, d_rup:c.d_rup };
}
/* Calendrier à partir de la signature (règles de l'outil Antevorta) :
   rétractation 15 j calendaires (L1237-13), instruction 15 j ouvrables (L1237-14), délais prorogés si samedi/dimanche/férié (R1231-1). */
function planRC(sig, o){
  const J=jours(o.am);
  let retFin=addDays(sig,15); const retBrute=retFin; while(J.proroge(retFin)) retFin=addDays(retFin,1);
  return suiteRC(sig, retBrute, retFin, o, J);
}
function suiteRC(sig, retBrute, retFin, o, J){
  let dep=addDays(retFin,1+o.mDep); const dep0=dep; if(o.depOuvre) while(!J.ouvre(dep)) dep=addDays(dep,1);
  const rec=addDays(dep,o.post);
  let n=0, iFin=rec; while(n<15){ iFin=addDays(iFin,1); if(J.ouvrable(iFin)) n++; }
  const iBrute=iFin; while(J.proroge(iFin)) iFin=addDays(iFin,1);
  const rup=addDays(iFin,1+o.mRup);
  const iDeb=addDays(rec,1), feriesInstr=[];
  for(let d=iDeb; d<=iFin; d=addDays(d,1)){ const nom=J.ferie(d); if(nom) feriesInstr.push([toISO(d),nom]); }
  return { sig, retDeb:sig?addDays(sig,1):null, retBrute, retFin, dep0, dep, rec, iDeb, iBrute, iFin, rup, feriesInstr };
}
function signatureAuPlusTard(cible, o){ // signature au plus tard pour une rupture au plus tard à la date voulue
  const J=jours(o.am);
  for(let s=cible; s>addDays(cible,-120); s=addDays(s,-1)) if((!o.sigOuvre||J.ouvre(s)) && planRC(s,o).rup<=cible) return s;
  return null;
}
/* calendrierRC(dateISO, config) : config.mode = 'sig' (date = signature, défaut) | 'ent' (entretien) | 'ret' (fin de rétractation) | 'rup' (rupture souhaitée) */
function calendrierRC(dateISO, cfg){
  const o=rcOptions(cfg), J=jours(o.am), mode=o.mode;
  const v = mode==='sig' ? dateISO : mode==='ent' ? o.ent : mode==='ret' ? o.d_ret : o.d_rup;
  const d0 = parseISO(v); if(!d0) return null;
  let sig=null, ent=null, p, notes=[], sigReportDepuis=null, sigAuPlusTard=false;
  if(mode==='sig'){ sig=d0; if(o.sigOuvre && !J.ouvre(sig)) notes.push('La date de signature saisie tombe un '+(J.ferie(sig)?'jour férié ('+J.ferie(sig)+')':JOURS[sig.getUTCDay()])+', qui n’est pas un jour ouvré.'); }
  else if(mode==='ent'){ ent=d0; sig=addDays(ent,o.dEnt); if(o.sigOuvre && !J.ouvre(sig)){ sigReportDepuis=sig; while(!J.ouvre(sig)) sig=addDays(sig,1); } }
  else if(mode==='rup'){ sig=signatureAuPlusTard(d0,o); if(sig){ sigAuPlusTard=true; notes.push('Pour une rupture au plus tard le '+jourLong(d0)+', la convention doit être signée au plus tard le '+jourLong(sig)+'.'); } else notes.push('Aucune date de signature ne permet cette date de rupture.'); }
  if(mode==='ret'){
    p=suiteRC(null, d0, d0, o, J);
    if(J.proroge(d0)) notes.push('La fin de rétractation saisie tombe un '+(J.ferie(d0)?'jour férié':JOURS[d0.getUTCDay()])+' ; un délai qui expire ce jour-là est prorogé au premier jour ouvrable suivant.');
  } else { if(!sig) return { erreur: notes[0]||'Date invalide.' }; p=planRC(sig,o); }
  const iso = d => d?toISO(d):null;
  return { mode, options:o, notes,
    entretien:iso(ent), signature:iso(p.sig), signatureReportDepuis:iso(sigReportDepuis), signatureAuPlusTard:sigAuPlusTard,
    retractationDebut:iso(p.retDeb), retractationBrute:iso(p.retBrute), retractationFin:iso(p.retFin),
    depot0:iso(p.dep0), envoi:iso(p.dep), reception:iso(p.rec), instructionDebut:iso(p.iDeb), instructionBrute:iso(p.iBrute), instructionFin:iso(p.iFin),
    feriesInstruction:p.feriesInstr, ruptureAuPlusTot:iso(p.rup) };
}

/* ---------- calendrier de la procédure (hors rupture conventionnelle) ----------
   Délais : entretien ≥ 5 jours ouvrables après la présentation de la convocation (L1232-2) ; notification ≥ 2 jours ouvrables après l'entretien (L1232-6),
   7 jours (15 pour un cadre) en licenciement économique individuel (L1233-15) ; préavis à compter de la 1re présentation de la lettre (L1234-3) ;
   CSP : 21 jours de réflexion (L1233-67) ; inaptitude : reprise du salaire 1 mois après l'avis (L1226-4, L1226-11), rupture à la notification ;
   mise à la retraite : interrogation écrite ≥ 3 mois avant l'anniversaire (L1237-5, D1237-2-1) ; départ volontaire : préavis L1237-10. */
function ajoutMois(d,n){ const y=d.getUTCFullYear(), m=d.getUTCMonth()+n, day=d.getUTCDate(), last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  return { date:new Date(Date.UTC(y,m,Math.min(day,last))), clamp:day>last }; }
function finDelaiMois(d,n){ const w=Math.floor(n), f=n-w; let r=ajoutMois(d,w), x=r.clamp?r.date:addDays(r.date,-1); if(f>0) x=addDays(x,Math.round(f*30)); return x; }
function apresOuvrables(d,n,J){ let c=0,x=d; while(c<n){ x=addDays(x,1); if(J.ouvrable(x)) c++; } return x; } // dernier jour du délai (non compris : jour de départ et jour d'échéance)
function calendrierProcedure(motif, cfg){
  cfg=cfg||{}; const J=jours(!!cfg.am), E=[], notes=[];
  const d0=parseISO(cfg.d0); if(!d0) return null;
  const push=(label,d,detail,key)=>{ E.push({ label, iso:toISO(d), detail:detail||'', key:!!key }); };
  const suivantOuvrable=d=>{ let x=d; while(!J.ouvrable(x)) x=addDays(x,1); return x; };
  const num=v=>(v===''||v==null||!isFinite(+v))?null:+v;
  const moisAnc=cfg.moisAnc||0;
  const pmLegal = motif==='departRet' ? (moisAnc>=24?2:1) : preavisLegalMois(moisAnc);
  const pmSaisi=num(cfg.preavisMois), pm = pmSaisi==null ? pmLegal : pmSaisi;
  const preavis=(debut,label)=>{ // bloc préavis à partir de la 1re présentation de la lettre
    if(pm<=0){ push('Fin du contrat',debut,'Pas de préavis',true); return debut; }
    const fin=finDelaiMois(debut,pm);
    push('Préavis ('+fmtMois(pm)+' mois)',debut,'du '+frDate(debut)+' au '+frDate(fin)+' ; point de départ : 1re présentation de la lettre (L1234-3)');
    push(label||'Fin du préavis et du contrat',fin,'La dispense de préavis ne change pas la date de fin du contrat',true); return fin; };
  let fin=null;
  if(motif==='departRet'||motif==='miseRet'){
    if(motif==='miseRet' && cfg.anniv){ const a=parseISO(cfg.anniv);
      if(a){ const lim=ajoutMois(a,-3).date; push('Interrogation écrite du salarié, au plus tard',lim,'3 mois avant l\'anniversaire du '+frDate(a)+' (L1237-5, D1237-2-1)');
        push('Réponse du salarié, sous',addDays(ajoutMois(lim,1).date,0),'1 mois ; réponse négative ou absence d\'interrogation : pas de mise à la retraite dans l\'année'); } }
    push(motif==='miseRet'?'Notification de la mise à la retraite':'Notification du départ à la retraite',d0,motif==='miseRet'?'Pas d\'entretien préalable obligatoire (sauf convention ou salarié protégé)':'Lettre recommandée ou remise en main propre');
    fin=preavis(d0);
    if(motif==='miseRet' && cfg.anniv){ const a=parseISO(cfg.anniv); if(a){ const rep=ajoutMois(ajoutMois(a,-3).date,1).date; if(d0<rep) notes.push('La notification précède la fin du délai de réponse du salarié ('+jourLong(rep)+') : à vérifier si le salarié a moins de 70 ans.'); } }
    notes.push(motif==='miseRet'?'Mise à la retraite : à 70 ans l\'employeur n\'a pas à interroger le salarié ; avant, l\'accord du salarié est requis (L1237-5). Préavis : L1237-6 renvoie à L1234-1.':'Départ volontaire : préavis de 1 mois (moins de 2 ans d\'ancienneté) ou 2 mois (L1237-10), sauf convention plus favorable.');
  } else {
    const inapt = motif==='inaptNP'||motif==='inaptP', eco=!!cfg.eco && motif==='lic', cadre=!!cfg.cadre;
    if(inapt && cfg.avis){ const a=parseISO(cfg.avis); if(a){ push('Avis d\'inaptitude du médecin du travail',a,'');
      push('Reprise du salaire si ni reclassé ni licencié, à partir du',ajoutMois(a,1).date,'1 mois après l\'avis (L1226-4, L1226-11)'); } }
    push('Convocation à l\'entretien préalable (1re présentation ou remise en main propre)',d0,'');
    const entMin=suivantOuvrable(addDays(apresOuvrables(d0,5,J),1));
    let ent=parseISO(cfg.ent)||entMin;
    push('Entretien préalable',ent,parseISO(cfg.ent)?'date saisie':'au plus tôt : 5 jours ouvrables après la présentation (L1232-2)',false);
    if(ent<entMin) notes.push('L\'entretien du '+jourLong(ent)+' est antérieur à la date minimale ('+jourLong(entMin)+') : délai de 5 jours ouvrables non respecté.');
    const n = eco ? (cadre?15:7) : 2;
    const notMin=suivantOuvrable(addDays(apresOuvrables(ent,n,J),1));
    const nSaisie=parseISO(cfg.notif), notif=nSaisie||notMin;
    push('Notification du licenciement (envoi de la lettre)',notif,(nSaisie?'date saisie ; ':'')+'au plus tôt : '+n+' jours ouvrables après l\'entretien ('+(eco?'L1233-15':'L1232-6')+')'+(!eco&&motif==='lic'?'. Licenciement disciplinaire : au plus tard 1 mois après l\'entretien, soit le '+frDate(ajoutMois(ent,1).date)+' (L1332-2)':''));
    if(notif<notMin) notes.push('La notification du '+jourLong(notif)+' est antérieure à la date minimale ('+jourLong(notMin)+') : délai de '+n+' jours ouvrables non respecté.');
    if(inapt){
      fin=notif; push('Fin du contrat (inaptitude : pas de préavis exécuté)',notif,'Rupture à la date de notification (L1226-4) ; le salaire cesse à la 1re présentation de la lettre',true);
      if(cfg.avis){ const a=parseISO(cfg.avis); if(a && notif>ajoutMois(a,1).date) notes.push('La notification intervient plus d\'un mois après l\'avis d\'inaptitude : le salaire doit être repris à partir du '+jourLong(ajoutMois(a,1).date)+' (L1226-4).'); }
      notes.push(motif==='inaptNP'?'Inaptitude non professionnelle : préavis non exécuté et sans indemnité compensatrice ; il compte dans l\'ancienneté de l\'indemnité de licenciement.':'Inaptitude professionnelle : indemnité égale à l\'indemnité compensatrice de préavis (L1226-14) ; la date de rupture reste la notification.');
    } else {
      if(eco && cfg.csp){
        const fCsp=addDays(ent,21);
        push('Remise du document CSP, au plus tard à l\'entretien',ent,'Point de départ du délai de réflexion');
        push('Fin du délai de réflexion CSP (21 jours)',fCsp,'Adhésion : rupture d\'un commun accord à cette date, sans préavis (L1233-67) ; la lettre de licenciement peut être envoyée à titre conservatoire pendant ce délai',true);
        const f2=(pm>0)?finDelaiMois(notif,pm):notif;
        push('Sans adhésion au CSP : fin du préavis et du contrat',f2,'Préavis de '+fmtMois(pm)+' mois à compter du '+frDate(notif),false);
        fin=fCsp;
      } else fin=preavis(notif);
      if(eco){ push('Demande de précisions sur les motifs, jusqu\'au',addDays(notif,15),'15 jours après la notification (le salarié ; l\'employeur peut aussi préciser dans ce délai)');
        push('Priorité de réembauche, jusqu\'au',ajoutMois(fin,12).date,'1 an à compter de la rupture (L1233-45)'); }
    }
    notes.push('Les jours fériés et dimanches sont écartés des délais en jours ouvrables ; les délais sont des minima.');
  }
  push('Remise du certificat de travail, de l\'attestation France Travail et du reçu pour solde de tout compte',fin,'À la fin du contrat');
  return { motif, etapes:E, notes, fin:toISO(fin), preavisMois:pm, preavisLegal:pmLegal, options:{ am:!!cfg.am } };
}

/* ---------- règles par convention collective ----------
   basis : 'max' = plus favorable de 12 et 3 mois · 'sr12' = moyenne 12 mois (comme dans les fiches) */
const CCN = {
  '1090': {
    nom:'Services de l\'automobile (IDCC 1090)', categories:null, basis:'max',
    ageMajoration:false,
    absOverride:{ maladie:{ t:'plafond', max:180, groupe:'maladie' } },
    notes:['Absences : maladie retenue dans la limite de 6 mois (cumul, à confirmer) ; AT/MP, maternité, préavis non travaillé, moitié du congé parental : retenus.'],
    conv(motif, c){
      if(!['lic','inaptNP','inaptP','rc','miseRet'].includes(motif)) return null;
      const y=c.mois/12;
      if(y<1) return { mois:0, expr:'0', lignes:['Automobile : moins de 1 an d\'ancienneté, pas d\'indemnité conventionnelle.'] };
      const mo=0.2*y + (y>10?(2/15)*(y-10):0);
      const expr=`2/10*${yf(c.mois)}`+(y>10?`+2/15*${yf(c.mois-120)}`:'');
      return { mois:mo, expr, lignes:[`Automobile : 2/10 de mois × ${fmtMois(y)} an(s)${y>10?` + 2/15 × ${fmtMois(y-10)} an(s) au-delà de 10 ans`:''} = ${fmtMois(mo)} mois`] };
    }
  },
  '0045': {
    nom:'Caoutchouc (IDCC 0045)', categories:null, basis:'sr12', ageMajoration:false, absOverride:{},
    notes:['Préavis de 3 mois : formule alternative « 10 × B / (65 − A) » non modélisée.'],
    conv(motif, c){
      if(!['lic','inaptNP','inaptP','rc','miseRet'].includes(motif)) return null;
      const y=c.mois/12;
      let mo=0, expr='0';
      if(y<1){ return { mois:0, expr, lignes:['Caoutchouc : moins de 1 an d\'ancienneté, pas d\'indemnité conventionnelle.'] }; }
      if(y<3){ mo=0.5; expr='0.5'; }
      else if(y<4){ mo=0.5+(y-3); expr=`0.5+${yf(c.mois-36)}`; }
      else { mo=0.5+1+0.3*(y-4); expr=`0.5+1+0.3*${yf(c.mois-48)}`; }
      return { mois:mo, expr, lignes:[`Caoutchouc : ½ mois (1 à 3 ans) + 1 mois (3 à 4 ans) + 3/10 de mois par année au-delà de 4 ans = ${fmtMois(mo)} mois`] };
    }
  },
  '2420': {
    nom:'Bâtiment — cadres (IDCC 2420)', categories:null, basis:'sr12', ageMajoration:true, absOverride:{},
    notes:['Rémunération de référence prévue par la convention : dernier mois avant notification + 1/12 de la part variable (vos fiches utilisent la moyenne des 12 mois).'],
    conv(motif, c){
      if(!['lic','inaptNP','inaptP','rc','miseRet'].includes(motif)) return null;
      const y=c.mois/12;
      if(y<2) return { mois:0, expr:'0', lignes:['Bâtiment cadres : moins de 2 ans révolus d\'ancienneté, pas d\'indemnité conventionnelle.'] };
      let mo=0.3*Math.min(y,10)+0.6*Math.max(0,y-10);
      const lignes=[`Bâtiment cadres : 3/10 de mois par année jusqu'à 10 ans${y>10?', 6/10 au-delà':''} = ${fmtMois(mo)} mois`];
      let expr = y<=10 ? `0.3*${yf(c.mois)}` : `0.3*10+0.6*${yf(c.mois-120)}`;
      if(mo>15){ mo=15; lignes.push('Plafond de 15 mois appliqué.'); expr='15'; }
      let maj=1;
      if(c.age!==null && c.age>55){ maj=1.1; lignes.push('Majoration de 10 % (cadre de plus de 55 ans).'); expr=`(${expr})*1.1`; }
      return { mois:mo*maj, expr, lignes };
    }
  },
  '1486': {
    nom:'Syntec — bureaux d\'études techniques, ingénierie, conseil (IDCC 1486)',
    categories:[['etam','ETAM'],['cadre','Ingénieurs et cadres']], basis:'sr12', ageMajoration:false,
    absOverride:{ maladie:{ t:'seuil', max:180 }, trajet:{ t:'seuil', max:180 } },
    notes:['Référence : site de la Fédération Syntec (articles 4.5 et 4.8). Salaire de référence conventionnel : 1/12 de la rémunération des 12 derniers mois (primes prévues au contrat incluses ; majorations d\'heures supplémentaires et indemnités de déplacement exclues) : la moyenne 3 mois n\'est donc pas retenue pour le calcul conventionnel.','Aucun plafond ni majoration/minoration prévus par les articles 4.5 et 4.8. Ancienneté (art. 3.7) : maladie et accidents pris en compte si la suspension est inférieure à 6 mois ininterrompus ; maternité, adoption, congés de formation, congés payés ou exceptionnels d\'un commun accord, détachements : pris en compte ; paternité, congé parental, congé sans solde, préavis : non précisés (règles légales).'],
    conv(motif, c){
      const lic = () => {
        if(c.categorie==='cadre'){
          /* Art. 4.5 (texte KALI en vigueur, avenant n° 46) : le seuil porte sur l'ancienneté totale. Moins de 2 ans : 1/4 de mois
             par année de présence ; 2 ans ou plus : 1/3 de mois pour CHAQUE année de présence (et non seulement au-delà de 2 ans).
             Lecture identique à celle du simulateur du Code du travail numérique. */
          const r = c.mois>=24 ? 1/3 : 1/4, an = c.mois/12, fr = c.mois>=24 ? '1/3' : '1/4';
          return { mois:an*r, expr:`${yf(c.mois)}/${c.mois>=24?3:4}`,
            lignes:[`Syntec art. 4.5 ingénieurs et cadres : ${c.mois>=24?'ancienneté de 2 ans ou plus':'ancienneté inférieure à 2 ans'} → ${fr} de mois par année de présence sur toute l'ancienneté : ${fmtMois(an)} an(s) × ${fr} = ${fmtMois(an*r)} mois de salaire (prorata des mois complets)`] };
        }
        const seuil = 120;
        const t = tranche(c.mois, seuil, 1/4, 1/3);
        return { mois:t.mois, expr:`${yf(Math.min(c.mois,seuil))}/4`+(c.mois>seuil?`+${yf(c.mois-seuil)}/3`:''),
          lignes:[`Syntec art. 4.5 ETAM : ${fmtMois(t.a)} an(s) × 1/4 + ${fmtMois(t.b)} an(s) × 1/3 = ${fmtMois(t.mois)} mois de salaire (prorata des mois complets). Au-delà de 10 ans, lecture du simulateur du Code du travail numérique (1/3 sur les seules années au-delà de 10 ans), le texte pouvant se lire autrement.`] };
      };
      const retraite = () => {
        const y=Math.floor(c.mois/12);
        if(y<5) return { mois:0, expr:'0', lignes:['Syntec art. 4.8 : ancienneté inférieure à 5 ans révolus, pas d\'indemnité de retraite conventionnelle.'] };
        const mo = 1 + Math.max(0,y-5)*0.2;
        return { mois:mo, expr:`1+${Math.max(0,y-5)}/5`, lignes:[`Syntec art. 4.8 : 1 mois à 5 ans révolus + ${fmtMois(Math.max(0,y-5))} année(s) × 1/5 = ${fmtMois(mo)} mois`] };
      };
      if(['lic','inaptNP','inaptP'].includes(motif)){
        if(c.mois<8) return { mois:0, expr:'0', lignes:['Syntec art. 4.5 : moins de 8 mois d\'ancienneté ininterrompue, pas d\'indemnité.'] };
        return lic();
      }
      if(motif==='rc') return lic();
      if(motif==='departRet') return retraite();
      if(motif==='miseRet'){
        const r=retraite(), l=lic();
        const best = r.mois>=l.mois ? r : l;
        return { mois:best.mois, expr:best.expr, lignes:[...best.lignes, 'Mise à la retraite : indemnité de l\'art. 4.8, au moins égale à l\'indemnité conventionnelle de licenciement (le plus élevé des deux retenu).'] };
      }
      return null;
    }
  },
  '1596': {
    nom:'Bâtiment — ouvriers, entreprises jusqu\'à 10 salariés (IDCC 1596)', categories:null, basis:'max', ageMajoration:true, absOverride:{}, notes:['Licenciement (art. 10.3) : due à l\'ouvrier qui ne remplit pas, à son départ, les conditions d\'une pension de vieillesse à taux plein (condition non vérifiée par l\'outil) ; 1/10 de mois par année de 2 à 5 ans, 3/20 dès 5 ans, +1/20 au-delà de 15 ans, majoration de 10 % à plus de 55 ans.','Retraite : l\'indemnité conventionnelle de départ est servie par la CNPO (art. 15 du règlement du régime national de prévoyance), pas par l\'employeur ; l\'outil ne calcule que le minimum légal.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet') return renvoiLegal(motif,c,'Bâtiment ouvriers (art. 10.3) : l\'indemnité conventionnelle de départ à la retraite est servie par la CNPO (art. 15 du règlement du régime de prévoyance), pas par l\'employeur ; à la charge de l\'employeur, seul le minimum légal');
      const y=c.mois/12;
      let mo=0, txt;
      if(y<2){ txt='moins de 2 ans d\'ancienneté : pas d\'indemnité conventionnelle'; }
      else if(y<5){ mo=y*0.1; txt=`${fmtMois(y)} an(s) × 1/10 = ${fmtMois(mo)} mois`; }
      else { mo=y*0.15 + (y>15?(y-15)*0.05:0); txt=`${fmtMois(y)} an(s) × 3/20${y>15?` + ${fmtMois(y-15)} an(s) × 1/20 au-delà de 15 ans`:''} = ${fmtMois(mo)} mois`; }
      const lignes=['Bâtiment ouvriers ≤ 10 salariés : '+txt];
      let maj=1;
      if(c.age>55 && mo>0){ maj=1.1; lignes.push('Majoration de 10 % (ouvrier de plus de 55 ans).'); }
      if(c.age===null||c.age===undefined||isNaN(c.age)) lignes.push('Âge non renseigné : majoration de 10 % (plus de 55 ans) non appliquée.');
      return { mois:mo*maj, expr:String(mo*maj), lignes, doubleSiInaptP:true };
    }
  },
  '1979': {
    nom:'Hôtels, cafés, restaurants — HCR (IDCC 1979)', categories:null, basis:'max', ageMajoration:false, absOverride:{}, notes:[],
    conv(motif, c){
      if(['lic','inaptNP','rc','inaptP'].includes(motif)){
        if(motif!=='rc' && c.mois<24) return { mois:0, expr:'0', lignes:['HCR (art. 32) : ancienneté inférieure à 2 ans, pas d\'indemnité conventionnelle.'] };
        const t=tranche(c.mois,120,1/10,7/30);
        return { mois:t.mois, expr:`${yf(Math.min(c.mois,120))}/10`+(c.mois>120?`+${yf(c.mois-120)}*7/30`:''), lignes:[`HCR (art. 32) : ${fmtMois(t.a)} an(s) × 1/10 + ${fmtMois(t.b)} an(s) × 7/30 = ${fmtMois(t.mois)} mois`] };
      }
      return null;
    }
  }
};

/* ---------- Top 30 des conventions : barèmes issus des synthèses publiques (LégiSocial, fiche-paie.fr, Code du travail numérique) ----------
   TOUTES PROVISOIRES : à confronter au texte Légifrance. Quand aucun barème n'a pu être confirmé, la règle est « non modélisée » et le légal s'applique. */
const NM = (txt, avert) => ({ mois:0, expr:'0', lignes:[txt], nonModelise:true, avert:avert||null });
const zero = (lab,n) => ({ mois:0, expr:'0', lignes:[`${lab} : moins de ${n} an(s) d'ancienneté, pas d'indemnité conventionnelle.`] });
const clamp = (x,a,b) => Math.max(0,Math.min(x,b)-a);          // part de x comprise entre a et b
const palierMois = (m, list, strict) => { let v=0; for(const [a,x] of list){ if(strict ? m>a*12 : Math.floor(m/12)>=a) v=x; } return v; };
const renvoiLegal = (motif, c, lab) => {
  if(motif==='departRet'){ const m=departLegalMois(c.mois); return { mois:m, expr:String(m), lignes:[`${lab} : renvoi au barème légal (D1237-1) = ${fmtMois(m)} mois.`], doubleSiInaptP:false }; }
  if(['lic','inaptNP','inaptP','miseRet'].includes(motif) && c.mois<8) return { mois:0, expr:'0', lignes:[`${lab} : moins de 8 mois d'ancienneté.`] };
  const m=legalMois(c.mois); return { mois:m, expr:legalExpr(c.mois), lignes:[`${lab} : renvoi au calcul légal (1/4 de mois par année jusqu'à 10 ans, 1/3 au-delà) = ${fmtMois(m)} mois.`], doubleSiInaptP:true };
};
const palierTxt = (lab, y, mo) => `${lab} : ${Math.floor(y)} an(s) d'ancienneté → ${fmtMois(mo)} mois de salaire`;
const LICM = ['lic','inaptNP','inaptP','rc','miseRet'];
const base0 = { categories:null, basis:'max', ageMajoration:false, absOverride:{}, notes:[] };

Object.assign(CCN, {
  '1597': Object.assign({}, CCN['1596'], { nom:'Bâtiment — ouvriers, entreprises de plus de 10 salariés (IDCC 1597)',
    conv(motif, c){ const r=CCN['1596'].conv(motif,c); r.lignes=r.lignes.map(l=>l.replace('≤ 10 salariés','> 10 salariés')); return r; },
    notes:['Art. 10.3 relu le 21/11/2026 : barème identique à celui des ouvriers ≤ 10 salariés (1596), y compris le renvoi à la CNPO pour la retraite.'].concat(CCN['1596'].notes) }),
  '2609': { ...base0, nom:'Bâtiment — ETAM (IDCC 2609)', ageMajoration:true,
    notes:['Assiette conventionnelle : rémunération du dernier mois avant la notification + 1/12 des éléments variables ; ici : plus favorable des moyennes 12 / 3 mois.'],
    conv(motif, c){
      const y=c.mois/12;
      if(motif==='departRet'){
        if(y<2) return zero('Bâtiment ETAM (départ retraite)',2);
        let mo=0.1*Math.min(y,10)+0.15*Math.max(0,y-10); const l=[`ETAM départ volontaire (art. 8.10) : 1/10 de mois par année jusqu'à 10 ans + 1,5/10 au-delà = ${fmtMois(mo)} mois`];
        if(mo>5){ mo=5; l.push('Plafond de 5 mois appliqué.'); } return { mois:mo, expr:String(mo), lignes:l };
      }
      if(motif==='miseRet' && c.age!==null && c.age>=65) return renvoiLegal(motif,c,'ETAM mise à la retraite (65 ans et plus)');
      if(y<2) return zero('Bâtiment ETAM',2);
      let mo, l, cap;
      if(motif==='miseRet'){ mo=0.15*Math.min(y,10)+0.25*Math.max(0,y-10); cap=8; l=[`ETAM mise à la retraite (art. 8.7, < 65 ans) : 1,5/10 de mois par année jusqu'à 10 ans + 2,5/10 au-delà = ${fmtMois(mo)} mois`]; }
      else { mo=0.25*Math.min(y,15)+0.35*Math.max(0,y-15); cap=10; l=[`ETAM licenciement (art. 8.5) : 2,5/10 de mois par année jusqu'à 15 ans + 3,5/10 au-delà = ${fmtMois(mo)} mois`]; }
      if(mo>cap){ mo=cap; l.push(`Plafond de ${cap} mois appliqué.`); }
      if(motif!=='miseRet' && c.age!==null && c.age>55){ mo=mo*1.1; l.push('Majoration de 10 % (ETAM de plus de 55 ans, ajoutée après plafond).'); }
      return { mois:mo, expr:String(mo), lignes:l };
    } },
  '7024': { ...base0, nom:'Production agricole et CUMA (IDCC 7024)', categories:[['nc','Non-cadres'],['tam','Techniciens, agents de maîtrise et cadres']],
    notes:['Licenciement : « au moins ¼ de mois par année (10 premières années), ⅓ ensuite » = calcul légal.','Retraite : montants relevés sur une page secondaire (advizexperts) ; seuil et base de salaire à confirmer.'],
    conv(motif, c){
      if(motif==='departRet'){
        const list = c.categorie==='tam' ? [[10,1.5],[20,3],[30,4]] : [[10,1],[20,2],[30,3]];
        const mo=palierMois(c.mois,list); return { mois:mo, expr:String(mo), lignes:[palierTxt('Production agricole départ retraite',c.mois/12,mo)] };
      }
      return renvoiLegal(motif,c,'Production agricole');
    } },
  '1501': { ...base0, nom:'Restauration rapide (IDCC 1501)', categories:[['nc','Non-cadres'],['cadre','Cadres']],
    notes:['Seuil d\'ancienneté contradictoire dans la synthèse (1 an dans le texte, 2 ans dans le tableau) : 2 ans retenus pour les non-cadres, 1 an pour les cadres (disposition particulière).','Cadres : barème lu sur le texte de l\'art. 13 (1/10 jusqu\'à 5 ans ; au-delà 2/10 par année + 1/15 de 5 à 10 ans + 2/15 de 10 à 15 ans + 3/15 au-delà). Le simulateur officiel du Code du travail numérique applique à tort la tranche 5-10 ans à la majoration 2/15 : écart assumé.','Majoration de 15 % pour licenciement économique (50 ans et plus, 10 ans d\'ancienneté) : appliquée pour le motif « Licenciement pour motif économique ».','Départ en retraite : 60 ans révolus requis par la convention.'],
    conv(motif, c){
      const y=c.mois/12;
      if(motif==='departRet'){ const mo=palierMois(c.mois,[[10,1],[15,2],[20,3],[30,4]]); return { mois:mo, expr:String(mo), lignes:[palierTxt('Restauration rapide (art. 28) départ retraite',y,mo)] }; }
      if(motif==='miseRet') return renvoiLegal(motif,c,'Restauration rapide mise à la retraite (législation en vigueur)');
      if(c.categorie==='cadre'){
        if(y<1) return zero('Restauration rapide cadres',1);
        if(y<=5){ const mo=y/10; return { mois:mo, expr:`${yf(c.mois)}/10`, doubleSiInaptP:true, lignes:[`Restauration rapide cadres (art. 13) : 1/10 de mois par année jusqu'à 5 ans = ${fmtMois(mo)} mois`] }; }
        const a2=Math.max(0,Math.min(y,10)-5), a3=Math.max(0,Math.min(y,15)-10), a4=Math.max(0,y-15);
        let mo=0.2*y+a2/15+2*a3/15+3*a4/15; let expr=`0.2*${yf(c.mois)}+${fmtMois(a2)}/15+2*${fmtMois(a3)}/15+3*${fmtMois(a4)}/15`;
        const lg=[`Restauration rapide cadres (art. 13) : 2/10 de mois par année + 1/15 par année de 5 à 10 ans + 2/15 de 10 à 15 ans + 3/15 au-delà de 15 ans = ${fmtMois(mo)} mois`];
        if(c.eco && c.age!==null && c.age>=50 && y>=10){ mo*=1.15; expr=`(${expr})*1.15`; lg.push('Majoration de 15 % (licenciement économique, 50 ans et plus, 10 ans d\'ancienneté).'); }
        return { mois:mo, expr, doubleSiInaptP:true, lignes:lg };
      }
      if(y<2) return zero('Restauration rapide',2);
      let mo=0.1*y+(y>15?(2/15)*(y-10):y>10?(1/15)*(y-10):0);
      const lg=[`Restauration rapide non-cadres : 1/10 de mois par année${y>10?` + ${y>15?'2/15':'1/15'} par année au-delà de 10 ans`:''} = ${fmtMois(mo)} mois`];
      if(c.eco && c.age!==null && c.age>=50 && y>=10){ mo*=1.15; lg.push('Majoration de 15 % (licenciement économique, 50 ans et plus, 10 ans d\'ancienneté).'); }
      return { mois:mo, expr:String(mo), doubleSiInaptP:true, lignes:lg };
    } },
  '3248': { ...base0, nom:'Métallurgie (IDCC 3248)', ageMajoration:true,
    categories:[['abcde','Groupes d\'emplois A à E'],['fghi','Groupes d\'emplois F à I']],
    notes:['Licenciement : art. 75.3.1.1 (groupes A à E : 1/4 de mois par année jusqu\'à 10 ans, 1/3 au-delà) et 75.3.1.2 et 75.3.3 (groupes F à I : 1/4 par année sous 8 ans ; dès 8 ans, 1/5 jusqu\'à 7 ans puis 3/5 au-delà ; majoration de 20 % de 50 à 55 ans et de 30 % de 55 à 60 ans avec 5 ans d\'ancienneté, planchers de 3 et 6 mois, plafond de 18 mois). Âge apprécié à la date de rupture.','Non gérés : minoration de 5 à 40 % à partir de 61 ans (si le salarié remplit les conditions de retraite à taux plein), majoration de 50 % pour licenciement motivé par des absences prolongées ou répétées, salarié anciennement cadre classé dans les groupes A à E, forfait jour, temps partiel.'],
    conv(motif, c){
      if(motif==='departRet'){ const mo=palierMois(c.mois,[[2,0.5],[5,1],[10,2],[20,3],[30,4],[35,5],[40,6]]); return { mois:mo, expr:String(mo), lignes:[palierTxt('Métallurgie (art. 77.3) départ retraite',c.mois/12,mo)] }; }
      if(motif==='miseRet') return renvoiLegal(motif,c,'Métallurgie mise à la retraite (au moins le légal)');
      if(c.mois<8) return { mois:0, expr:'0', lignes:['Métallurgie (art. 75.3) : moins de 8 mois d\'ancienneté, pas d\'indemnité.'] };
      if(c.categorie!=='fghi'){
        const t=tranche(c.mois,120,1/4,1/3);
        return { mois:t.mois, expr:`${yf(Math.min(c.mois,120))}/4`+(c.mois>120?`+${yf(c.mois-120)}/3`:''), doubleSiInaptP:true,
          lignes:[`Métallurgie groupes A à E (art. 75.3.1.1) : ${fmtMois(t.a)} an(s) × 1/4 + ${fmtMois(t.b)} an(s) × 1/3 = ${fmtMois(t.mois)} mois de salaire (prorata des mois complets)`] };
      }
      const y=c.mois/12;
      let mo = y<8 ? y/4 : 0.2*Math.min(y,7)+0.6*Math.max(0,y-7);
      const lignes=[y<8 ? `Métallurgie groupes F à I (art. 75.3.1.2) : ancienneté inférieure à 8 ans : ${fmtMois(y)} an(s) × 1/4 = ${fmtMois(mo)} mois`
        : `Métallurgie groupes F à I (art. 75.3.1.2) : ancienneté d'au moins 8 ans : ${fmtMois(Math.min(y,7))} an(s) × 1/5 + ${fmtMois(Math.max(0,y-7))} an(s) × 3/5 = ${fmtMois(mo)} mois`];
      let expr = y<8 ? `${yf(c.mois)}/4` : `0.2*${Math.min(y,7)}+0.6*${yf(c.mois-84)}`;
      let maj=1, plancher=0;
      if(c.age!==null && y>=5){
        if(c.age>=50 && c.age<55){ maj=1.2; plancher=3; }
        else if(c.age>=55 && c.age<60){ maj=1.3; plancher=6; }
      }
      let avert=null;
      if(maj>1){ mo*=maj; expr=`(${expr})*${maj}`; lignes.push(`Art. 75.3.3 : majoration de ${Math.round((maj-1)*100)} % (${plancher===3?'50 à moins de 55 ans':'55 à moins de 60 ans'}, 5 ans d'ancienneté) = ${fmtMois(mo)} mois.`);
        if(mo<plancher){ mo=plancher; expr=String(plancher); lignes.push(`Plancher de ${plancher} mois de salaire de référence appliqué.`); } }
      if(mo>18){ mo=18; expr='18'; lignes.push('Plafond de 18 mois de salaire de référence appliqué.'); }
      if(c.age!==null && c.age>=61) avert='Âge de 61 ans ou plus : la minoration de l\'art. 75.3.3 (5 à 40 %, dans la limite du minimum légal) s\'applique si le salarié remplit les conditions de la retraite à taux plein ; elle n\'est pas appliquée ici, à vérifier.';
      return { mois:mo, expr, doubleSiInaptP:true, avert, lignes };
    } },
  '0016': { ...base0, nom:'Transports routiers (IDCC 0016)', ageMajoration:true,
    categories:[['ouvrier','Ouvriers'],['employe','Employés'],['etam','Techniciens et agents de maîtrise'],['cadre','Ingénieurs et cadres']],
    notes:['Réduction possible de 20 % par année après 60 ans (non appliquée).','Cadres : indemnité complémentaire (2 / 3 / 4 mois après 10 / 20 / 30 ans) et échelonnement non modélisés.','Retraite (ouvriers, employés, techniciens et agents de maîtrise) : 1/2 mois après 10 ans, 1 mois après 15, 1,5 après 20, 2 après 25, 2,5 après 30, pour un salarié de 65 ans ou de 60 ans dans les cas prévus par le texte (inaptitude, retraite anticipée, retraite complémentaire liquidée) ; ces conditions d\'âge sont signalées, non vérifiées. Cadres : pourcentage de la rémunération annuelle avec minimums et plafonds de la grille garantie, non modélisé.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet'){
        if(c.categorie==='cadre') return NM('Transports routiers, ingénieurs et cadres (annexe IV, art. 18) : indemnité en pourcentage de la rémunération annuelle réelle (4,5 % à 21 %) avec minimums et plafonds liés à la grille garantie par groupe, non modélisée.','Barème retraite des cadres non modélisé : seul le minimum légal est calculé.');
        const y0=c.mois/12; const mo=palierMois(c.mois,[[10,0.5],[15,1],[20,1.5],[25,2],[30,2.5]]);
        const l=[palierTxt('Transports routiers, indemnité de départ en retraite (art. 11 quinquies, 17 ter, 21 ter)',y0,mo)+' Rémunération moyenne des 12 derniers mois.'];
        if(c.age!==null && c.age<60) l.push('Âge inférieur à 60 ans : l\'indemnité conventionnelle n\'est due que dans les cas de départ anticipé prévus par le texte (à vérifier).');
        return { mois:mo, expr:String(mo), baseKey:'sr12', lignes:l };
      }
      if(!['lic','inaptNP','inaptP','rc'].includes(motif)) return NM('Transports routiers : barème de retraite non modélisé.','Barème retraite non modélisé : seul le minimum légal est calculé.');
      const y=c.mois/12;
      if(c.categorie==='cadre'){
        if(y<3) return zero('Transports cadres',3); const mo=0.4*y;
        return { mois:mo, expr:`0.4*${yf(c.mois)}`, doubleSiInaptP:true, avert:'Cadres : indemnité complémentaire et réduction d\'âge non modélisées.', lignes:[`Transports ingénieurs et cadres (art. 17) : 4/10 de mois par année = ${fmtMois(mo)} mois`] };
      }
      if(y<2) return zero('Transports routiers',2);
      const t = c.categorie==='etam' ? (y<3?0.1:0.3) : (y<3?0.1:0.2);
      const mo=t*y;
      return { mois:mo, expr:`${t}*${yf(c.mois)}`, doubleSiInaptP:true, baseKey: c.categorie==='etam'?'sr':'sr3', lignes:[`Transports routiers ${c.categorie==='etam'?'ETAM':c.categorie==='employe'?'employés':'ouvriers'} : ${t*10}/10 de mois par année × ${fmtMois(y)} an(s) = ${fmtMois(mo)} mois${c.categorie==='etam'?'':' (base : moyenne des 3 derniers mois)'}`] };
    } },
  '0573': { ...base0, nom:'Commerces de gros (IDCC 0573)', ageMajoration:true,
    categories:[['emp','Employés et ouvriers'],['am','Agents de maîtrise et techniciens'],['cadre','Cadres']],
    notes:['Licenciement (art. 37 et avenants I et II) : seuil de 1 an d\'ancienneté ; employés 1/5 de mois par année + 2/15 au-delà de 10 ans ; agents de maîtrise 2/10 + 2/15 au-delà de 10 ans ; cadres 2/10 jusqu\'à 5 ans, puis 3/10 (années 1 à 9), 4/10 (10e à 19e), 5/10 (à partir de la 20e), plafond 12 mois, majoration de 15 % (50 à 55 ans) ou 20 % (55 ans et plus) avec 15 ans d\'ancienneté.','Agents de maîtrise licenciés pour motif économique à 55 ans et plus avec 15 ans d\'ancienneté (licenciement pour motif économique) : 2/10 jusqu\'à 9 ans, 3/10 ensuite, majoration de 20 %, plafond de 6 mois ; plafond lu majoration comprise comme le simulateur officiel (le texte peut se lire plafond puis majoration).','Retraite : barèmes relevés sur synthèse, à recouper sur le texte.'],
    conv(motif, c){
      const y=c.mois/12;
      if(motif==='departRet'||motif==='miseRet'){
        if(y<2) return zero('Commerces de gros retraite',2);
        let mo, l;
        if(c.categorie==='cadre'){ mo=0.1*Math.min(y,9)+0.15*clamp(y,9,19)+0.2*Math.max(0,y-19); l=`Cadres : 2/20 (jusqu'à 9 ans), 3/20 (10 à 19 ans), 4/20 (20 ans et plus) par année = ${fmtMois(mo)} mois, plafond 6 mois`; }
        else if(c.categorie==='am'){ mo=0.1*y+0.05*Math.max(0,y-15); l=`Agents de maîtrise : 2/20 par année + 1/20 au-delà de 15 ans = ${fmtMois(mo)} mois, plafond 6 mois`; }
        else { mo=0.1*y; l=`Employés : 1/10 de mois par année = ${fmtMois(mo)} mois, plafond 3 mois`; }
        const cap = c.categorie==='emp'?3:6; const lg=['Commerces de gros ('+(motif==='miseRet'?'mise à la retraite':'départ volontaire')+') — '+l];
        if(mo>cap){ mo=cap; lg.push(`Plafond de ${cap} mois appliqué.`); }
        return { mois:mo, expr:String(mo), lignes:lg };
      }
      if(y<1) return zero('Commerces de gros',1);
      if(c.categorie==='cadre'){
        let mo, l0;
        if(y<=5){ mo=0.2*y; l0='2/10 de mois par année (1 à 5 ans)'; }
        else { const a1=Math.min(y,9), a2=Math.max(0,Math.min(y,19)-9), a3=Math.max(0,y-19); mo=0.3*a1+0.4*a2+0.5*a3; l0='3/10 par année jusqu\'à 9 ans, 4/10 de la 10e à la 19e année, 5/10 à partir de la 20e'; }
        const l=[`Commerces de gros cadres (avenant I, art. 4) : ${l0} = ${fmtMois(mo)} mois`];
        if(mo>12){ mo=12; l.push('Plafond de 12 mois appliqué.'); }
        if(c.age!==null && y>=15){ if(c.age>=55){ mo*=1.2; l.push('Majoration de 20 % (55 ans révolus, 15 ans d\'ancienneté).'); } else if(c.age>=50){ mo*=1.15; l.push('Majoration de 15 % (50 à 55 ans, 15 ans d\'ancienneté).'); } }
        return { mois:mo, expr:String(mo), doubleSiInaptP:true, lignes:l };
      }
      if(c.categorie==='am'){
        if(c.eco && c.age!==null && c.age>=55 && y>=15){
          let mo=(0.2*Math.min(y,9)+0.3*Math.max(0,y-9))*1.2; const lg=[`Commerces de gros agents de maîtrise, licenciement économique à 55 ans et plus avec 15 ans (avenant II, art. 4) : 2/10 par année jusqu'à 9 ans, 3/10 ensuite, majoration de 20 % = ${fmtMois(mo)} mois`];
          if(mo>6){ mo=6; lg.push('Plafond de 6 mois appliqué (majoration comprise, lecture du simulateur officiel).'); }
          return { mois:mo, expr:String(mo), doubleSiInaptP:true, lignes:lg };
        }
        const mo=0.2*y+(2/15)*Math.max(0,y-10);
        return { mois:mo, expr:String(mo), doubleSiInaptP:true, lignes:[`Commerces de gros agents de maîtrise (avenant II, art. 4) : 2/10 de mois par année + 2/15 au-delà de 10 ans = ${fmtMois(mo)} mois`] };
      }
      const mo=0.2*y+(2/15)*Math.max(0,y-10);
      return { mois:mo, expr:String(mo), doubleSiInaptP:true, lignes:[`Commerces de gros employés (art. 37) : 1/5 de mois par année + 2/15 au-delà de 10 ans = ${fmtMois(mo)} mois`] };
    } },
  '1527': { ...base0, nom:'Immobilier (IDCC 1527)',
    notes:['Licenciement motif personnel : ¼ du salaire global brut mensuel par année après 2 ans (base : salaire contractuel).','Mise à la retraite : barème 0,11 à 0,21 mois par année selon ancienneté et âge, toujours inférieur au légal : légal appliqué.'],
    conv(motif, c){
      if(motif==='departRet'){ const mo=palierMois(c.mois,[[5,0.5],[10,1],[15,1.5],[20,2],[25,2.5],[30,3]],true); return { mois:mo, expr:String(mo), lignes:[`Immobilier (avenant 95) départ retraite : plus de ${[5,10,15,20,25,30].filter(a=>c.mois>a*12).pop()||0} ans → ${fmtMois(mo)} mois`] }; }
      if(motif==='miseRet') return NM('Immobilier mise à la retraite : barème conventionnel inférieur au légal.','Mise à la retraite : le barème conventionnel reste inférieur au légal, le légal s\'applique.');
      const y=c.mois/12; if(y<2) return zero('Immobilier',2);
      const mo=0.25*y; return { mois:mo, expr:`0.25*${yf(c.mois)}`, doubleSiInaptP:true, lignes:[`Immobilier (art. 33) : 1/4 de mois par année × ${fmtMois(y)} an(s) = ${fmtMois(mo)} mois`] };
    } },
  '1147': { ...base0, nom:'Cabinets médicaux (IDCC 1147)',
    notes:['Départ volontaire : barème identique au légal.','La formule conventionnelle est inférieure au légal avant 10 ans : le légal l\'emporte presque toujours.'],
    conv(motif, c){
      if(motif==='departRet'){ const mo=palierMois(c.mois,[[10,0.5],[15,1],[20,1.5],[30,2]]); return { mois:mo, expr:String(mo), lignes:[palierTxt('Cabinets médicaux départ retraite',c.mois/12,mo)] }; }
      const y=c.mois/12; if(y<1) return zero('Cabinets médicaux',1);
      const mo=0.2*y+(2/15)*Math.max(0,y-10);
      return { mois:mo, expr:`0.2*${yf(c.mois)}`+(y>10?`+2/15*${yf(c.mois-120)}`:''), doubleSiInaptP:true, lignes:[`Cabinets médicaux (art. 25) : 1/5 de mois par année + 2/15 au-delà de 10 ans = ${fmtMois(mo)} mois`] };
    } },
  '1043': { ...base0, nom:'Gardiens, concierges et employés d\'immeubles (IDCC 1043)',
    notes:['Licenciement (art. 16) : 1/5 de mois par année sur la totalité des années, majoré de 2/15 par année au-delà de la 7e et de 1/10 par année au-delà de la 19e ; ancienneté minimale de 1 an. Années incomplètes au pro rata.','Retraite : non modélisée (légal appliqué).'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet') return NM('Gardiens et concierges : retraite non modélisée.','Retraite non modélisée : seul le minimum légal est calculé.');
      const y=c.mois/12; if(y<1) return zero('Gardiens et concierges',1);
      const mo=y/5+(2/15)*Math.max(0,y-7)+0.1*Math.max(0,y-19);
      return { mois:mo, expr:`${yf(c.mois)}/5+2/15*${fmtMois(Math.max(0,y-7))}+${fmtMois(Math.max(0,y-19))}/10`, doubleSiInaptP:true, lignes:[`Gardiens et concierges (art. 16) : 1/5 de mois par année${y>7?' + 2/15 au-delà de 7 ans':''}${y>19?' + 1/10 au-delà de 19 ans':''} = ${fmtMois(mo)} mois`] };
    } },
  '1619': { ...base0, nom:'Cabinets dentaires (IDCC 1619)',
    notes:['Barème de licenciement non confirmé ; mise à la retraite = garantie identique à celle du licenciement (art. 4.4).'],
    conv(motif){ return NM('Cabinets dentaires : barème non confirmé.','Barème non confirmé : seul le minimum légal est calculé.'); } },
  '2596': { ...base0, nom:'Coiffure et professions connexes (IDCC 2596)', categories:[['nc','Employés (emplois techniques, coiffeurs, esthétique, non techniques)'],['cadre','Cadres et agents de maîtrise']],
    notes:['Non-cadres et retraite : renvoi au calcul légal.','Cadres et agents de maîtrise : ¼ de mois par année, plafonné à 6 mois, sur le salaire réel moyen de la dernière année.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet'||c.categorie!=='cadre') return renvoiLegal(motif,c,'Coiffure');
      const y=c.mois/12; if(y<1) return zero('Coiffure cadres/AM',1);
      let mo=0.25*y; const l=[`Coiffure cadres et agents de maîtrise : 1/4 de mois par année × ${fmtMois(y)} an(s) = ${fmtMois(mo)} mois`];
      if(mo>6){ mo=6; l.push('Plafond de 6 mois appliqué.'); }
      return { mois:mo, expr:String(mo), baseKey:'sr12', doubleSiInaptP:true, lignes:l };
    } },
  '2511': { ...base0, nom:'Sport (IDCC 2511)',
    notes:['Formule générale affichée par la synthèse (1/5 + 2/15) incompatible avec le tableau par tranches : tableau retenu.','Départ volontaire : paliers 10/15/20/30 ans ; années intermédiaires non précisées.'],
    conv(motif, c){
      if(motif==='departRet'){ const mo=palierMois(c.mois,[[10,1.5],[15,2],[20,4],[30,5]]); return { mois:mo, expr:String(mo), lignes:[palierTxt('Sport départ retraite',c.mois/12,mo)] }; }
      const y=c.mois/12; if(y<1) return zero('Sport',1);
      const mo=0.2*Math.min(y,5)+0.25*clamp(y,5,10)+(1/3)*Math.max(0,y-10);
      return { mois:mo, expr:String(mo), doubleSiInaptP:true, lignes:[`Sport : 1/5 de mois par année (1 à 5 ans), 1/4 (6 à 10 ans), 1/3 (au-delà) = ${fmtMois(mo)} mois`] };
    } },
  '1517': { ...base0, nom:'Commerces de détail non alimentaires (IDCC 1517)',
    notes:['Licenciement (art. 4, chap. VI, texte en vigueur) : après 8 mois d\'ancienneté, au moins 1/4 de mois par année jusqu\'à 10 ans, puis 1/3 de mois + 1/15 de mois par année à partir de 10 ans. Années incomplètes au prorata des mois complets.','Assiette de la retraite relevée de façon incertaine (moitié des 12 mois ?) : moyenne 12 / 3 mois retenue.'],
    conv(motif, c){
      if(motif==='departRet'){ const mo=palierMois(c.mois,[[10,1],[15,1.5],[20,2],[25,2.5],[30,3]]); return { mois:mo, expr:String(mo), lignes:[palierTxt('Commerces non alimentaires départ retraite',c.mois/12,mo)] }; }
      if(c.mois<8) return { mois:0, expr:'0', lignes:['Commerces de détail non alimentaires (art. 4, chap. VI) : moins de 8 mois d\'ancienneté, pas d\'indemnité.'] };
      const y=c.mois/12;
      const mo=0.25*Math.min(y,10)+0.4*Math.max(0,y-10);
      return { mois:mo, expr:`0.25*${fmtMois(Math.min(y,10))}`+(y>10?`+0.4*${fmtMois(y-10)}`:''), doubleSiInaptP:true, lignes:[`Commerces de détail non alimentaires (art. 4) : 1/4 de mois par année jusqu'à 10 ans${y>10?', puis 1/3 + 1/15 de mois par année à partir de 10 ans':''} = ${fmtMois(mo)} mois`] };
    } },
  '0843': { ...base0, nom:'Boulangerie-pâtisserie artisanale (IDCC 0843)',
    notes:['Licenciement : renvoi au légal (seuil d\'ancienneté contradictoire : 1 ou 2 ans).','Départ et mise à la retraite : mêmes paliers dès 10 ans ; au-dessous, mise à la retraite = licenciement.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet'){
        const mo=palierMois(c.mois,[[10,1],[15,1.5],[20,2],[25,2.5],[30,3],[35,3.5],[40,4]]);
        if(mo>0) return { mois:mo, expr:String(mo), lignes:[palierTxt('Boulangerie '+(motif==='miseRet'?'mise à la retraite':'départ retraite'),c.mois/12,mo)] };
      }
      return renvoiLegal(motif,c,'Boulangerie');
    } },
  '1505': { ...base0, nom:'Commerce de détail alimentaire non spécialisé (IDCC 1505)',
    notes:['Art. 21 : ¼ de mois par année jusqu\'à 10 ans, ⅓ au-delà, dès 8 mois : identique au légal.','Retraite (art. 23.4) : départ volontaire après 2 ans d\'ancienneté, 1/10 de mois par année, plafond 3 mois ; mise à la retraite au moins égale à l\'indemnité légale de licenciement.'],
    conv(motif, c){
      if(motif==='departRet'){
        if(c.mois<24) return { mois:0, expr:'0', lignes:['Commerce alimentaire non spécialisé (art. 23.4.1) : moins de 2 ans d\'ancienneté, pas d\'indemnité conventionnelle de départ.'] };
        let mo=c.mois/120; const l=[`Commerce alimentaire non spécialisé (art. 23.4.1) : 1/10 de mois par année × ${fmtMois(c.mois/12)} an(s) = ${fmtMois(mo)} mois`];
        if(mo>3){ mo=3; l.push('Plafond de 3 mois appliqué.'); }
        return { mois:mo, expr:String(mo), lignes:l };
      }
      return renvoiLegal(motif,c,'Commerce alimentaire non spécialisé (art. 21 et 23.4.2)'); } },
  '2216': { ...base0, nom:'Commerce de détail et de gros à prédominance alimentaire (IDCC 2216)', categories:[['nc','Ouvriers, employés et agents de maîtrise'],['cadre','Cadres']],
    notes:['Licenciement (annexes I à III, art. 7) : après 8 mois d\'ancienneté, ouvriers, employés et agents de maîtrise 1/4 de mois par année jusqu\'à 10 ans puis 1/3 ; cadres 1/4 jusqu\'à 5 ans, puis 3/10 jusqu\'à 10 ans, 4/10 de 10 à 20 ans, 5/10 au-delà, plafond de 12 mois, plus 1/3 de mois par année au-delà de 40 ans.','Licenciement économique (licenciement pour motif économique) : majoration de 20 % à plus de 50 ans (cadres : 50 ans et plus, légal ou majoration, le plus favorable). Les exclusions de la majoration (reclassement aidé, allocation chômage jusqu\'à la retraite à taux plein, préretraite, retraite sans abattement) ne sont pas vérifiées.','Retraite (art. 8) : départ volontaire des ouvriers, employés et agents de maîtrise avec 10 ans d\'ancienneté, 2/20 de mois par année jusqu\'à 10 ans et 3/20 au-delà, plafond 4 mois ; cadres avec 5 ans, 2/20 jusqu\'à 10 ans, 3/20 de 10 à 20 ans, 5/20 au-delà, plafond 6 mois ; mise à la retraite : au moins l\'indemnité de licenciement de l\'article 7. Base : salaire « plein tarif » (plus favorable des moyennes 12 et 3 mois).'],
    conv(motif, c){
      const y=c.mois/12; const cad=c.categorie==='cadre';
      if(motif==='departRet'){
        if(y<(cad?5:10)) return { mois:0, expr:'0', lignes:[`Grande distribution alimentaire (art. 8.2) : ${cad?'5':'10'} ans d'ancienneté requis, pas d'allocation conventionnelle de départ.`] };
        let mo, cap;
        if(cad){ mo=0.1*Math.min(y,10)+0.15*clamp(y,10,20)+0.25*Math.max(0,y-20); cap=6; }
        else { mo=0.1*Math.min(y,10)+0.15*Math.max(0,y-10); cap=4; }
        const l=[`Grande distribution alimentaire, départ en retraite (annexe ${cad?'III':'I ou II'}, art. 8.2) : 2/20 de mois par année jusqu'à 10 ans${cad?', 3/20 de 10 à 20 ans, 5/20 au-delà':', 3/20 au-delà'} = ${fmtMois(mo)} mois`];
        if(mo>cap){ mo=cap; l.push(`Plafond de ${cap} mois appliqué.`); }
        return { mois:mo, expr:String(mo), lignes:l };
      }
      if(c.mois<8) return { mois:0, expr:'0', lignes:['Grande distribution alimentaire : moins de 8 mois d\'ancienneté, pas d\'indemnité.'] };
      const eco = motif==='lic' && c.eco;
      let mo, l;
      if(cad){
        mo = y<=5 ? 0.25*y : 0.3*Math.min(y,10)+0.4*clamp(y,10,20)+0.5*Math.max(0,y-20); l=[`Grande distribution cadres (annexe III, art. 7) : ${y<=5?'1/4 par année':'3/10, 4/10 puis 5/10 par tranches'} = ${fmtMois(mo)} mois`];
        if(mo>12){ mo=12; l.push('Plafond de 12 mois appliqué.'); }
        if(y>40){ mo+=(1/3)*(y-40); l.push('Supplément de 1/3 de mois par année au-delà de 40 ans.'); }
        if(eco && c.age!==null && c.age>=50){ mo*=1.2; l.push('Majoration de 20 % (licenciement économique, 50 ans et plus).'); }
      } else {
        mo=0.25*Math.min(y,10)+(1/3)*Math.max(0,y-10); l=[`Grande distribution ouvriers, employés, agents de maîtrise (annexes I et II, art. 7) : 1/4 de mois par année jusqu'à 10 ans${y>10?', puis 1/3':''} = ${fmtMois(mo)} mois`];
        if(eco && c.age!==null && c.age>50){ mo*=1.2; l.push('Majoration de 20 % (licenciement économique, plus de 50 ans).'); }
      }
      if(motif==='miseRet') l.unshift('Mise à la retraite (art. 8.3) : au moins l\'indemnité de licenciement de l\'article 7.');
      return { mois:mo, expr:String(mo), doubleSiInaptP:motif!=='miseRet', lignes:l };
    } },
  '2098': { ...base0, nom:'Prestataires de services du secteur tertiaire (IDCC 2098)', ageMajoration:true, categories:[['nc','Non-cadres'],['cadre','Cadres']],
    notes:['Cadres (avenant cadres, art. 3.1) : 2 ans d\'ancienneté, 3/10, 4/10, 5/10 puis 6/10 de mois par année selon les tranches 0-5, 5-10, 10-15 et au-delà de 15 ans ; majoration de 10 % (50 à 55 ans) ou 25 % (55 ans et plus, seuil de 55 ans lu comme le simulateur officiel) ; plafond de 18 mois majoration comprise.','Seuil de 2 ans retenu pour les non-cadres (tableaux de la synthèse).','Retraite : seuls les cadres ont une allocation conventionnelle (avenant cadres, art. 3.2 : ½ mois de 2 à 5 ans, 1 mois dès 5 ans, puis 2, 3, 4, 5 et 6 mois dès 10, 15, 20, 25 et 30 ans ; lue par paliers, le texte parlant d\'un calcul proportionnel pour chaque période entamée). Non-cadres : minimum légal. Conditions de retraite à taux plein non vérifiées.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet'){
        if(c.categorie!=='cadre') return renvoiLegal(motif,c,'Prestataires tertiaire non-cadres (aucune allocation conventionnelle de départ relevée dans la convention)');
        const y0=c.mois/12; if(y0<2) return zero('Prestataires tertiaire cadres (avenant cadres, art. 3.2)',2);
        const mo=palierMois(c.mois,[[2,0.5],[5,1],[10,2],[15,3],[20,4],[25,5],[30,6]]);
        return { mois:mo, expr:String(mo), baseKey:'sr12', lignes:[palierTxt('Prestataires tertiaire cadres, allocation de départ à la retraite (avenant cadres, art. 3.2)',y0,mo)+' Rémunération des 12 derniers mois.'] };
      }
      const y=c.mois/12; if(y<2) return zero('Prestataires tertiaire',2);
      let mo, l;
      if(c.categorie==='cadre'){
        mo=0.3*Math.min(y,5)+0.4*clamp(y,5,10)+0.5*clamp(y,10,15)+0.6*Math.max(0,y-15); l=[`Tertiaire cadres : 3/10, 4/10, 5/10 puis 6/10 de mois par année selon la tranche = ${fmtMois(mo)} mois`];
        if(c.age!==null){ if(c.age>=55){ mo*=1.25; l.push('Majoration de 25 % (55 ans et plus).'); } else if(c.age>=50){ mo*=1.1; l.push('Majoration de 10 % (50 à 55 ans).'); } }
        if(mo>18){ mo=18; l.push('Plafond de 18 mois appliqué (majoration comprise).'); }
      } else {
        mo=0.1*Math.min(y,5)+(1/7)*clamp(y,5,10)+0.2*clamp(y,10,20)+0.25*clamp(y,20,30)+(1/3)*Math.max(0,y-30); l=[`Tertiaire non-cadres : 1/10, 1/7, 1/5, 1/4 puis 1/3 de mois par année selon la tranche = ${fmtMois(mo)} mois`];
        if(mo>12){ mo=12; l.push('Plafond de 12 mois appliqué.'); }
      }
      return { mois:mo, expr:String(mo), doubleSiInaptP:true, lignes:l };
    } },
  '0787': { ...base0, nom:'Experts-comptables et commissaires aux comptes (IDCC 0787)',
    notes:['Licenciement et mise à la retraite : renvoi au légal.','Départ volontaire : ½ mois dès 5 ans ; la « majoration de 1/10 par année complète » est lue comme 1/10 de mois par année complète au-delà de 5 ans (à valider).'],
    conv(motif, c){
      if(motif==='departRet'){
        const y=Math.floor(c.mois/12); if(y<5) return zero('Experts-comptables départ retraite',5);
        const mo=0.5+0.1*(y-5);
        const avert = c.srLast>0
          ? `Experts-comptables, départ volontaire : base retenue = la plus favorable des trois entre la moyenne 12 mois (${fmtEur(c.sr12)}), la moyenne 3 mois (${fmtEur(c.sr3)}) et le dernier salaire mensuel (${fmtEur(c.srLast)}). L'article 6.2.4.1 ne vise que le dernier salaire mensuel (prime d'ancienneté incluse, congés payés exclus) : lecture plus favorable retenue, à valider.`
          : `Experts-comptables, départ volontaire : le texte vise le dernier salaire mensuel ; faute de mois renseigné, la base retenue est la plus favorable des moyennes 12 et 3 mois (à valider).`;
        return { mois:mo, expr:`0.5+0.1*${y-5}`, baseKey:'srMax3', avert, lignes:[`Experts-comptables départ retraite : ½ mois à 5 ans + 1/10 de mois par année complète au-delà (${y-5}) = ${fmtMois(mo)} mois`] };
      }
      return renvoiLegal(motif,c,'Experts-comptables');
    } },
  '1996': { ...base0, nom:'Pharmacie d\'officine (IDCC 1996)',
    categories:[['nc','Non-cadres'],['cadre','Cadres']],
    notes:['Départ volontaire : paliers 10/15/20/25/30 ans.','Licenciement (art. 21 et annexe cadres, art. 6) : non-cadres 1/4 de mois par année jusqu\'à 10 ans puis 3,34/10 à compter de la 11e année ; cadres 1/4 sous 5 ans, puis 3/10 jusqu\'à 15 ans et 5/10 à compter de la 16e année. Cadres de 5 ans et plus licenciés pour motif économique : 3/10 jusqu\'à 10 ans, 3,34/10 de la 11e à la 15e année, 5/10 ensuite (licenciement pour motif économique). Ancienneté appréciée à la fin du préavis dans le texte : date de sortie saisie ici.','Mise à la retraite : « au moins l\'indemnité de licenciement légale ou conventionnelle » : non modélisée (légal appliqué).'],
    conv(motif, c){
      if(motif==='departRet'){ const mo=palierMois(c.mois,[[10,0.5],[15,1],[20,1.5],[25,2],[30,2.5]]); return { mois:mo, expr:String(mo), lignes:[palierTxt('Pharmacie départ retraite',c.mois/12,mo)] }; }
      if(motif==='miseRet') return NM('Pharmacie d\'officine : mise à la retraite non modélisée.','Mise à la retraite non modélisée : seul le minimum légal est calculé.');
      if(c.mois<8) return { mois:0, expr:'0', lignes:['Pharmacie d\'officine (art. 21) : moins de 8 mois d\'ancienneté, pas d\'indemnité.'] };
      const y=c.mois/12; let mo, expr, l;
      if(c.categorie==='cadre' && y>=5 && c.eco){
        mo=0.3*Math.min(y,10)+0.334*clamp(y,10,15)+0.5*Math.max(0,y-15); expr=String(mo);
        l=`Pharmacie cadres de 5 ans et plus, licenciement économique (annexe, art. 6 a) : 3/10 de mois par année jusqu'à 10 ans${y>10?', 3,34/10 de la 11e à la 15e année':''}${y>15?', 5/10 à compter de la 16e':''} = ${fmtMois(mo)} mois`;
      } else if(c.categorie==='cadre' && y>=5){
        mo=0.3*Math.min(y,15)+0.5*Math.max(0,y-15); expr=y<=15?`0.3*${yf(c.mois)}`:`0.3*15+0.5*${yf(c.mois-180)}`;
        l=`Pharmacie cadres de 5 ans et plus (annexe, art. 6 b) : 3/10 de mois par année jusqu'à 15 ans${y>15?', 5/10 à compter de la 16e année':''} = ${fmtMois(mo)} mois`;
      } else if(c.categorie==='cadre'){
        mo=y/4; expr=`${yf(c.mois)}/4`; l=`Pharmacie cadres de moins de 5 ans (annexe, art. 6) : ${fmtMois(y)} an(s) × 1/4 = ${fmtMois(mo)} mois`;
      } else {
        mo=0.25*Math.min(y,10)+0.334*Math.max(0,y-10); expr=y<=10?`${yf(c.mois)}/4`:`0.25*10+0.334*${yf(c.mois-120)}`;
        l=`Pharmacie non-cadres (art. 21) : 1/4 de mois par année jusqu'à 10 ans${y>10?', 3,34/10 à compter de la 11e année':''} = ${fmtMois(mo)} mois`;
      }
      return { mois:mo, expr, doubleSiInaptP:true, lignes:[l] };
    } },
  '1483': { ...base0, nom:'Commerce de détail habillement et textiles (IDCC 1483)', ageMajoration:true, categories:[['nc','Non-cadres'],['cadre','Personnel d\'encadrement']],
    notes:['Licenciement (art. 17 et 18 chap. I, art. 11 chap. II) : non-cadres 1/5 de mois par année jusqu\'à 10 ans puis 1/3 au-delà ; encadrement 1/5 de 1 à 5 ans, puis 1/4 par année dès la première année, 1/3 au-delà de 16 ans ; majoration de 25 % pour l\'encadrement licencié à 50 ans et plus avec 15 ans de présence. Seuil de 1 an. Années incomplètes au prorata.','Retraite : non modélisée (légal appliqué).'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet') return NM('Commerce de détail habillement : retraite non modélisée.','Retraite non modélisée : seul le minimum légal est calculé.');
      const y=c.mois/12; if(y<1) return zero('Habillement et textiles',1);
      if(c.categorie==='cadre'){
        let mo=y<5?0.2*y:0.25*Math.min(y,16)+(1/3)*Math.max(0,y-16); const l=[`Habillement, encadrement (art. 11) : ${y<5?'1/5 de mois par année':'1/4 par année'}${y>16?' puis 1/3 au-delà de 16 ans':''} = ${fmtMois(mo)} mois`];
        if(c.age!==null && c.age>=50 && y>=15){ mo*=1.25; l.push('Majoration de 25 % (50 ans et plus, 15 ans de présence).'); }
        return { mois:mo, expr:String(mo), doubleSiInaptP:true, lignes:l };
      }
      const mo=0.2*Math.min(y,10)+(1/3)*Math.max(0,y-10);
      return { mois:mo, expr:String(mo), doubleSiInaptP:true, lignes:[`Habillement, non-cadres (art. 17) : 1/5 de mois par année jusqu'à 10 ans${y>10?' puis 1/3 au-delà':''} = ${fmtMois(mo)} mois`] };
    } },
  '7018': { ...base0, nom:'Entreprises du paysage (IDCC 7018)', conv(){ return NM('Barème non relevé.','Barème non relevé : seul le minimum légal est calculé.'); }, notes:['Avenant 47 (retraite, ouvriers/employés/TAM) applicable à compter du 1er juillet 2026 : non relevé.'] },
  '1518': { ...base0, nom:'Éducation, culture, loisirs, animation (IDCC 1518)',
    notes:['Seuil d\'ancienneté : 1 an. Taux : ¼ de mois par année jusqu\'à 10 ans, ⅓ à partir de la 11e année (tableau retenu ; la synthèse cite aussi la formule 1/5 + 2/15).','Retraite : renvoi à l\'indemnité de licenciement pour motif personnel (art. 4.4.3.2).'],
    conv(motif, c){
      const y=c.mois/12; if(y<1) return zero('Animation',1);
      const mo=legalMois(c.mois); return { mois:mo, expr:legalExpr(c.mois), doubleSiInaptP:true, lignes:[`Animation (art. 4.4.3.2) : 1/4 de mois par année jusqu'à 10 ans, 1/3 au-delà = ${fmtMois(mo)} mois`] };
    } },
  '3127': { ...base0, nom:'Services à la personne — entreprises (IDCC 3127)', conv(){ return NM('Barème non relevé.','Barème non relevé : seul le minimum légal est calculé.'); }, notes:['Aucun barème conventionnel confirmé à ce stade.'] },
  '3043': { ...base0, nom:'Propreté et services associés (IDCC 3043)', conv(){ return NM('Barème non relevé.','Barème non relevé : seul le minimum légal est calculé.'); }, notes:['Aucun barème conventionnel confirmé à ce stade.'] }
});

/* ---------- Rangs 31 à 50 (V3.5) : barèmes relus dans KALI (texte en vigueur) et recoupés avec le simulateur officiel quand il couvre la convention ---------- */
const NONREL = (lab) => ({ mois:0, expr:'0', lignes:[lab+' : barème conventionnel non relevé (texte absent de la base KALI ouverte), seul le minimum légal est calculé.'], nonModelise:true, avert:'Texte conventionnel non relevé : vérifier sur Légifrance avant de retenir le minimum légal.' });
Object.assign(CCN, {
  '1702': { ...base0, nom:'Travaux publics — ouvriers (IDCC 1702)', ageMajoration:true,
    notes:['Art. 10.3 : indemnité due à l\'ouvrier qui ne peut pas prétendre à une pension vieillesse à taux plein (à contrôler). Salaire : plus favorable des moyennes 3 et 12 mois (art. 10.5).','Majoration de 10 % au-delà de 55 ans (à l\'expiration du préavis) ; licenciement économique : complément de 35/100 de mois (5 ans et plus) ou +70 % (2 à 5 ans).'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet') return NM('TP ouvriers (retraite)','Retraite TP ouvriers : dispositions propres non relevées, minimum légal retenu.');
      const y=c.mois/12; if(y<2) return zero('TP ouvriers',2);
      let b = y<=5 ? 0.1*y : 0.15*y + 0.05*Math.max(0,y-15); const l=[`TP ouvriers (art. 10.3) : ${y<=5?'1/10 de mois par année (2 à 5 ans)':'3/20 de mois par année depuis l\'entrée'+(y>15?' + 1/20 au-delà de 15 ans':'')} = ${fmtMois(b)} mois`];
      let mo=b; const maj=(c.age!==null&&c.age>55)?0.1*b:0; if(maj){ mo+=maj; l.push('Majoration de 10 % (plus de 55 ans) : +'+fmtMois(maj)+' mois.'); }
      if(c.eco && motif==='lic'){ if(y>=5){ mo+=0.35; l.push('Licenciement économique : complément forfaitaire de 35/100 de mois (5 ans et plus) : +0,35 mois.'); } else { mo+=0.7*b; l.push('Licenciement économique (2 à 5 ans) : complément de 70 % de l\'indemnité : +'+fmtMois(0.7*b)+' mois.'); } }
      return { mois:mo, expr:String(mo), lignes:l };
    } },
  '2614': { ...base0, nom:'Travaux publics — ETAM (IDCC 2614)', ageMajoration:true,
    notes:['Art. 8.4 et 8.5 : barème identique à celui des ETAM du bâtiment. Assiette conventionnelle : dernier mois + 1/12 des éléments variables ; ici plus favorable des moyennes 12 / 3 mois.'],
    conv(motif, c){
      if(motif==='departRet') return NM('TP ETAM (départ à la retraite)','Départ à la retraite TP ETAM : dispositions propres non relevées, minimum légal retenu.');
      if(motif==='miseRet') return NM('TP ETAM (mise à la retraite, art. 8.7)','Mise à la retraite TP ETAM (art. 8.7) non modélisée : minimum légal retenu.');
      if(c.age!==null && c.age>=65) return NM('TP ETAM (65 ans et plus)','ETAM de 65 ans et plus : art. 8.7 non modélisé, minimum légal retenu.');
      const y=c.mois/12; if(y<2) return zero('TP ETAM',2);
      let mo=0.25*Math.min(y,15)+0.35*Math.max(0,y-15); const l=[`TP ETAM (art. 8.5) : 2,5/10 de mois par année jusqu'à 15 ans + 3,5/10 au-delà = ${fmtMois(mo)} mois`];
      if(mo>10){ mo=10; l.push('Plafond de 10 mois appliqué.'); }
      if(c.age!==null && c.age>55){ mo*=1.1; l.push('Majoration de 10 % (plus de 55 ans, ajoutée après plafond).'); }
      return { mois:mo, expr:String(mo), lignes:l };
    } },
  '1266': { ...base0, nom:'Restauration de collectivités (IDCC 1266)', categories:[['nc','Non-cadres'],['cadre','Cadres']],
    notes:['Art. 14 : salariés licenciés avant 65 ans, 1 an d\'ancienneté ; salaire : plus favorable de 1/12 des 12 derniers mois ou 1/3 des 3 derniers mois (primes annuelles au prorata).','Retraite (art. 35) : barème propre non modélisé.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet') return NM('Restauration de collectivités (retraite, art. 35)','Retraite : indemnité de départ de l\'art. 35 non modélisée, minimum légal retenu.');
      if(c.age!==null && c.age>=65) return NM('Restauration de collectivités (65 ans et plus)','Salarié de 65 ans et plus : pas d\'indemnité conventionnelle de licenciement (art. 14), minimum légal retenu.');
      const y=c.mois/12; if(y<1) return zero('Restauration de collectivités',1);
      let mo, l;
      if(c.categorie==='cadre'){ mo=0.2*y+(1/15)*clamp(y,5,10)+(2/15)*clamp(y,10,15)+(3/15)*Math.max(0,y-15); l=[`Cadres (art. 14) : 1/5 de mois par année + 1/15 de 5 à 10 ans + 2/15 de 10 à 15 ans + 3/15 au-delà de 15 ans = ${fmtMois(mo)} mois (le plus favorable de ce barème et du légal s'applique)`]; }
      else { mo=0.2*y+(2/15)*Math.max(0,y-10); l=[`Non-cadres (art. 14) : 1/5 de mois par année + 2/15 par année au-delà de 10 ans = ${fmtMois(mo)} mois`]; }
      return { mois:mo, expr:String(mo), lignes:l };
    } },
  '1516': { ...base0, nom:'Organismes de formation (IDCC 1516)',
    notes:['Art. 9.2 (avenant du 6 février 2023) : 8 mois d\'ancienneté ; 1/4 de mois par année jusqu\'à 10 ans, 1/3 au-delà (= barème légal). Salaire : plus favorable de 1/12 des 12 derniers mois ou du mois le plus élevé des 3 derniers (primes au prorata).','Retraite : dispositions propres non relevées.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet') return NM('Organismes de formation (retraite)','Retraite : dispositions propres non relevées, minimum légal retenu.');
      const y=c.mois/12; if(c.mois<8) return { mois:0, expr:'0', lignes:['Organismes de formation : moins de 8 mois d\'ancienneté.'] };
      const mo=0.25*Math.min(y,10)+(1/3)*Math.max(0,y-10);
      return { mois:mo, expr:String(mo), lignes:[`Organismes de formation (art. 9.2) : 1/4 de mois par année jusqu'à 10 ans + 1/3 au-delà = ${fmtMois(mo)} mois`], doubleSiInaptP:true };
    } },
  '1404': { ...base0, nom:'Maintenance, distribution et location de matériels — SDLM (IDCC 1404)',
    notes:['Recoupement avec le simulateur officiel : conventionnel = légal pour le licenciement. Texte relu partiellement (la base KALI ne remonte pas l\'article par mot-clé) : à confirmer.'],
    conv(motif, c){ return renvoiLegal(motif,c,'SDLM'); } },
  '0675': { ...base0, nom:'Succursales de vente au détail d\'habillement (IDCC 0675)', categories:[['emp','Employés'],['am','Agents de maîtrise'],['cadre','Cadres']], ageMajoration:true,
    notes:['Avenants maîtrise (art. 11) et cadres (art. 16) : barèmes relevés ; employés : pas de barème propre (légal).','Fin de carrière (art. 44) : moitié de l\'indemnité de licenciement, non modélisée.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet') return NM('Succursales habillement (fin de carrière)','Allocation de fin de carrière (moitié de l\'indemnité de licenciement) non modélisée : minimum légal retenu.');
      const y=c.mois/12;
      if(c.categorie==='emp'||!c.categorie) return { mois:0, expr:'0', lignes:['Succursales habillement (employés) : pas de barème conventionnel propre, minimum légal appliqué.'] };
      if(y<2) return zero('Succursales habillement',2);
      let mo, cap, l;
      if(c.categorie==='am'){ mo=0.1*Math.min(y,10)+0.4*Math.max(0,y-10); cap=9; l=[`Agents de maîtrise (art. 11) : 1/10 de mois par année jusqu'à 10 ans + 2/5 au-delà = ${fmtMois(mo)} mois (plafond de 6 mois prévu en cas de licenciements collectifs pour difficultés économiques : non appliqué)`]; }
      else { mo=(y<=5?0.1*y:0.2*Math.min(y,15))+0.4*Math.max(0,y-15); cap=12; l=[`Cadres (art. 16) : 1/10 de mois par année (2 à 5 ans), puis 1/5 depuis l'entrée jusqu'à 15 ans${y>15?' + 2/5 au-delà de 15 ans':''} = ${fmtMois(mo)} mois`]; }
      if(c.age!==null&&c.age>=50&&y>=20){ mo*=1.5; cap*=1.5; l.push('Majoration de 50 % (50 ans et plus, 20 ans de présence) de l\'indemnité et du plafond'+(c.categorie==='cadre'?' (constatée par le simulateur officiel)':'')+'.'); }
      if(mo>cap){ mo=cap; l.push(`Plafond de ${fmtMois(cap)} mois appliqué.`); }
      return { mois:mo, expr:String(mo), lignes:l };
    } },
  '0413': { ...base0, nom:'Établissements pour personnes inadaptées et handicapées — CCN 66 (IDCC 0413)', categories:[['nc','Non-cadres'],['cadre','Cadres']],
    notes:['Art. 17 (non étendu) : 1/2 mois par année dès 2 ans, plafond 6 mois, salaire moyen des 3 derniers mois. Cadres (annexe 6) : dépend de la part d\'ancienneté acquise comme cadre, non modélisé.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet') return NM('CCN 66 (retraite)','Retraite CCN 66 : dispositions propres non relevées, minimum légal retenu.');
      if(c.categorie==='cadre') return NM('CCN 66 (cadres)','Cadres CCN 66 : barème (1/2 mois non-cadre + 1 mois cadre, plafond 12 mois) dépend de la répartition de l\'ancienneté : non modélisé.');
      const y=c.mois/12; if(y<2) return zero('CCN 66',2);
      let mo=0.5*y; const l=[`CCN 66 non-cadres (art. 17) : 1/2 mois par année = ${fmtMois(mo)} mois`]; if(mo>6){ mo=6; l.push('Plafond de 6 mois appliqué.'); }
      return { mois:mo, expr:String(mo), lignes:l, baseKey:'sr3' };
    } },
});
[['3032','Esthétique, parfumerie'],['1431','Optique-lunetterie de détail'],['2378','Intérimaires des entreprises de travail temporaire'],['1413','Permanents des entreprises de travail temporaire'],['3237','Commerce de détail alimentaire spécialisé'],['2332','Entreprises d\'architecture'],['3090','Spectacle vivant privé'],['2335','Agences générales d\'assurances'],['1880','Négoce de l\'ameublement'],['3212','Travaux publics — cadres'],['1285','Entreprises artistiques et culturelles'],['3216','Négoce des matériaux de construction'],['1539','Bureau et numérique, commerces et services']].forEach(([id,nom])=>{
  CCN[id]={ ...base0, nom:nom+' (IDCC '+id+')', conv(){ return NONREL(nom); }, notes:['Texte absent de la base KALI ouverte et du simulateur officiel : barème conventionnel à relever sur Légifrance. Seul le minimum légal est calculé.'] };
});
{ const c1090=CCN['1090'].conv;
  CCN['1090'].conv=(m,c)=> m==='departRet' ? renvoiLegal(m,c,'Automobile (vos fiches IFC : conventionnel = légal)') : c1090(m,c); }


/* ===== Rangs 51 à 70 (V3.26) ===== */
Object.assign(CCN, {
  '2120': { ...base0, nom:'Banque (IDCC 2120)', basis:'sr12',
    notes:['Art. 26.2 (relu dans KALI) : 1 an d\'ancienneté ; 1/5 de mensualité par semestre complet acquis depuis le 01/01/2002 ; total limité à 15 mensualités (embauchés à partir de 2000).','Non modélisé : semestres acquis avant 2002 (1/2 × 13/14,5 de mensualité), plafonds de 24 ou 18 mensualités pour les embauchés avant 2000, et retraite (art. 31, non relevé).','Mensualité = 1/13 du salaire de base annuel : si le 13e mois est inclus dans la moyenne des 12 mois, l\'assiette saisie est à ajuster. Le simulateur officiel applique 1/5 par semestre sur le salaire de référence saisi.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet') return NM('Banque (retraite)','Indemnités de retraite de la convention de la banque (art. 31) non relevées : minimum légal retenu.');
      if(c.mois<12) return zero('Banque (art. 26.2)',1);
      const sem=Math.floor(c.mois/6); let mo=0.2*sem; const l=[`Banque (art. 26.2) : 1/5 de mensualité par semestre complet = ${sem} semestre(s) → ${fmtMois(mo)} mensualité(s)`];
      if(mo>15){ mo=15; l.push('Plafond de 15 mensualités appliqué.'); }
      return { mois:mo, expr:`0.2*${sem}`, lignes:l, doubleSiInaptP:true };
    } },
  '0086': { ...base0, nom:'Publicité et assimilées (IDCC 0086)', categories:[['emp','Employés'],['tam','Techniciens et agents de maîtrise'],['cadre','Cadres']],
    notes:['Licenciement (art. 31, 50 et 69, texte relu dans KALI) : 2 ans d\'ancienneté ; 33 % de mois par année jusqu\'à 15 ans, 40 % au-delà ; fraction d\'année au prorata des mois. Recoupé avec le simulateur officiel. « Derniers appointements » : assiette lue comme la plus favorable (point ambigu).','Départ volontaire et mise à la retraite (art. 32, 51 et 70) : 1/4 de mois par année de présence (cadres : 1/4 pendant 10 ans puis 1/3), majoré d\'une prime de fidélité de 5 % (20 ans), 10 % (25), 15 % (30) ou 20 % (35).'],
    conv(motif, c){
      const y=c.mois/12;
      if(motif==='departRet'||motif==='miseRet'){
        let mo = c.categorie==='cadre' ? 0.25*Math.min(y,10)+(1/3)*Math.max(0,y-10) : 0.25*y;
        const f = y>=35?0.2:y>=30?0.15:y>=25?0.10:y>=20?0.05:0;
        const l=[`Publicité (${motif==='miseRet'?'mise à la retraite':'départ volontaire'}) : ${c.categorie==='cadre'?'1/4 de mois par année jusqu\'à 10 ans, puis 1/3':'1/4 de mois par année'} = ${fmtMois(mo)} mois`];
        if(f>0){ mo*=1+f; l.push(`Prime de fidélité de ${Math.round(f*100)} % (${Math.floor(y)} ans de présence) = ${fmtMois(mo)} mois`); }
        return { mois:mo, expr:String(mo), lignes:l };
      }
      if(y<2) return zero('Publicité (art. 31, 50, 69)',2);
      const mo=0.33*Math.min(y,15)+0.40*Math.max(0,y-15);
      return { mois:mo, expr:`0.33*${fmtMois(Math.min(y,15))}`+(y>15?`+0.40*${fmtMois(y-15)}`:''), lignes:[`Publicité : 33 % de mois par année jusqu'à 15 ans${y>15?', puis 40 % au-delà':''} = ${fmtMois(mo)} mois (non cumulable avec l'indemnité légale : le plus favorable est retenu)`], doubleSiInaptP:true };
    } },
  '2941': { ...base0, nom:'Aide, accompagnement, soins et services à domicile — BAD (IDCC 2941)',
    notes:['Licenciement (art. 26.1 b, relu dans KALI) : 8 mois d\'ancienneté, 1/4 de mois par année jusqu\'à 10 ans puis 1/3 : identique au barème légal. Recoupé avec le simulateur officiel.','Mise à la retraite (art. 29.2 a) : 2 ans d\'ancienneté, 1/5 de mois par année + 2/15 par année au-delà de 10 ans. Départ volontaire (art. 29.2 b) : 1/2 mois dès 5 ans, 1 mois dès 10 ans, puis +1/2 mois tous les 5 ans jusqu\'à 3 mois à 30 ans.'],
    conv(motif, c){
      if(motif==='departRet'){ const mo=palierMois(c.mois,[[5,0.5],[10,1],[15,1.5],[20,2],[25,2.5],[30,3]]); if(mo>0) return { mois:mo, expr:String(mo), lignes:[palierTxt('Aide à domicile départ retraite (art. 29.2 b)',c.mois/12,mo)] }; return renvoiLegal(motif,c,'BAD'); }
      if(motif==='miseRet'){ if(c.mois<24) return zero('BAD mise à la retraite (art. 29.2 a)',2); const y=c.mois/12; const mo=0.2*y+(2/15)*Math.max(0,y-10); return { mois:mo, expr:`0.2*${fmtMois(y)}`+(y>10?`+(2/15)*${fmtMois(y-10)}`:''), lignes:[`BAD mise à la retraite (art. 29.2 a) : 1/5 de mois par année${y>10?' + 2/15 par année au-delà de 10 ans':''} = ${fmtMois(mo)} mois`] }; }
      return renvoiLegal(motif,c,'BAD (art. 26.1 b = légal)');
    } },
  '0029': { ...base0, nom:'Établissements privés d\'hospitalisation, de soins, de cure et de garde à but non lucratif — CCN 51 / FEHAP (IDCC 0029)',
    notes:['Art. 15.02.3 (relu dans KALI, texte non étendu) : « il est fait application des dispositions légales et réglementaires » pour l\'indemnité de licenciement ; assiette = la plus favorable entre 1/12 des 12 mois et 1/3 des 3 mois.','Indemnités de retraite non relevées : minimum légal retenu.'],
    conv(motif, c){ if(motif==='departRet'||motif==='miseRet') return NM('CCN 51 (retraite)','Indemnités de retraite de la CCN 51 non relevées : minimum légal retenu.'); return renvoiLegal(motif,c,'CCN 51 (art. 15.02.3 = légal)'); } },
  '1351': { ...base0, nom:'Entreprises de prévention et de sécurité (IDCC 1351)', categories:[['emp','Agents d\'exploitation, employés administratifs et techniciens'],['am','Agents de maîtrise'],['cadre','Cadres']],
    notes:['Aucun barème d\'indemnité de licenciement propre trouvé dans le texte KALI : minimum légal retenu (à confirmer sur Légifrance).','Départ en retraite (annexes IV, V et VI, relues dans KALI, étendues sous réserve de R1234-2) : barème par ancienneté et catégorie ; appliqué aussi à la mise à la retraite, sans cumul avec une indemnité de même nature.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet'){
        const L = c.categorie==='cadre' ? [[5,1],[10,2],[15,3],[20,4]] : c.categorie==='am' ? [[5,0.5],[10,1.5],[15,2.5],[20,4]] : [[5,0.5],[10,1],[15,2],[20,3]];
        const mo=palierMois(c.mois,L);
        if(mo>0) return { mois:mo, expr:String(mo), lignes:[palierTxt('Prévention-sécurité '+(motif==='miseRet'?'mise à la retraite':'départ retraite'),c.mois/12,mo)] };
        return renvoiLegal(motif,c,'Prévention-sécurité (moins de 5 ans)');
      }
      return renvoiLegal(motif,c,'Prévention-sécurité');
    } },
  '1557': { ...base0, nom:'Commerce des articles de sports et équipements de loisirs (IDCC 1557)', categories:[['nc','Non-cadres'],['cadre','Cadres']],
    notes:['Art. 80 (texte relu sur une synthèse reprenant le texte officiel) : 1 an de présence continue ; 1/5 de mois par année + 2/15 par année au-delà de 10 ans.','Art. 10 de l\'avenant cadres : cadre de 50 ans et plus avec 20 ans d\'ancienneté en qualité de cadre : indemnité portée à 8 mois si le calcul ordinaire est moins favorable (vérifier que l\'ancienneté est bien acquise comme cadre).','Retraite non relevée : minimum légal retenu.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet') return NM('Articles de sport (retraite)','Indemnités de retraite non relevées : minimum légal retenu.');
      if(c.mois<12) return zero('Articles de sport (art. 80)',1);
      const y=c.mois/12; let mo=0.2*y+(2/15)*Math.max(0,y-10); const l=[`Articles de sport (art. 80) : 1/5 de mois par année${y>10?' + 2/15 par année au-delà de 10 ans':''} = ${fmtMois(mo)} mois`];
      if(c.categorie==='cadre'&&c.age!==null&&c.age>=50&&y>=20&&mo<8){ mo=8; l.push('Cadre de 50 ans et plus, 20 ans d\'ancienneté : indemnité portée à 8 mois (art. 10 avenant cadres).'); }
      return { mois:mo, expr:String(mo), lignes:l, doubleSiInaptP:true };
    } },
  '1982': { ...base0, nom:'Négoce et prestations de services médico-techniques (IDCC 1982)', categories:[['nc','Non-cadres'],['cadre','Cadres']],
    notes:['Art. 16.4 (relu sur une synthèse reprenant le texte officiel) : 2 ans d\'ancienneté ; 1/5 du salaire mensuel moyen par année d\'ancienneté complète ou proratisée ; majoration de 50 % pour les cadres de plus de 48 ans révolus.','La période de calcul de la moyenne mensuelle n\'est pas précisée : assiette la plus favorable retenue. Retraite non relevée.'],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet') return NM('Médico-technique (retraite)','Indemnités de retraite non relevées : minimum légal retenu.');
      if(c.mois<24) return zero('Médico-technique (art. 16.4)',2);
      const y=c.mois/12; let mo=0.2*y; const l=[`Médico-technique (art. 16.4) : 1/5 de mois par année = ${fmtMois(mo)} mois`];
      if(c.categorie==='cadre'&&c.age!==null&&c.age>48){ mo*=1.5; l.push('Cadre de plus de 48 ans révolus : majoration de 50 %.'); }
      return { mois:mo, expr:String(mo), lignes:l, doubleSiInaptP:true };
    } },
  '1978': { ...base0, nom:'Fleuristes, vente et services des animaux familiers (IDCC 1978)',
    notes:['Art. 6.6 (relu sur une synthèse reprenant le texte officiel) : 8 mois d\'ancienneté, 1/4 de mois par année jusqu\'à 10 ans puis 1/3 : identique au barème légal. Des synthèses divergent (1/5 puis 1/3).','Non modélisé : majorations des cadres de 50 ans et plus (10 % puis 15 %, formulation peu claire). Retraite non relevée.'],
    conv(motif, c){ if(motif==='departRet'||motif==='miseRet') return NM('Fleuristes (retraite)','Indemnités de retraite non relevées : minimum légal retenu.'); return renvoiLegal(motif,c,'Fleuristes (art. 6.6 = légal)'); } },
});
[['3254','Boucherie, boucherie-charcuterie-traiteur, poissonnerie'],['1686','Commerces et services de l\'audiovisuel, de l\'électronique et de l\'équipement ménager'],['3253','Cabinets d\'avocats — personnel salarié'],['0804','Voyageurs, représentants, placiers (VRP)'],['2205','Notariat'],['0478','Sociétés financières'],['7025','Travaux agricoles, ruraux et forestiers'],['2219','Taxis'],['2247','Courtage d\'assurances'],['1261','Animation — ALISFA (liens social et familial)'],['1790','Espaces de loisirs, d\'attractions et culturels'],['0759','Pompes funèbres']].forEach(([id,nom])=>{
  CCN[id]={ ...base0, nom:nom+' (IDCC '+id+')', conv(){ return NONREL(nom); }, notes:['Texte absent de la base KALI ouverte et de la plupart des synthèses lisibles : barème conventionnel à relever sur Légifrance. Seul le minimum légal est calculé.'].concat(id==='0804'?['VRP : l\'indemnité de clientèle (L7313-13) et les règles propres aux représentants ne sont pas modélisées.']:[]) };
});


/* ===== Vague 21-32 relue sur Légifrance (V3.27) ===== */
const SAL_FAV = 'Salaire de référence : le plus favorable entre 1/12 des 12 derniers mois et 1/3 des 3 derniers (primes annuelles au prorata).';
Object.assign(CCN, {
  '1619': { ...base0, nom:'Cabinets dentaires (IDCC 1619)',
    notes:['Art. 4.3 (relu sur Légifrance, en vigueur étendu) : 2 ans d\'ancienneté ; de 2 à 4 ans, 1/10 de mois par année (prorata des mois) ; à partir de 4 ans, 1 mois par tranche de 4 ans de présence ou fraction supérieure à 2 ans.','Lecture retenue : tranches de 4 ans entières, plus une tranche pour toute fraction de plus de 2 ans (exemples du texte : 1 mois à 4 ans, 2 mois au-dessus de 6 ans révolus, 2 mois à 8 ans). Le passage de 4 ans (0,4 mois) à 4 ans révolus (1 mois) crée un saut, voulu par le texte.','Art. 4.4 : départ à la retraite : garantie identique à celle du licenciement.',SAL_FAV],
    conv(motif, c){
      const y=c.mois/12;
      if(c.mois<24) return zero('Cabinets dentaires (art. 4.3)',2);
      let mo, l;
      if(c.mois<48){ mo=y/10; l=[`Cabinets dentaires (art. 4.3) : 1/10 de mois par année entre 2 et 4 ans = ${fmtMois(mo)} mois`]; }
      else { const t=Math.floor(c.mois/48); const fr=c.mois-48*t; mo=t+(fr>24?1:0); l=[`Cabinets dentaires (art. 4.3) : ${t} tranche(s) de 4 ans${fr>24?' + 1 pour une fraction supérieure à 2 ans':''} = ${mo} mois`]; }
      return { mois:mo, expr:String(mo), lignes:l, doubleSiInaptP:true };
    } },
  '7018': { ...base0, nom:'Entreprises du paysage (IDCC 7018)',
    notes:['Licenciement (art. 9 et 10 des annexes, relus sur Légifrance) : 8 mois d\'ancienneté, 1/4 de mois par année jusqu\'à 10 ans puis 1/3 : identique au barème légal.','Départ volontaire à la retraite (art. 11 et 12) : plus de 5 ans d\'ancienneté et pension à taux plein : 1/9 de mois par année d\'ancienneté, au prorata des mois complets.','Mise à la retraite (art. 12 et 13) : le plus favorable entre l\'indemnité légale et l\'indemnité de départ conventionnelle ; préavis de 6 mois.',SAL_FAV],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet'){
        const y=c.mois/12;
        if(c.mois>60){ const mo=Math.floor(c.mois)/12/9; return { mois:mo, expr:`${Math.floor(c.mois)}/12/9`, lignes:[`Paysage (art. 11-12) : 1/9 de mois par année d'ancienneté = ${fmtMois(mo)} mois`] }; }
        return renvoiLegal(motif,c,'Paysage (moins de 5 ans)');
      }
      return renvoiLegal(motif,c,'Paysage (art. 9-10 = légal)');
    } },
  '3127': { ...base0, nom:'Services à la personne — entreprises (IDCC 3127)',
    notes:['Licenciement (partie 2, chap. IV, section 1, art. 1.2, relu sur Légifrance) : 1 an d\'ancienneté ; 1/5 de mois par année, plus 2/15 de mois par année au-delà de 10 ans.','Départ volontaire à la retraite (art. 4) : néant avant 10 ans ; 0,5 mois de 10 à 15 ans ; 1 mois de 15 à 20 ans ; 1,5 mois de 20 à 30 ans ; 2 mois au-delà. Aux seuils exacts (15, 20, 30 ans), le texte est ambigu : le palier supérieur est retenu.','Mise à la retraite (art. 3) : conditions et indemnité légales.',SAL_FAV],
    conv(motif, c){
      if(motif==='departRet'){ const mo=palierMois(c.mois,[[10,0.5],[15,1],[20,1.5],[30,2]]); if(mo>0) return { mois:mo, expr:String(mo), lignes:[palierTxt('Services à la personne départ retraite (art. 4)',c.mois/12,mo)] }; return renvoiLegal(motif,c,'Services à la personne (moins de 10 ans)'); }
      if(motif==='miseRet') return renvoiLegal(motif,c,'Services à la personne (art. 3 = légal)');
      if(c.mois<12) return zero('Services à la personne (art. 1.2)',1);
      const y=c.mois/12; const mo=0.2*y+(2/15)*Math.max(0,y-10);
      return { mois:mo, expr:`0.2*${fmtMois(y)}`+(y>10?`+(2/15)*${fmtMois(y-10)}`:''), lignes:[`Services à la personne (art. 1.2) : 1/5 de mois par année${y>10?' + 2/15 par année au-delà de 10 ans':''} = ${fmtMois(mo)} mois`], doubleSiInaptP:true };
    } },
  '3043': { ...base0, nom:'Propreté et services associés (IDCC 3043)',
    notes:['Aucune indemnité de licenciement ou de retraite propre repérée dans le sommaire de la convention en vigueur sur Légifrance (le texte de base ne comporte que des dispositions sur la formation et la certification). À confirmer par une relecture des textes attachés : minimum légal retenu.'],
    conv(){ return NONREL('Propreté'); } },
  '3032': { ...base0, nom:'Esthétique-cosmétique et enseignement lié (IDCC 3032)',
    notes:['Art. 8 (nouvelle rédaction par l\'avenant n° 35 du 14/02/2024, relu sur Légifrance) : préavis et procédure, mais aucune indemnité de licenciement ou de retraite supérieure à la loi : renvoi au barème légal.'],
    conv(motif, c){ return renvoiLegal(motif,c,'Esthétique (art. 8 = légal)'); } },
  '1431': { ...base0, nom:'Optique-lunetterie de détail (IDCC 1431)', categories:[['emp','Employés et ouvriers'],['am','Agents de maîtrise'],['cadre','Cadres']],
    notes:['Licenciement (art. 23 et annexes III et IV, relus sur Légifrance) : 8 mois d\'ancienneté ; 1/4 de mois par année jusqu\'à 10 ans, 1/3 au-delà. Agents de maîtrise : 40 % par année au-delà de 20 ans. Cadres : 40 % par année au-delà de 15 ans, 50 % au-delà de 20 ans. Plafond de 13 mois pour les agents de maîtrise et cadres (10 mois en licenciement collectif économique, sans passer sous le minimum légal).','Non modélisé : le salaire de référence ne peut être inférieur au salaire minimum conventionnel de la catégorie (accord de salaires en vigueur).','Départ volontaire à la retraite (art. 24 et annexes) : allocation de fin de carrière par paliers (« plus de » N ans) selon la catégorie. La mise à la retraite n\'est possible qu\'à partir de 70 ans : employés, indemnité légale ; agents de maîtrise et cadres, barème de l\'allocation, sans pouvoir être inférieur au légal.',SAL_FAV],
    conv(motif, c){
      const y=c.mois/12, cat=c.categorie||'emp';
      if(motif==='departRet'||motif==='miseRet'){
        if(motif==='miseRet'&&cat==='emp') return renvoiLegal(motif,c,'Optique (art. 24 = légal pour la mise à la retraite)');
        const L = cat==='cadre' ? [[5,1.5],[10,3.5],[15,4.5],[20,5.5],[30,6.5]] : cat==='am' ? [[5,1],[10,2.5],[15,3.5],[20,4.5],[30,5.5]] : [[5,1],[10,2],[15,3],[20,4],[28,5]];
        const mo=palierMois(c.mois,L,true);
        if(mo>0) return { mois:mo, expr:String(mo), lignes:[palierTxt('Optique '+(motif==='miseRet'?'mise à la retraite':'allocation de fin de carrière'),y,mo)] };
        return renvoiLegal(motif,c,'Optique (5 ans ou moins)');
      }
      if(c.mois<8) return zero('Optique (art. 23)',0.67);
      let mo=0.25*Math.min(y,10)+(1/3)*Math.max(0,y-10); const l=[`Optique : 1/4 de mois par année jusqu'à 10 ans${y>10?', 1/3 au-delà':''} = ${fmtMois(mo)} mois`];
      if(cat==='am'&&y>20){ mo+=0.4*(y-20)-(1/3)*(y-20); l.push(`Agents de maîtrise : 40 % de mois par année au-delà de 20 ans (au lieu de 1/3) = ${fmtMois(mo)} mois`); }
      if(cat==='cadre'&&y>15){ const a=Math.min(y,20)-15; const b=Math.max(0,y-20); mo+=0.4*a-(1/3)*a+0.5*b-(1/3)*b; l.push(`Cadres : 40 % par année de 15 à 20 ans, 50 % au-delà de 20 ans = ${fmtMois(mo)} mois`); }
      if(cat!=='emp'){ const cap=c.eco?10:13; if(mo>cap){ mo=cap; l.push(`Plafond de ${cap} mois appliqué${c.eco?' (licenciement collectif économique, sans passer sous le minimum légal)':''}.`); } }
      return { mois:mo, expr:String(mo), lignes:l, doubleSiInaptP:true };
    } },
});

/* ===== Vague 36-50 relue sur Légifrance (V3.28) ===== */
const licUnCinq = y => 0.2*y+(2/15)*Math.max(0,y-10);          // 1/5 par année, 2/15 en plus au-delà de 10 ans
Object.assign(CCN, {
  '2378': { ...CCN['2378'], notes:['Aucun texte de convention n\'est publié sous cet IDCC dans Légifrance (0 résultat) : seul le minimum légal est calculé. Pour un intérimaire, l\'indemnité de fin de mission (10 %) relève d\'un autre calcul, non traité ici.'] },
  '1413': { ...CCN['1413'], notes:['Aucun texte de convention n\'est publié sous cet IDCC dans Légifrance (0 résultat) : seul le minimum légal est calculé.'] },
  '2332': { ...base0, nom:'Entreprises d\'architecture (IDCC 2332)',
    notes:['Art. IV.3 (relu sur Légifrance) : 8 mois d\'ancienneté ; 1/4 de mois par année jusqu\'à 10 ans, puis 1/3 ; années incomplètes proratisées : identique au barème légal. Licenciement économique : renvoi aux dispositions du code.','Aucune indemnité de départ ou de mise à la retraite propre à la convention (hors retraite complémentaire) : barème légal.'],
    conv(motif, c){ return renvoiLegal(motif,c,'Architecture (art. IV.3 = légal)'); } },
  '3237': { ...base0, nom:'Commerce de détail alimentaire spécialisé (IDCC 3237)',
    notes:['Licenciement (art. 23, relu sur Légifrance) : identique au barème légal (8 mois, 1/4 puis 1/3).','Départ volontaire à la retraite (art. 25.4.1) : 2 ans d\'ancienneté ; 1/10 de mois par année de présence, plafonné à 3 mois.','Mise à la retraite (art. 25.4.2) : indemnité légale (70 ans).',SAL_FAV],
    conv(motif, c){
      if(motif==='departRet'){
        if(c.mois<24) return zero('Commerce alimentaire spécialisé (art. 25.4.1)',2);
        const mo=Math.min(3,c.mois/12/10); return { mois:mo, expr:String(mo), lignes:[`Commerce alimentaire spécialisé (art. 25.4.1) : 1/10 de mois par année, plafond 3 mois = ${fmtMois(mo)} mois`] };
      }
      return renvoiLegal(motif,c,'Commerce alimentaire spécialisé (art. 23 et 25.4.2 = légal)');
    } },
  '3090': { ...base0, nom:'Spectacle vivant privé (IDCC 3090)',
    notes:['Licenciement (art. 7.8, relu sur Légifrance) : 8 mois ; identique au barème légal.','Mise à la retraite (art. 7.9) : 1/5 de mois par année, plus 2/15 de mois par année au-delà de 10 ans ; le minimum légal reste dû s\'il est plus favorable.','Départ volontaire (art. 7.9) : 1 mois après 10 ans, 2 mois après 20 ans, 3 mois après 30 ans (seuil atteint : palier retenu). Avant 10 ans : légal.',SAL_FAV],
    conv(motif, c){
      if(motif==='miseRet'){ const y=c.mois/12; const mo=licUnCinq(y); return { mois:mo, expr:`0.2*${fmtMois(y)}`+(y>10?`+(2/15)*${fmtMois(y-10)}`:''), lignes:[`Spectacle vivant (art. 7.9) : 1/5 de mois par année${y>10?' + 2/15 au-delà de 10 ans':''} = ${fmtMois(mo)} mois`] }; }
      if(motif==='departRet'){ const mo=palierMois(c.mois,[[10,1],[20,2],[30,3]]); if(mo>0) return { mois:mo, expr:String(mo), lignes:[palierTxt('Spectacle vivant départ retraite (art. 7.9)',c.mois/12,mo)] }; return renvoiLegal(motif,c,'Spectacle vivant (moins de 10 ans)'); }
      return renvoiLegal(motif,c,'Spectacle vivant (art. 7.8 = légal)');
    } },
  '2335': { ...base0, nom:'Agences générales d\'assurances (IDCC 2335)',
    notes:['Licenciement (art. 47, relu sur Légifrance) : 8 mois ; 1/4 jusqu\'à 10 ans puis 1/3, fractions d\'année incluses : identique au légal.','Retraite (art. 49), départ ou mise à la retraite : 1 mois après 5 ans, 2 après 10, 3 après 15, 4 après 20, 5 après 30 ans ; en mise à la retraite, l\'indemnité légale reste due si plus favorable. Seuils : « après » = ancienneté strictement supérieure.',SAL_FAV],
    conv(motif, c){
      if(motif==='departRet'||motif==='miseRet'){ const mo=palierMois(c.mois,[[5,1],[10,2],[15,3],[20,4],[30,5]],true); if(mo>0) return { mois:mo, expr:String(mo), lignes:[palierTxt('Agences d\'assurances retraite (art. 49)',c.mois/12,mo)] }; return renvoiLegal(motif,c,'Agences d\'assurances (5 ans ou moins)'); }
      return renvoiLegal(motif,c,'Agences d\'assurances (art. 47 = légal)');
    } },
  '1880': { ...base0, nom:'Négoce de l\'ameublement (IDCC 1880)', categories:[['nc','Non-cadres'],['cadre','Cadres']],
    notes:['Licenciement (art. 43, relu sur Légifrance) : 1 an d\'ancienneté ; 1/5 de mois par année révolue, plus 2/15 par année au-delà de 10 ans.','Départ à la retraite des non-cadres (art. 44) : barème par année révolue au-dessus de 5 ans, de 0,30 (5 ans) à 1,50 (20 ans), puis + 0,10 par année ; lu comme des mois de salaire (à confirmer). Seuil « supérieure à 5 » : plus de 60 mois.','Non relevés : barème de départ des cadres et mise à la retraite, ramenés au légal.',SAL_FAV],
    conv(motif, c){
      const yr=Math.floor(c.mois/12);
      if(motif==='departRet'&&(c.categorie||'nc')!=='cadre'){
        if(c.mois>60){ const T={5:0.30,6:0.35,7:0.40,8:0.45,9:0.50,10:0.55,11:0.60,12:0.70,13:0.80,14:0.90,15:1.00,16:1.10,17:1.20,18:1.30,19:1.40,20:1.50}; const mo=yr>=20?1.5+0.1*(yr-20):T[yr]; return { mois:mo, expr:String(mo), lignes:[`Ameublement départ retraite non-cadre (art. 44) : ${yr} an(s) révolus → ${fmtMois(mo)} mois`] }; }
        return renvoiLegal(motif,c,'Ameublement (5 ans ou moins)');
      }
      if(motif==='departRet'||motif==='miseRet') return renvoiLegal(motif,c,'Ameublement (barème retraite non relevé pour cette situation)');
      if(c.mois<12) return zero('Ameublement (art. 43)',1);
      const mo=0.2*yr+(2/15)*Math.max(0,yr-10);
      return { mois:mo, expr:`0.2*${yr}`+(yr>10?`+(2/15)*${yr-10}`:''), lignes:[`Ameublement (art. 43) : 1/5 de mois par année révolue (${yr})${yr>10?' + 2/15 au-delà de 10 ans':''} = ${fmtMois(mo)} mois`], doubleSiInaptP:true };
    } },
  '3212': { ...base0, nom:'Travaux publics — cadres (IDCC 3212)',
    notes:['Licenciement (art. 7.5, relu sur Légifrance) : 2 ans d\'ancienneté ; 3/10 de mois par année jusqu\'à 10 ans, 6/10 au-delà ; plafond 15 mois ; majoration de 10 % pour un cadre de plus de 55 ans à l\'expiration du préavis (ajoutée ici après plafond : à confirmer).','Mise à la retraite (art. 7.7) : 2/10 par année jusqu\'à 10 ans, 5/10 au-delà, plafond 12 mois, sous réserve du légal si plus favorable. Départ volontaire (art. 7.9) : 1,5/10 par année jusqu\'à 10 ans, 3/10 au-delà, plafond 8 mois.','Assiette conventionnelle : dernier mois avant notification + 1/12 des éléments variables des 12 derniers mois ; ici : plus favorable des moyennes 12 / 3 mois. Définition de l\'ancienneté (art. 7.11) non relue.',SAL_FAV],
    conv(motif, c){
      const y=c.mois/12;
      if(motif==='miseRet'||motif==='departRet'){
        if(c.mois<24) return renvoiLegal(motif,c,'Travaux publics cadres (moins de 2 ans)');
        const [a,b,cap,lab]= motif==='miseRet' ? [0.2,0.5,12,'mise à la retraite (art. 7.7)'] : [0.15,0.3,8,'départ volontaire (art. 7.9)'];
        let mo=a*Math.min(y,10)+b*Math.max(0,y-10); const l=[`Travaux publics cadres ${lab} : ${a} puis ${b} de mois par année = ${fmtMois(mo)} mois`]; if(mo>cap){ mo=cap; l.push(`Plafond de ${cap} mois appliqué.`); }
        return { mois:mo, expr:String(mo), lignes:l };
      }
      if(c.mois<24) return zero('Travaux publics cadres (art. 7.5)',2);
      let mo=0.3*Math.min(y,10)+0.6*Math.max(0,y-10); const l=[`Travaux publics cadres (art. 7.5) : 3/10 puis 6/10 de mois par année = ${fmtMois(mo)} mois`];
      if(mo>15){ mo=15; l.push('Plafond de 15 mois appliqué.'); }
      if(c.age!==null && c.age!==undefined && c.age>55){ mo*=1.1; l.push('Majoration de 10 % (cadre de plus de 55 ans), ajoutée après plafond.'); }
      return { mois:mo, expr:String(mo), lignes:l, doubleSiInaptP:true };
    } },
  '1285': { ...base0, nom:'Entreprises artistiques et culturelles (IDCC 1285)',
    notes:['Licenciement (art. V.11, relu sur Légifrance) : 1 an d\'ancienneté ; 1/5 de mois par année ; 1/2 mois par année dès 2 ans de présence (tous motifs individuels) et dès 1 an en licenciement économique ; années incomplètes au prorata. Lecture à confirmer : le texte est ambigu sur le cumul de ces règles.','Retraite (art. V.12), départ ou mise : de 2 à 5 ans, 1/10 de mois par année ; plus de 5 ans : 1 mois ; plus de 10 : 1,5 ; plus de 15 : 2,5 ; plus de 20 : 3,5 ; plus de 25 : 4 ; plus de 30 : 4,5.',SAL_FAV],
    conv(motif, c){
      const y=c.mois/12;
      if(motif==='departRet'||motif==='miseRet'){
        if(c.mois<24) return renvoiLegal(motif,c,'Entreprises artistiques (moins de 2 ans)');
        const mo= c.mois<=60 ? y/10 : palierMois(c.mois,[[5,1],[10,1.5],[15,2.5],[20,3.5],[25,4],[30,4.5]],true);
        return { mois:mo, expr:String(mo), lignes:[`Entreprises artistiques retraite (art. V.12) : ${fmtMois(y)} an(s) → ${fmtMois(mo)} mois`] };
      }
      if(c.mois<12) return zero('Entreprises artistiques (art. V.11)',1);
      const half = c.eco || c.mois>=24; const mo=(half?0.5:0.2)*y;
      return { mois:mo, expr:`${half?'0.5':'0.2'}*${fmtMois(y)}`, lignes:[`Entreprises artistiques (art. V.11) : ${half?'1/2':'1/5'} de mois par année = ${fmtMois(mo)} mois`], doubleSiInaptP:true };
    } },
  '3216': { ...base0, nom:'Négoce des matériaux de construction (IDCC 3216)', categories:[['oeam','Ouvriers, employés, agents de maîtrise'],['cadre','Cadres']],
    notes:['Non-cadres (art. 2.6.1.5, relu sur Légifrance) : sans condition d\'ancienneté ; moins de 2 ans, 1/4 de mois par année (prorata) ; 1/2 mois à 2 ans ; au-delà, 1/5 de mois par année, plus 3/15 de 11 à 20 ans, 4/15 de 21 à 30 ans, 5/15 au-delà ; mois entamé compté ; majoration de 10 % à 50 ans et 20 % au-delà de 60 ans avec 15 ans de présence.','Cadres (art. 3.8) : 3/10 de mois par année jusqu\'à 10 ans, 4/10 de la 11e à la 15e, 6/10 dès la 16e ; fraction de plus de 3 mois = année entière ; + 1 mois après 50 ans et + 2 mois après 55 ans (au-delà de 10 ans) ; plafond 15 mois, majoration incluse.','Départ à la retraite : non-cadres 1/10 de mois par année dès 2 ans (art. 2.7.2) ; cadres (art. 3.9.2) 1/20, 2/20, 3/20 puis 5/20 de mois par année par tranche (2-5, 6-9, 10-19, 20 ans et plus), plafond 6 mois : lecture par tranche à confirmer. Mise à la retraite : plus favorable du légal et du barème de départ (non-cadres) ; cadres : même barème retenu, article b) non relu en entier.',SAL_FAV],
    conv(motif, c){
      const cad=(c.categorie||'oeam')==='cadre';
      if(motif==='departRet'||motif==='miseRet'){
        if(cad){
          const y=c.mois/12; if(c.mois<24) return renvoiLegal(motif,c,'Matériaux cadres (moins de 2 ans)');
          let mo=Math.min(6,0.05*clamp(y,1,5)+0.1*clamp(y,5,9)+0.15*clamp(y,9,19)+0.25*Math.max(0,y-19));
          return { mois:mo, expr:String(mo), lignes:[`Matériaux cadres retraite (art. 3.9.2) : 1/20, 2/20, 3/20, 5/20 par tranche, plafond 6 mois = ${fmtMois(mo)} mois`] };
        }
        if(c.mois<24) return renvoiLegal(motif,c,'Matériaux (moins de 2 ans)');
        const mo=c.mois/12/10; return { mois:mo, expr:String(mo), lignes:[`Matériaux retraite non-cadre (art. 2.7.2) : 1/10 de mois par année = ${fmtMois(mo)} mois`] };
      }
      if(cad){
        const fr=c.mois-12*Math.floor(c.mois/12); const ye= c.mois<12 ? c.mois/12 : Math.floor(c.mois/12)+(fr>3?1:0);
        let mo=0.3*Math.min(ye,10)+0.4*clamp(ye,10,15)+0.6*Math.max(0,ye-15); const l=[`Matériaux cadres (art. 3.8) : 3/10, 4/10, 6/10 de mois par tranche, ${fmtMois(ye)} an(s) retenus = ${fmtMois(mo)} mois`];
        if(ye>10 && c.age!==null && c.age!==undefined){ if(c.age>55){ mo+=2; l.push('Majoration de 2 mois (cadre de plus de 55 ans).'); } else if(c.age>50){ mo+=1; l.push('Majoration de 1 mois (cadre de plus de 50 ans).'); } }
        if(mo>15){ mo=15; l.push('Plafond de 15 mois appliqué.'); }
        return { mois:mo, expr:String(mo), lignes:l, doubleSiInaptP:true };
      }
      const yy=Math.ceil(c.mois)/12;
      let mo = yy<=2 ? 0.25*yy : Math.max(0.5, 0.2*yy+(3/15)*clamp(yy,10,20)+(4/15)*clamp(yy,20,30)+(5/15)*Math.max(0,yy-30)); const l=[`Matériaux non-cadres (art. 2.6.1.5) : ${fmtMois(yy)} an(s) (mois entamé compté) = ${fmtMois(mo)} mois`];
      if(yy>=15 && c.age!==null && c.age!==undefined){ if(c.age>60){ mo*=1.2; l.push('Majoration de 20 % (plus de 60 ans, 15 ans de présence).'); } else if(c.age>=50){ mo*=1.1; l.push('Majoration de 10 % (50 ans, 15 ans de présence).'); } }
      return { mois:mo, expr:String(mo), lignes:l, doubleSiInaptP:true };
    } },
  '1539': { ...base0, nom:'Bureau et numérique (IDCC 1539)', categories:[['nc','Non-cadres'],['cadre','Encadrement']],
    notes:['Licenciement non-cadres (art. 3.7, relu sur Légifrance) : 1 an d\'ancienneté ; 1/5 de mois par année, plus 2/15 par année au-delà de 10 ans. Encadrement (art. 5.14) : même barème, majoré de 5 % entre 50 et 55 ans et de 10 % au-delà de 55 ans, plafond 9 mois majorations comprises.','Retraite non-cadres (art. 3.8) : 0,5 mois après 5 ans, 1 après 10, 1,5 après 15, 2 après 20, 2,5 après 30. Encadrement (art. 5.15) : 1,5 après 10 ans, 2 après 15, 2,5 après 20, 3 après 30. « Après » = ancienneté strictement supérieure. En mise à la retraite par l\'employeur, l\'indemnité ne peut être inférieure à l\'indemnité conventionnelle de licenciement.',SAL_FAV],
    conv(motif, c){
      const y=c.mois/12, cad=(c.categorie||'nc')==='cadre';
      const lic=()=>{ let mo=licUnCinq(y); const l=[`Bureau et numérique : 1/5 de mois par année${y>10?' + 2/15 au-delà de 10 ans':''} = ${fmtMois(mo)} mois`];
        if(cad){ if(c.age!==null && c.age!==undefined){ if(c.age>55){ mo*=1.1; l.push('Majoration de 10 % (plus de 55 ans).'); } else if(c.age>=50){ mo*=1.05; l.push('Majoration de 5 % (50 à 55 ans).'); } } if(mo>9){ mo=9; l.push('Plafond de 9 mois (majorations comprises) appliqué.'); } }
        return { mois:mo, lignes:l }; };
      if(motif==='departRet'||motif==='miseRet'){
        const P = cad ? [[10,1.5],[15,2],[20,2.5],[30,3]] : [[5,0.5],[10,1],[15,1.5],[20,2],[30,2.5]];
        let mo=palierMois(c.mois,P,true); const l=mo>0?[palierTxt('Bureau et numérique retraite '+(cad?'(art. 5.15)':'(art. 3.8)'),y,mo)]:[];
        if(motif==='miseRet' && c.mois>=12){ const r=lic(); if(r.mois>mo){ mo=r.mois; l.push('Mise à la retraite par l\'employeur : au moins l\'indemnité conventionnelle de licenciement.'); l.push(...r.lignes); } }
        if(mo>0) return { mois:mo, expr:String(mo), lignes:l };
        return renvoiLegal(motif,c,'Bureau et numérique (sous les seuils)');
      }
      if(c.mois<12) return zero('Bureau et numérique',1);
      const r=lic(); return { mois:r.mois, expr:String(r.mois), lignes:r.lignes, doubleSiInaptP:true };
    } },
});

/* Annuaire : rang indicatif (portefeuille type TPE-PME), nom court, secteur, statut de modélisation. */
const CCN_META = {
 '3032':{rang:31,court:'Esthétique, parfumerie',statut:'partielle'}, '1431':{rang:32,court:'Optique-lunetterie',statut:'partielle'}, '0413':{rang:33,court:'CCN 66 (handicap)',statut:'partielle'}, '1516':{rang:34,court:'Organismes de formation',statut:'partielle'}, '1702':{rang:35,court:'Travaux publics ouvriers',statut:'partielle'}, '2378':{rang:36,court:'Intérimaires (travail temporaire)',statut:'legal'}, '0675':{rang:37,court:'Succursales habillement',statut:'partielle'}, '1404':{rang:38,court:'SDLM',statut:'partielle'}, '1413':{rang:39,court:'Permanents du travail temporaire',statut:'legal'}, '3237':{rang:40,court:'Commerce alimentaire spécialisé',statut:'modelisee'}, '2614':{rang:41,court:'Travaux publics ETAM',statut:'partielle'}, '2332':{rang:42,court:'Architecture',statut:'legal'}, '3090':{rang:43,court:'Spectacle vivant privé',statut:'modelisee'}, '2335':{rang:44,court:'Agences générales d\'assurances',statut:'modelisee'}, '1266':{rang:45,court:'Restauration de collectivités',statut:'partielle'}, '1880':{rang:46,court:'Négoce de l\'ameublement',statut:'partielle'}, '3212':{rang:47,court:'Travaux publics cadres',statut:'partielle'}, '1285':{rang:48,court:'Entreprises artistiques et culturelles',statut:'partielle'}, '3216':{rang:49,court:'Négoce matériaux de construction',statut:'partielle'}, '1539':{rang:50,court:'Bureau et numérique',statut:'modelisee'},
 '1596':{rang:1,court:'Bâtiment ouvriers ≤ 10 sal.',statut:'partielle'}, '1486':{rang:2,court:'Syntec',statut:'modelisee'}, '1979':{rang:3,court:'HCR',statut:'partielle'},
 '7024':{rang:4,court:'Production agricole et CUMA',statut:'partielle'}, '1090':{rang:5,court:'Services de l\'automobile',statut:'modelisee'}, '2609':{rang:6,court:'Bâtiment ETAM',statut:'modelisee'},
 '2420':{rang:7,court:'Bâtiment cadres',statut:'modelisee'}, '1501':{rang:8,court:'Restauration rapide',statut:'partielle'}, '3248':{rang:9,court:'Métallurgie',statut:'partielle'},
 '0016':{rang:10,court:'Transports routiers',statut:'partielle'}, '0573':{rang:11,court:'Commerces de gros',statut:'modelisee'}, '1527':{rang:12,court:'Immobilier',statut:'partielle'},
 '1043':{rang:13,court:'Gardiens, concierges',statut:'partielle'}, '1147':{rang:14,court:'Cabinets médicaux',statut:'modelisee'}, '2596':{rang:15,court:'Coiffure',statut:'partielle'},
 '2511':{rang:16,court:'Sport',statut:'modelisee'}, '1517':{rang:17,court:'Commerces de détail non alimentaires',statut:'modelisee'}, '0843':{rang:18,court:'Boulangerie-pâtisserie',statut:'partielle'},
 '1505':{rang:19,court:'Commerce alimentaire non spécialisé',statut:'modelisee'}, '1597':{rang:20,court:'Bâtiment ouvriers > 10 sal.',statut:'partielle'}, '1619':{rang:21,court:'Cabinets dentaires',statut:'modelisee'},
 '2216':{rang:22,court:'Grande distribution alimentaire',statut:'modelisee'}, '2098':{rang:23,court:'Prestataires tertiaire',statut:'partielle'}, '0787':{rang:24,court:'Experts-comptables',statut:'partielle'},
 '1996':{rang:25,court:'Pharmacie d\'officine',statut:'partielle'}, '1483':{rang:26,court:'Habillement et textiles',statut:'partielle'}, '7018':{rang:27,court:'Entreprises du paysage',statut:'modelisee'},
 '1518':{rang:28,court:'Animation',statut:'partielle'}, '3127':{rang:29,court:'Services à la personne',statut:'modelisee'}, '3043':{rang:30,court:'Propreté',statut:'legal'},
 '1978':{rang:51,court:'Fleuristes',statut:'partielle'}, '3254':{rang:52,court:'Boucherie, poissonnerie',statut:'legal'}, '1557':{rang:53,court:'Articles de sport',statut:'partielle'}, '0029':{rang:54,court:'CCN 51 (FEHAP)',statut:'partielle'}, '1686':{rang:55,court:'Audiovisuel, électronique',statut:'legal'}, '3253':{rang:56,court:'Cabinets d\'avocats (salariés)',statut:'legal'}, '2120':{rang:57,court:'Banque',statut:'partielle'}, '0804':{rang:58,court:'VRP',statut:'legal'}, '0086':{rang:59,court:'Publicité',statut:'modelisee'}, '1982':{rang:60,court:'Négoce médico-technique',statut:'partielle'}, '2205':{rang:61,court:'Notariat',statut:'legal'}, '0478':{rang:62,court:'Sociétés financières',statut:'legal'}, '7025':{rang:63,court:'Travaux agricoles et forestiers',statut:'legal'}, '2219':{rang:64,court:'Taxis',statut:'legal'}, '2247':{rang:65,court:'Courtage d\'assurances',statut:'legal'}, '2941':{rang:66,court:'Aide à domicile (BAD)',statut:'modelisee'}, '1351':{rang:67,court:'Prévention et sécurité',statut:'partielle'}, '1261':{rang:68,court:'ALISFA',statut:'legal'}, '1790':{rang:69,court:'Espaces de loisirs',statut:'legal'}, '0759':{rang:70,court:'Pompes funèbres',statut:'legal'},
 '0045':{rang:null,court:'Caoutchouc',statut:'modelisee'}
};
const STATUT_LABEL = { modelisee:'Barème modélisé', partielle:'Modélisation partielle', legal:'Légal appliqué (barème non confirmé)' };


/* ---------- Régime social et fiscal de l'indemnité (V2.9) ----------
   Sources : BOSS, URSSAF, BOFiP (art. 80 duodecies CGI), justice.fr ; LFSS 2026 (contribution patronale de 40 %).
   Périmètre : licenciement, inaptitude, rupture conventionnelle individuelle, mise à la retraite, départ volontaire, hors PSE, hors mandataire social. */
const PASS_ANNUEL = { 2023:43992, 2024:46368, 2025:47100, 2026:48060 };
const TAUX_CSG_CRDS = 0.097;   // CSG 9,2 % + CRDS 0,5 %, sans abattement sur l'indemnité
function regimeSocialFiscal(p){
  const { motif, total, legalConv, remN1, annee, droitRetraite, taux } = p;
  const connu = PASS_ANNUEL[annee]!==undefined;
  const pass = PASS_ANNUEL[annee] || PASS_ANNUEL[2026];
  const lignes=[], alertes=[];
  if(!connu) alertes.push(`PASS ${annee} non connu de l'outil : valeur 2026 (${fmtEur(pass)}) utilisée.`);
  const I=total, L=Math.min(legalConv, I);
  const out = { pass, annee, total:I, legalConv:L, supra:Math.max(0,I-L), lignes, alertes };
  if(motif==='departRet'){
    Object.assign(out,{ irExo:0, irImposable:I, cotisExo:0, cotisSoumis:I, csgExo:0, csgBase:I, contribBase:null, contrib:null });
    lignes.push('Départ volontaire à la retraite (hors PSE) : indemnité assimilée à du salaire, soumise en totalité aux cotisations, à la CSG/CRDS et à l\'impôt sur le revenu.');
  } else {
    const plafVar = (motif==='miseRet' ? 5 : 6) * pass;
    const seuilVar = Math.min(Math.max(2*remN1, I/2), plafVar);
    const irExoFull = Math.min(I, Math.max(L, seuilVar));
    const irExo = (motif==='rc' && droitRetraite) ? 0 : irExoFull;
    const dix = I > 10*pass;
    const cotisExo = dix ? 0 : Math.min(irExoFull, 2*pass);
    const csgExo = dix ? 0 : Math.min(L, cotisExo);
    lignes.push(`Exonération fiscale (art. 80 duodecies CGI) : plus élevé de l'indemnité légale ou conventionnelle (${fmtEur(L)}), de 2 × la rémunération brute N-1 (${fmtEur(2*remN1)}) et de 50 % de l'indemnité (${fmtEur(I/2)}), les deux derniers dans la limite de ${motif==='miseRet'?5:6} PASS (${fmtEur(plafVar)}) → ${fmtEur(irExoFull)}.`);
    if(motif==='rc' && droitRetraite) lignes.push('Salarié en droit de bénéficier d\'une pension de retraite : indemnité de rupture conventionnelle imposable en totalité (le régime social reste inchangé).');
    if(dix) lignes.push(`Indemnité supérieure à 10 PASS (${fmtEur(10*pass)}) : soumise aux cotisations et à la CSG/CRDS dès le premier euro.`);
    else lignes.push(`Exonération de cotisations : fraction non imposable, dans la limite de 2 PASS (${fmtEur(2*pass)}) → ${fmtEur(cotisExo)}${motif==='rc'&&droitRetraite?' (apprécié comme si le salarié n\'avait pas droit à la retraite)':''}.`,
      `Exonération de CSG/CRDS : plus petit de l'indemnité légale ou conventionnelle (${fmtEur(L)}) et de la fraction exonérée de cotisations → ${fmtEur(csgExo)}.`);
    const contribOK = motif==='rc' || motif==='miseRet';
    const contribBase = contribOK ? cotisExo : null;
    Object.assign(out,{ irExo, irImposable:I-irExo, cotisExo, cotisSoumis:I-cotisExo, csgExo, csgBase:I-csgExo, contribBase,
      contrib: contribOK && taux!==null ? r2(contribBase*taux) : null });
    if(contribOK) lignes.push(`Contribution patronale spécifique de ${Math.round(taux*100)} % sur la fraction exonérée de cotisations (${fmtEur(cotisExo)}).`);
  }
  out.csgCrds = r2(out.csgBase*TAUX_CSG_CRDS);
  return out;
}

/* ---------- calcul principal ---------- */
function compute(inp){
  const out = { erreur:null, lignes:[], alertes:[], legal:null, conv:null, retenu:null, mois:0, fin:null, exprLegal:'', exprConv:'' };
  const entree=parseISO(inp.entree), sortie=parseISO(inp.sortie);
  if(!entree||!sortie){ out.erreur='Renseignez la date d\'entrée et la date de fin de contrat.'; return out; }
  if(sortie<entree){ out.erreur='La date de fin de contrat précède la date d\'entrée.'; return out; }

  const ccn = inp.ccn && inp.ccn!=='none' ? CCN[inp.ccn] : null;
  const motif = inp.motif;
  /* Âge : calculé depuis la date de naissance (à la date de fin de contrat, ou à la signature / notification), sinon âge saisi */
  out.age = inp.age===''||inp.age==null||isNaN(+inp.age) ? null : +inp.age; out.ageSource = out.age!==null ? 'saisi' : null; out.ageDate = null;
  if(inp.naissance){
    const refISO = inp.ageRef==='dateRef' && inp.dateRef ? inp.dateRef : inp.sortie;
    const a = ageAt(inp.naissance, refISO);
    if(a!==null){ out.age=a; out.ageSource='naissance'; out.ageDate=refISO; }
    const aEnt = ageAt(inp.naissance, inp.entree);
    if(a!==null && (aEnt<14 || a<14 || a>90)) out.alertes.push('La date de naissance paraît incohérente avec les dates d\'entrée et de fin de contrat : à vérifier.');
  }
  if(ccn && ccn.ageMajoration && out.age===null) out.alertes.push('Cette convention comporte une règle liée à l\'âge (majoration) : renseignez la date de naissance du salarié.');

  /* 1. Ancienneté */
  let excl=0; const absL=[]; const groupes={};
  for(const a of (inp.absences||[])){
    const def=ABS_BY_ID[a.type]; if(!def) continue;
    const j=Math.max(0,Math.round(+a.jours||0)); if(!j) continue;
    let ov = ccn && ccn.absOverride[a.type];
    if(motif==='inaptP' && a.type==='atmp') ov=null;
    if(def.incertain) out.alertes.push(`« ${def.label} » : le traitement dans l'ancienneté diffère selon les sources, à confirmer.`);
    if(ov && ov.t==='seuil'){            // période prise en compte seulement si elle reste inférieure au seuil, sinon déduite en entier
      const d = j>=ov.max ? j : 0; excl+=d;
      absL.push(`${def.label} (${j} j) : ${d?`atteint ${ov.max} j (6 mois) : période non prise en compte → −${d} j`:`inférieure à ${ov.max} j : prise en compte`} (convention)`);
      continue;
    }
    if(ov && ov.t==='plafond'){ (groupes[ov.groupe]=groupes[ov.groupe]||{max:ov.max,j:0,labels:[]}); groupes[ov.groupe].j+=j; groupes[ov.groupe].labels.push(def.label); continue; }
    const t = (ov&&ov.t) || def.t;
    const d = t==='exclu'? j : t==='moitie'? Math.ceil(j/2) : 0;
    excl+=d;
    absL.push(`${def.label} (${j} j) : ${t==='exclu'?'déduite':t==='moitie'?'retenue pour moitié':'retenue'}${d?` → −${d} j`:''}`);
  }
  for(const g of Object.values(groupes)){
    const d=Math.max(0,g.j-g.max); excl+=d;
    absL.push(`${g.labels[0]} (${g.j} j) : retenue dans la limite de ${g.max} j (convention)${d?` → −${d} j déduits`:' → rien à déduire'}`);
  }
  const debut=addDays(entree,excl), finEx=addDays(sortie,1);
  const mois=Math.max(0,monthsBetween(debut,finEx));
  out.mois=mois;
  out.lignes.push(`Ancienneté retenue : ${fmtAnc(mois)} (${mois} mois complets).`);
  if(absL.length){ out.lignes.push(...absL); if(excl) out.lignes.push(`Total déduit de l'ancienneté : ${excl} jour(s).`); }

  /* 2. Salaire de référence */
  const sr12=+inp.sr12||0, sr3=+inp.sr3||0, sr=Math.max(sr12,sr3);
  if(sr<=0){ out.erreur='Renseignez la rémunération des 12 derniers mois.'; return out; }
  out.lignes.push(`Moyenne 12 mois : ${fmtEur(sr12)} · moyenne 3 mois : ${fmtEur(sr3)} → plus favorable : ${fmtEur(sr)}.`);

  /* 3. Minimum légal */
  let legMois=0, legTxt='', legElig=true;
  if(motif==='departRet'){
    legMois=departLegalMois(mois);
    legTxt = legMois? `Départ volontaire (D1237-1) : ${fmtMois(legMois)} mois de salaire pour ${Math.floor(mois/12)} an(s) d'ancienneté.` : 'Départ volontaire (D1237-1) : moins de 10 ans d\'ancienneté, pas d\'indemnité légale.';
    out.exprLegal=String(legMois);
  } else {
    const base=legalMois(mois);
    out.exprLegal=legalExpr(mois);
    if(motif==='rc'){
      legMois=base; legTxt=`R1234-2 : 1/4 de mois par année jusqu'à 10 ans, 1/3 au-delà → ${fmtMois(base)} mois (proratisé par mois complets, sans condition de 8 mois).`;
    } else if(motif==='inaptP'){
      legMois=2*base; out.exprLegal=`2*(${out.exprLegal})`;
      legTxt=`Indemnité spéciale (L1226-14) : double de l'indemnité légale (${fmtMois(base)} × 2) = ${fmtMois(legMois)} mois.`;
      out.alertes.push('Inaptitude professionnelle : la condition de 8 mois d\'ancienneté n\'est pas appliquée à l\'indemnité spéciale (à valider).');
    } else {
      if(mois<8){ legElig=false; legTxt='Ancienneté inférieure à 8 mois : pas d\'indemnité légale de licenciement.'; }
      else { legMois=base; legTxt=`R1234-2 : 1/4 de mois par année jusqu'à 10 ans, 1/3 au-delà → ${fmtMois(base)} mois.`; }
    }
  }
  const legMontant = r2(legMois*sr);
  out.legal={ mois:legMois, montant:legMontant, texte:legTxt, eligible:legElig, base:sr };

  /* 4. Convention */
  if(ccn){
    const srLast=+inp.srLast||0;
    const ctx={ mois, sr, sr12, sr3, srLast, age: out.age, categorie: inp.categorie, eco: !!inp.eco && motif==='lic' };
    const r = ccn.conv(motif, ctx);
    const baseKey = (r && r.baseKey) || (ccn.basis==='sr12'?'sr12':'sr');
    const base = baseKey==='sr12' ? sr12 : baseKey==='sr3' ? sr3 : baseKey==='srMax3' ? Math.max(sr12,sr3,srLast) : sr;
    if(r){
      let cm=r.mois, extra='', expr=r.expr;
      if(motif==='inaptP' && r.doubleSiInaptP){ cm=cm*2; extra=' (doublée : inaptitude professionnelle)'; expr=`2*(${expr})`; }
      out.conv={ nom:ccn.nom, mois:cm, montant:r2(cm*base), lignes:r.lignes, extra, nonModelise:!!r.nonModelise, base, baseKey };
      out.exprConv=expr;
      if(r.nonModelise) out.alertes.push(r.avert || 'Le complément conventionnel de fin de carrière n\'est pas encore modélisé : seule l\'indemnité légale est calculée.');
      else if(r.avert) out.alertes.push(r.avert);
    } else {
      out.conv={ nom:ccn.nom, mois:0, montant:0, lignes:['Aucune règle conventionnelle modélisée pour ce motif : le minimum légal s\'applique.'], extra:'', nonModelise:true, base:sr, baseKey:'sr' };
    }
    if(ccn.basis==='sr12' && r) out.alertes.push('Convention calculée sur la moyenne des 12 mois (comme dans vos fiches).');
    out.alertes.push(...ccn.notes);
    out.alertes.push('Règles conventionnelles à valider sur le texte de la convention (Légifrance) ; traitement des absences : voir l\'onglet Règles.');
  }

  /* 5. Montant retenu, arrondi, supra-légale, contribution */
  const legal = legElig ? legMontant : 0;
  const conv = out.conv ? out.conv.montant : 0;
  out.retenu = (out.conv && conv>legal) ? { montant:conv, source:'conventionnelle' } : { montant:legal, source:'légale' };

  const mode = inp.arrondi || (motif==='rc' ? 'dizaine' : 'euro');
  const base = arrondir(out.retenu.montant, mode);
  const supra = Math.max(0,+inp.supra||0);
  const total = r2(base+supra);
  const contribOK = motif==='rc' || motif==='miseRet';
  let taux = null;
  if(contribOK){
    taux = (inp.taux!==undefined && inp.taux!=='' && inp.taux!==null) ? (+inp.taux)/100 : (toISO(sortie)>='2026-01-01' ? 0.4 : 0.3);
  }
  out.fin = { mode, retenuArrondi:base, supra, total, taux, contrib: contribOK ? r2(total*taux) : null, honoraires: inp.honoraires===''||inp.honoraires==null ? null : +inp.honoraires };
  /* Régime social et fiscal : nécessite la rémunération brute de l'année civile précédente (sauf départ volontaire) */
  const remN1 = inp.remN1===''||inp.remN1==null||isNaN(+inp.remN1) ? null : +inp.remN1;
  if(total>0){
    if(motif!=='departRet' && remN1===null) out.regime = { manque:'remN1' };
    else {
      out.regime = regimeSocialFiscal({ motif, total, legalConv:base, remN1:remN1||0, annee:sortie.getUTCFullYear(), droitRetraite:!!inp.droitRetraite, taux });
      if(contribOK && remN1!==null){ out.fin.contribBase=out.regime.contribBase; out.fin.contrib=out.regime.contrib; }
    }
  }
  if(contribOK){
    out.alertes.push(out.fin.contribBase!==undefined && out.fin.contribBase!==null
      ? `Contribution patronale ${Math.round(taux*100)} % appliquée sur la fraction de l'indemnité exonérée de cotisations (${fmtEur(out.fin.contribBase)}), comme le prévoit la loi.`
      : `Contribution patronale ${Math.round(taux*100)} % appliquée sur le total, comme dans vos fiches. En droit, elle porte sur la fraction exonérée de cotisations de sécurité sociale : renseignez la rémunération brute de l'année précédente pour la calculer.`);
    if(taux===0.3 && toISO(sortie)>='2026-01-01') out.alertes.push('Taux de 30 % saisi alors que la fin de contrat est en 2026 (40 % en principe).');
  }
  if(motif==='rc') out.alertes.push('Rupture conventionnelle : montant plancher. Les parties peuvent convenir d\'une indemnité supérieure (supra-légale).');
  /* Licenciement économique : CSP */
  if(motif==='lic' && inp.eco){
    const num = v => (v===''||v==null||isNaN(+v)) ? null : +v;
    if(inp.csp){
      const srLast=+inp.srLast||0, salAuto = inp.preavisBase==='sr' ? sr : (srLast>0?srLast:sr), salRef = num(inp.preavisSal)>0 ? num(inp.preavisSal) : salAuto;
      const moisAnc = Math.max(0,monthsBetween(entree,finEx));
      out.csp = calculCsp({ moisAnc, preavisMois:num(inp.preavisMois), salaire:salRef, tauxCharges:num(inp.cspTaux), montantCharge:num(inp.cspMontant) });
      out.csp.cout = r2(out.fin.total + (out.csp.ftCharge!==null?out.csp.ftCharge:out.csp.ft) + out.csp.salarie);
      out.alertes.push(...out.csp.alertes);
    } else {
      out.alertes.push('Licenciement économique : dans les entreprises de moins de 1 000 salariés, le CSP doit être proposé à chaque salarié concerné. À défaut, France Travail réclame une contribution de 2 mois de salaire brut (refus) ou de 3 mois chargés (acceptation). Cochez « Le salarié accepte le CSP » pour calculer la contribution.');
    }
  }
  out.alertes.push(out.csp ? 'Montants bruts. Hors congés payés et régime social et fiscal des sommes versées au salarié.' : 'Montants bruts. Hors préavis, congés payés, régime social et fiscal.');
  return out;
}

if(typeof module!=='undefined') module.exports={ calculCsp, preavisLegalMois, regimeSocialFiscal, PASS_ANNUEL, RC_DEFAUT, ageAt, compute, MOTIFS, ABS_TYPES, CCN, CCN_META, STATUT_LABEL, parseISO, monthsBetween, legalMois, salaireDepuisMois, calendrierRC, calendrierProcedure, arrondir, toISO, addDays };
