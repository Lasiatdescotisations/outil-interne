// Profil « légal / conventionnel » par convention et par motif : balayage d'une grille de cas (ancienneté, âge, catégorie, assiette, motif économique).
// Écrit profils-data.js (constante PROFILS). À relancer après toute modification du moteur (build.py le fait).
const e=require('./engine.js'), fs=require('fs');
const MOTS=['rc','lic','licEco','inaptNP','inaptP','miseRet','departRet'];
const MS=[9,12,18,24,36,60,96,120,144,180,240,300,360,480];
const addM=(n)=>{ const d=new Date(Date.UTC(2024,11,31)); d.setUTCMonth(d.getUTCMonth()-n); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10); };
const R={};
for(const id of Object.keys(e.CCN)){
  const c=e.CCN[id], cats=c.categories?c.categories.map(x=>x[0]):[undefined]; R[id]={};
  for(const m of MOTS){
    let n=0,sup=0,inf=0,egal=0,nm=0,a=null,b=null;
    for(const ms of MS) for(const age of [40,57,63]) for(const cat of cats) for(const eco of (m==='licEco'?[true]:[false])) for(const k of [1,1.15]){
      const r=e.compute({motif:m==='licEco'?'lic':m,ccn:id,entree:addM(ms),sortie:'2024-12-31',sr12:2500,sr3:2500*k,srLast:2500*k,age,categorie:cat,eco});
      if(r.erreur) continue;
      if(!r.conv||r.conv.nonModelise){ nm++; continue; }
      const d=r.conv.montant-r.legal.montant; n++;
      if(d>0.01){ sup++; if(a===null||ms<a) a=ms; if(b===null||ms>b) b=ms; } else if(d<-0.01) inf++; else egal++;
    }
    const cl = n===0?'nd' : (sup>0&&inf>0)?'cas' : sup>0?'conv' : inf>0?'legal' : 'egal';
    R[id][m]={c:cl,p:(n>0&&nm>0)?1:0,a,b};
  }
}
fs.writeFileSync(__dirname+'/profils-data.js','const PROFILS = '+JSON.stringify(R)+';\n');
console.log('profils-data.js', Object.keys(R).length, 'conventions');
