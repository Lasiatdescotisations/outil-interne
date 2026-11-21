# Outils de recoupement et de veille

Boîte à outils rejouable de l'outil de calcul d'indemnités. Elle ne modifie jamais le moteur (`../engine.js`) : elle produit des constats que l'on relit avant toute correction.

## 1. Recoupement avec le simulateur officiel (Code du travail numérique)

Prérequis : Node 18+, `npm install` (installe `@socialgouv/modeles-social`, le moteur des simulateurs officiels).

    npm run recoupement

- `compare3.js` : compare licenciement / rupture conventionnelle du moteur avec le simulateur officiel pour chaque convention suivie (ancienneté de 1 à 32 ans, âges 40 et 58 ans, chaque catégorie). Écrit `croisement.json`. Variables : `IDS=1486,0016` pour limiter, `VERBOSE=1` pour le détail des écarts.
- `compare-retraite-legal.js` : recoupe le volet légal du départ et de la mise à la retraite. Le simulateur officiel n'a pas de volet conventionnel pour la retraite : les barèmes conventionnels de retraite ne peuvent être contrôlés que sur les textes (voir veille).
- `gen-croisement.js` : produit `../croisement-data.js` (statuts concordant / neutre / écart assumé / écart / non couverte). Les écarts assumés (`ASSUMES`) sont déclarés dans le script avec leur justification et ne sont retenus que si tous les écarts relevés correspondent au motif décrit. Un nouvel écart sort donc en « écart à arbitrer ».
- Après `npm run recoupement` : `python3 ../build.py` pour reconstruire la page.

`formulas.js IDCC 3,8,15 [âge]` affiche la formule officielle et le montant pour des anciennetés données, utile pour relire un barème.

## 2. Veille des textes

    node veille.js --reference veille-reference.json

Compare, pour chaque convention suivie, l'empreinte des articles cités (et des articles de la convention qui parlent d'indemnité de licenciement, de congédiement, de retraite ou de rupture conventionnelle) avec la référence validée, d'après la base ouverte KALI (SocialGouv/kali-data, mise à jour quotidienne depuis la DILA). Signale aussi une nouvelle version de `@socialgouv/modeles-social`. Sortie : rapport Markdown avec un brouillon de fiche par alerte ; code de sortie 2 s'il y a une alerte.

Validation humaine obligatoire : après relecture des textes et correction éventuelle du moteur (avec test), on reconstruit la référence :

    IDS=$(node -e "console.log(Object.keys(require('../engine.js').CCN).join(','))") node veille.js --init veille-reference.json --refs refs.json

Limites : les textes non étendus ou non encore consolidés dans KALI ne sont pas vus ; 1619, 7018, 7024 et 0045 sont absentes de la base KALI ouverte et se contrôlent à la main sur Légifrance.

## Fichier cdtn-run.js

```
const m=require('@socialgouv/modeles-social');
const P=m.IndemniteLicenciementPublicodes;
const K="contrat salarié . indemnité de licenciement . ";
const fmt=d=>String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+d.getUTCFullYear();
function baseArgs(idcc,{entree,sortie,notif,sr,sr3,motif}){
  const a={
   "contrat salarié . convention collective":"'IDCC"+String(idcc).padStart(4,'0')+"'",
   [K+"date d'entrée"]:entree,[K+"date de sortie"]:sortie,[K+"date de notification"]:notif,
   [K+"inaptitude suite à un accident ou maladie professionnelle"]:motif==='inaptP'?'oui':'non',
   [K+"arrêt de travail"]:"non",
   [K+"salaire de référence"]:String(sr),[K+"salaire de référence conventionnel"]:String(sr),
   absencePeriods:"[]"};
  return a;
}
/* explore: répond aux questions manquantes en branchant sur les listes */
function explore(idcc,args,answers={},depth=0,out=[],opts={}){
  const p=new P(m.indemniteLicenciementModeles,String(idcc).replace(/^0+/,''));
  let r;
  try{ r=p.calculate({...args,...answers}); }catch(e){ out.push({answers,error:String(e.message).split('\n')[0]}); return out; }
  if(r.type==='ineligibility'){ out.push({answers,inelig:r.ineligibility}); return out; }
  if(r.type==='missing-args'){
    if(depth>8){ out.push({answers,error:'profondeur'}); return out; }
    const a=r.missingArgs[0]; const nm=a.rawNode.nom; const t=a.rawNode.cdtn||{};
    if(nm in answers){ /* question déjà posée et toujours manquante : repli sur le booléen */
      const cur=answers[nm]; if(/^'(Oui|Non)'$/.test(cur)){ return explore(idcc,args,{...answers,[nm]:cur.replace(/'/g,'').toLowerCase()},depth+1,out,opts); }
      out.push({answers,error:'question toujours manquante '+nm}); return out; }
    if(t.type==='liste'){ for(const [lab,val] of Object.entries(t.valeurs)) explore(idcc,args,{...answers,[nm]:val},depth+1,out,opts); }
    else if(t.type==='oui-non'){ const vs=(opts.oui&&opts.oui.test(nm))?["'Oui'"]:["'Non'"]; for(const v of vs) explore(idcc,args,{...answers,[nm]:v},depth+1,out,opts); }
    else if(t.type==='entier'||t.type==='nombre'){ explore(idcc,args,{...answers,[nm]:String(opts.age??40)},depth+1,out,opts); }
    else { out.push({answers,error:'type inconnu '+JSON.stringify(t)+' '+nm}); }
    return out;
  }
  const res=r.result||{};
  out.push({answers,legal:(r.detail&&r.detail.legalResult&&r.detail.legalResult.value)??null,
    conv:(r.detail&&r.detail.agreementResult&&r.detail.agreementResult.value)??null,
    retenu:res.value, chosen:r.detail&&r.detail.chosenResult, raw:r.detail?Object.keys(r.detail):null});
  return out;
}
module.exports={explore,baseArgs,fmt};
if(require.main===module){
  const idcc=process.argv[2];
  const out=explore(idcc,baseArgs(idcc,{entree:'01/01/2010',sortie:'31/12/2024',notif:'01/11/2024',sr:2500,motif:'lic'}),{},0,[],{age:40});
  for(const o of out) console.log(JSON.stringify(o,(k,v)=>v,0).replace(/contrat salarié \. convention collective \. /g,'').slice(0,420));
}
```

## Fichier compare3.js

```
const {explore,baseArgs}=require('./cdtn-run.js');
const eng=require(process.env.ENGINE||require('path').join(__dirname,'..','engine.js'));
const IDS=(process.env.IDS?process.env.IDS.split(","):"1596 1486 1979 1090 2609 2420 1501 3248 0016 0573 1527 1043 1147 2596 2511 1517 0843 1505 1597 2216 2098 0787 1996 1483 1518 3127 3043 1619 7018 7024 0045".split(' '));
const CAT={
 '1486':l=>/ETAM/.test(l)?'etam':/cadres/.test(l)?'cadre':null,
 '1501':l=>/Non-cadres/.test(l)?'nc':/Cadres/.test(l)?'cadre':null,
 '0016':l=>/Ouvriers/.test(l)?'ouvrier':/Employ/.test(l)?'employe':/TAM/.test(l)?'etam':/cadres/.test(l)?'cadre':null,
 '0573':l=>/Autres/.test(l)?'emp':/Agents/.test(l)?'am':/Cadres/.test(l)?'cadre':null,
 '2596':l=>/Agents|Cadres/.test(l)?'cadre':'nc',
 '2216':l=>/Cadres/.test(l)?'cadre':'nc',
 '3248':l=>/F, G/.test(l)?'fghi':'abcde',
 '2098':l=>/^'?Cadres/.test(l)?'cadre':'nc','1996':l=>/Cadres/.test(l)?'cadre':'nc','1483':l=>/Cadres/.test(l)?'cadre':'nc',
};
const catOf=(id,answers)=>{ const k=Object.keys(answers).find(k=>/catégorie professionnelle$/.test(k)); const lab=k?answers[k]:''; return CAT[id]?CAT[id](lab):null; };
const iso=(y,m)=>`${y}-${String(m).padStart(2,'0')}-01`;
const GRID=[]; for(const y of [1,3,5,8,10,12,15,20,25,32]) GRID.push({y,half:false}); GRID.push({y:7,half:true},{y:14,half:true});
const AGES=[40,58];
const rows=[]; const summary={};
for(const id of IDS){
  if(!eng.CCN[id]){ summary[id]={absent:true}; continue; }
  if(!(String(+id) in require('@socialgouv/modeles-social').indemniteLicenciementModeles)){ summary[id]={absent:false,nonCouvert:true,n:0,ko:0,skip:0,ex:[],kRet:0,kConvMod:0,kNM:0}; continue; }
  let n=0,ko=0,skip=0,kRet=0,kConvMod=0,kNM=0; const ex=[];
  for(const g of GRID) for(const age of AGES){
    const entree= g.half? iso(2025-g.y,7):iso(2025-g.y,1); const [d,mm,yy]=[1,g.half?7:1,2025-g.y];
    const a=baseArgs(id,{entree:`01/${String(mm).padStart(2,'0')}/${yy}`,sortie:(id==='0016'?'01/01/2025':'31/12/2024'),notif:'01/11/2024',sr:2500,motif:'lic'});
    // ancienneté 2024-12-31 : (2025-g.y) -> 2024-12-31 = y ans (ou y-0.5)
    const out=explore(id,a,{},0,[],{age,oui:/cadre durant au moins/});
    for(const o of out){
      if(o.error||o.inelig){ skip++; continue; }
      const cat=catOf(id,o.answers); const needCat=!!eng.CCN[id].categories;
      if(needCat && !cat){ skip++; continue; }
      const mine=eng.compute({motif:'lic',ccn:id,entree,sortie:'2024-12-31',sr12:2500,sr3:2500,age,categorie:cat||undefined});
      if(mine.erreur){ skip++; continue; }
      n++;
      const mConv=mine.conv?mine.conv.montant:null; const mLeg=mine.legal.montant;
      const dif=[];
      if(o.legal!=null && Math.abs(o.legal-mLeg)>0.02) dif.push(`légal ${mLeg} vs ${o.legal}`);
      const cConv=o.conv; 
      if(cConv!=null && mConv!=null && Math.abs(cConv-mConv)>0.02) dif.push(`conv ${mConv} vs ${cConv}`);
      if(Math.abs(o.retenu-mine.retenu.montant)>0.02) dif.push(`retenu ${mine.retenu.montant} vs ${o.retenu}`);
      if(process.env.VERBOSE && dif.length) console.log('  DIF',id,g.y,age,cat,dif.join(' | '));
      const dRet=Math.abs(o.retenu-mine.retenu.montant)>0.02; const nm=!!(mine.conv&&mine.conv.nonModelise); const dConv=(cConv!=null&&mConv!=null&&Math.abs(cConv-mConv)>0.02); if(dRet) kRet++; if(dConv&&!nm) kConvMod++; if(dConv&&nm&&!dRet) kNM++; if(dRet||(dConv&&!nm)){ ko++; if(dRet && ex.length<60) ex.push({an:g.half?g.y-0.5:g.y,age,cat:cat||null,moi:mine.retenu.montant,off:o.retenu,nm:nm}) }
    }
  }
  summary[id]={n,ko,skip,ex,kRet,kConvMod,kNM};
}
require('fs').writeFileSync(__dirname+'/croisement.json',JSON.stringify(summary));
for(const [id,s] of Object.entries(summary)) console.log(id, s.absent?'absent du moteur':`${s.n} cas | retenu≠: ${s.kRet} | conv modélisé≠: ${s.kConvMod} | non modélisé (sans effet sur retenu): ${s.kNM} | ignorés ${s.skip}`, s.ex&&s.ex.length?'\n    '+s.ex.join('\n    '):'');
```

## Fichier compare-retraite-legal.js

```
// Recoupe le volet LÉGAL du départ volontaire / de la mise à la retraite avec le simulateur officiel (le simulateur officiel n'a pas de volet conventionnel pour la retraite).
const m=require('@socialgouv/modeles-social'); const eng=require(process.env.ENGINE||require('path').join(__dirname,'..','engine.js'));
const K="contrat salarié . indemnité de licenciement . ", R="contrat salarié . indemnité de retraite . ";
let n=0,ko=0; const ex=[];
for(const motif of ['departRet','miseRet']) for(const y of [1,2,3,5,8,9,10,11,12,15,19,20,21,25,30,31,35]) for(const sr of [2500,3100.5]){
  const p=new m.IndemniteRetraitePublicodes(m.indemniteRetraiteModeles);
  const r=p.calculate({[K+'ancienneté en année']:String(y),[K+'salaire de référence']:String(sr),[R+'mise à la retraite']:motif==='miseRet'?'oui':'non'});
  const off=r.type==='result'?r.result.value:(r.type==='ineligibility'?0:null); if(off==null) continue;
  const mine=eng.compute({motif,ccn:'0000',entree:`${2026-y}-01-01`,sortie:'2025-12-31',sr12:sr,sr3:sr,age:63});
  const mv=mine.erreur?null:mine.legal.montant; n++;
  if(mv==null||Math.abs(mv-off)>0.02){ ko++; ex.push({motif,y,sr,moi:mv,off}); }
}
require('fs').writeFileSync(__dirname+'/croisement-retraite-legal.json',JSON.stringify({n,ko,ex:ex.slice(0,10)}));
console.log(`${n} cas légal retraite | écarts: ${ko}`); ex.slice(0,20).forEach(e=>console.log(JSON.stringify(e)));
```

## Fichier gen-croisement.js

```
// Génère croisement-data.js (statuts du recoupement) à partir de croisement.json (compare3.js) et refs.json (harvest.js).
// Usage : node gen-croisement.js [chemin de sortie]
const fs=require('fs'), path=require('path');
const dir=__dirname;
const out=process.argv[2]||path.join(dir,'croisement-data.js');
const cmp=JSON.parse(fs.readFileSync(path.join(dir,'croisement.json'),'utf8'));
const refs=JSON.parse(fs.readFileSync(path.join(dir,'refs.json'),'utf8'));
const pkg=JSON.parse(fs.readFileSync(path.join(dir,'node_modules/@socialgouv/modeles-social/package.json'),'utf8'));
const models=require('@socialgouv/modeles-social').indemniteLicenciementModeles;
// Écarts assumés : le texte de la convention (KALI) a été relu et le moteur le suit ; le test ne s'applique que si TOUS les écarts relevés vérifient `ok`.
const ASSUMES={
  '1501':{ok:e=>e.cat==='cadre',note:"Cadres : le moteur suit le texte de l'article 13 (2/15 de mois par année de 10 à 15 ans). Le simulateur officiel applique la majoration de 2/15 aux années de 5 à 10 ans et la cumule dès 5 ans (anomalie probable du modèle publicodes). À signaler au Code du travail numérique."},
  '0016':{ok:e=>e.an===3&&e.cat==='cadre',note:"Cadres à exactement 3 ans d'ancienneté : le texte (art. 17, annexe IV) exige « au moins 3 années de présence » et le moteur applique 4/10 par année ; le simulateur officiel exige plus de 3 ans."}
};
const REFS_EXTRA={'2098':[["Article 3.1 de l’Avenant cadres","https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005850668"]]};
const data={}; const CDTN_REFS={};
for(const [id,s] of Object.entries(cmp)){
  if(s.absent) continue;
  const couvert=String(+id) in models;
  if(!couvert){ data[id]={n:0,st:'non_couvert',ex:[]}; continue; }
  let st, note;
  if(s.kRet===0) st = (s.kConvMod+s.kNM)===0 ? 'concordant' : 'neutre';
  else {
    const a=ASSUMES[id];
    if(a && s.ex.length===s.kRet && s.ex.every(a.ok)){ st='assume'; note=a.note; } else st='ecart';
  }
  data[id]={n:s.n,st,ex:s.ex.slice(0,6)}; if(note) data[id].note=note;
  const r=(refs[id]||[]).concat(REFS_EXTRA[id]||[]); if(r.length) CDTN_REFS[id]=r;
}
// conventions non couvertes : on les liste d'après le moteur (ids absents de cmp)
for(const [id,r] of Object.entries(REFS_EXTRA)) if(!CDTN_REFS[id]) CDTN_REFS[id]=r;
const d=new Date(); const date=`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
let retraite=null; try{ retraite=JSON.parse(fs.readFileSync(path.join(dir,'croisement-retraite-legal.json'),'utf8')); }catch(e){}
const C={retraite:retraite&&{n:retraite.n,ko:retraite.ko},date,version:`@socialgouv/modeles-social ${pkg.version}`,grille:"ancienneté de 1 à 32 ans (années pleines et demi-années), âge de 40 et 58 ans, salaire de référence de 2 500 €, chaque catégorie proposée, réponse « non » aux autres questions (sauf ancienneté de cadre : « oui »)",data};
fs.writeFileSync(out,`/* Recoupement automatique avec le simulateur « Indemnité de licenciement » du Code du travail numérique (généré par compare3.js + gen-croisement.js, rejouable). */\nconst CROISEMENT = ${JSON.stringify(C)};\nconst CDTN_REFS = ${JSON.stringify(CDTN_REFS)};\n`);
const cnt={}; for(const v of Object.values(data)) cnt[v.st]=(cnt[v.st]||0)+1; console.log(cnt, Object.entries(data).filter(([k,v])=>v.st==='ecart'||v.st==='assume').map(([k,v])=>k+':'+v.st).join(' '));
```

## Fichier cat-map.js

```
const CAT={
 '1486':l=>/ETAM/.test(l)?'etam':/cadres/.test(l)?'cadre':null,
 '1501':l=>/Non-cadres/.test(l)?'nc':/Cadres/.test(l)?'cadre':null,
 '0016':l=>/Ouvriers/.test(l)?'ouvrier':/Employ/.test(l)?'employe':/TAM/.test(l)?'etam':/cadres/.test(l)?'cadre':null,
 '0573':l=>/Autres/.test(l)?'emp':/Agents/.test(l)?'am':/Cadres/.test(l)?'cadre':null,
 '2596':l=>/Agents|Cadres/.test(l)?'cadre':'nc',
 '2216':l=>/Cadres/.test(l)?'cadre':'nc',
 '3248':l=>/F, G/.test(l)?'fghi':'abcde',
 '2098':l=>/^'?Cadres/.test(l)?'cadre':'nc','1996':l=>/Cadres/.test(l)?'cadre':'nc','1483':l=>/Cadres/.test(l)?'cadre':'nc',
};
const catOf=(id,answers)=>{ const k=Object.keys(answers).find(k=>/catégorie professionnelle$/.test(k)); const lab=k?answers[k]:''; return CAT[id]?CAT[id](lab):null; };
module.exports=catOf;
```

## Fichier formulas.js

```
const m=require('@socialgouv/modeles-social'); const {baseArgs}=require('./cdtn-run.js');
const id=process.argv[2]; const ys=(process.argv[3]||'1,3,6,11,16,26').split(',').map(Number); const age=process.argv[4]||'40';
const p=new m.IndemniteLicenciementPublicodes(m.indemniteLicenciementModeles,String(+id));
const sortie=id==='0016'?'01/01/2025':'31/12/2024';
const rec=(args,answers,depth,out)=>{
  let r; try{ r=p.agreementInstance.calculate({...args,...answers},p);}catch(e){return;}
  if(r.type==='missing-args'){ if(depth>8)return; const x=r.missingArgs[0].rawNode,t=x.cdtn||{}, nm=x.nom;
    if(nm in answers){ const cur=answers[nm]; if(/^'(Oui|Non)'$/.test(cur)) return rec(args,{...answers,[nm]:cur.replace(/'/g,'').toLowerCase()},depth+1,out); return; }
    if(t.type==='liste') for(const v of Object.values(t.valeurs)) rec(args,{...answers,[nm]:v},depth+1,out);
    else rec(args,{...answers,[nm]:t.type==='oui-non'?"'Non'":age},depth+1,out); return; }
  out.push({answers,r}); };
for(const y of ys){
  const args=baseArgs(id,{entree:`01/01/${2025-y}`,sortie,notif:'01/11/2024',sr:2500,motif:'lic'}); const out=[]; rec(args,{},0,out);
  for(const o of out){ const lab=Object.entries(o.answers).filter(([k,v])=>/catégorie|catégorie professionnelle$/.test(k)).map(([k,v])=>v).join('/')||'-';
    console.log(String(y).padStart(2),'ans |',lab.padEnd(44),'|',o.r.type==='result'?String(o.r.result.value).padStart(9):o.r.ineligibility||o.r.type,'|',JSON.stringify(o.r.formula&&o.r.formula.formula)); }
}
```

## Fichier package.json

```
{ "name": "indemnites-recoupement", "private": true, "version": "1.0.0",
  "dependencies": { "@socialgouv/modeles-social": "4.253.1" },
  "scripts": { "recoupement": "node compare3.js 2>/dev/null && node compare-retraite-legal.js 2>/dev/null && node gen-croisement.js ../croisement-data.js", "veille": "node veille.js --reference veille-reference.json" } }
```

## Fichier refs.json

```
{"1043": [["Article 16", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000034978460"]], "1090": [["Article 1.13", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000037958848"], ["Article 2.13", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000037964084"]], "1147": [["Article 25", "https://www.legifrance.gouv.fr/conv_coll/id/KALIARTI000027745280/"], ["Article 13", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005856073"]], "1483": [["Article 17, Chapitre Ier", "https://www.legifrance.gouv.fr/conv_coll/id/KALIARTI000022017249/"], ["Article 18, Chapitre Ier", "https://www.legifrance.gouv.fr/conv_coll/id/KALIARTI000022017246/"], ["Article 31", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005840280"], ["Article 11, Chapitre II", "https://www.legifrance.gouv.fr/conv_coll/id/KALIARTI000022017243/"]], "1486": [["Article 23 de l’Annexe IV. Enquêteurs. Accord du 16 décembre 1991", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000047651985"], ["Article 24 de l’Annexe IV. Enquêteurs. Accord du 16 décembre 1991", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005851322"], ["Article 3.5", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000047513827"], ["Article 11.6", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000047513898"], ["Article 4.5 Avenant n°46", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000047513839"]], "1501": [["Article 13", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005833468"]], "1505": [["Article 21", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000043562753"], ["Article 42.5.2", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000043562840"]], "1517": [["Article 4, Chapitre VI", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000046093607"]], "1518": [["Article 4.4.3", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000044530995"], ["Article 6.3.4", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000027717742"]], "1527": [["Article 33", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000042096651"], ["Article 23", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000042096676"], ["Article 41", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000042096630"], ["Article 37.3.1", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000042096638"]], "1596": [["Article 10.3", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005778355"], ["Article 10.4", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005778357"], ["Article 10.5", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005778358"]], "1597": [["Article 10.3", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005776857"], ["Article 10.4", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005776858"], ["Article 10.5", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005776860"]], "1979": [["Article 32", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005826298"]], "1996": [["Article 21", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000038106393"], ["Article 11", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000038106382"], ["Article 6 de l'annexe Cadres", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000041761357"]], "2098": [["Article 3.1 de l’Avenant cadres", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005850668"]], "2216": [["Article 7 de l’Annexe I Employés et ouvriers, personnel de livraison", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000041517490"], ["Article 6 de l’Annexe I Employés et ouvriers, personnel de livraison", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000041517485"], ["Article 3.13", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000039111891"], ["Article 7 de l’Annexe II relative aux agents de maîtrise et techniciens", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000041517524"], ["Article 6 de l’Annexe II relative aux agents de maîtrise et techniciens", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000041517519"], ["Article 7 de l’Annexe III Cadres", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000041517561"], ["Article 6 de l’Annexe III Cadres", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000041517556"]], "2511": [["Article 4.4.3.3", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000042110557"], ["Article 7.1.2", "https://www.legifrance.gouv.fr/conv_coll/id/KALIARTI000042110596/"]], "2596": [["Article 7.5.1", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000018563854"]], "2609": [["Article 8.4", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000018773860"], ["Article 8.5", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000018773861"], ["Article 8.13", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000018773880"], ["Article 8.7", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000018773870"]], "3043": [["Article 4.11.3", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000027172424"], ["Article 4.2", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000027172405"]], "3127": [["Partie II, Chapitre 4, section 1, article 1.2", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000027034201"]], "3248": [["Article 75.3.1.2", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000046314538"]], "0016": [["Article 14 de l’Accord du 27 février 1951 relatif aux employés Annexe II", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005849373"], ["Article 18 de l’Accord du 30 mars 1951 relatif aux techniciens et agents de maîtrise Annexe III", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005849264"], ["Article 17 de l’Accord du 30 octobre 1951 relatif aux ingénieurs et cadres Annexe IV", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005849570"]], "0573": [["Article 37", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000026802009"], ["Article 4 de l’Avenant II relatif aux agents de maîtrise et techniciens, secteur alimentaire", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000026802068"], ["Article 4 de l’Avenant II relatif aux agents de maîtrise et techniciens, secteur non alimentaire", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000026802084"], ["Article 4 de l’Avenant I relatif aux cadres", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000026802057"]], "0843": [["Article 33", "https://www.legifrance.gouv.fr/conv_coll/id/KALIARTI000005873155/"]], "0787": [["Article 6.2.1", "https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000051345600"]]}```
