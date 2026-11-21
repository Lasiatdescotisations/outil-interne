/* ===== Export PDF de la fiche (jsPDF) : blocs au choix, présentation client possible ===== */
const PDF_BLOCS = [
  { id:'auteur',   label:'Auteur du calcul (« Établi par »)' },
  { id:'ident',    label:'Salarié, motif et convention' },
  { id:'dates',    label:'Dates et ancienneté retenue' },
  { id:'absences', label:'Absences examinées pour l\'ancienneté' },
  { id:'mois',     label:'Rémunération des 12 derniers mois (tableau)' },
  { id:'sr',       label:'Salaire de référence (moyennes 12 et 3 mois)' },
  { id:'cmp',      label:'Comparaison légal / conventionnel' },
  { id:'detail',   label:'Détail du calcul (formules et étapes)' },
  { id:'montants', label:'Indemnité retenue, arrondi et total' },
  { id:'contrib',  label:'Contribution patronale' },
  { id:'regime',   label:'Régime social et fiscal' },
  { id:'csp',      label:'CSP et préavis (licenciement économique)' },
  { id:'hono',     label:'Honoraires du cabinet' },
  { id:'cal',      label:'Calendrier de la procédure' },
  { id:'alertes',  label:'Points d\'attention' },
  { id:'notes',    label:'Notes et remarques' },
  { id:'regles',   label:'Règles appliquées et sources' }
];
const PDF_PRESETS = {
  client:  ['auteur','ident','dates','absences','cmp','montants','contrib','cal'],
  complet: PDF_BLOCS.map(b=>b.id)
};

/* La police standard du PDF ne couvre que Latin-1 / Windows-1252 : on remplace les signes hors jeu. */
function pdfSan(s){
  return String(s==null?'':s).normalize('NFC')
    .replace(/[     ]/g,' ')
    .replace(/≤/g,'<=').replace(/≥/g,'>=').replace(/→/g,'->').replace(/←/g,'<-').replace(/≈/g,'~').replace(/≠/g,'<>')
    .replace(/[−]/g,'-').replace(/⅓/g,'1/3').replace(/⅕/g,'1/5').replace(/⅔/g,'2/3').replace(/✓/g,'oui').replace(/✗/g,'non')
    .replace(/[‘’]/g,"'").replace(/[“”]/g,'"')
    .replace(/[^ -~¡-ÿ€Œœ–—•…]/g,'');
}

function buildPdf(JsPDF, d){
  const { S, r, rows, opts, MOTIFS, ccnNom, regles, cal, fmtEur, fmtMois, fr, fmtAnc, sr12, sr3 } = d;
  const sel = new Set(opts.sel);
  const doc = new JsPDF({ unit:'mm', format:'a4', compress:true });
  const W=210, M=16, CW=W-2*M, FOOT=16; let H = opts.single ? 100000 : 297; /* image : une seule page continue */
  /* Deux styles : « site » (couleur choisie dans les paramètres) et « neutre » (noir et blanc, lisible à l'impression monochrome). */
  const neutre = opts.style==='neutre';
  const hx = h => [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const mixc = (a,b,k) => a.map((v,i)=>Math.round(v*(1-k)+b[i]*k));
  const BASE = hx(opts.accent||'#0d6656');
  const ACC = neutre?[0,0,0]:BASE, ACCSOFT = neutre?[242,242,242]:mixc(BASE,[255,255,255],.88), INK = neutre?[0,0,0]:[23,25,28], MUT = neutre?[85,85,85]:[110,112,108],
        LINE = neutre?[165,165,165]:[214,211,203], WARN = neutre?[0,0,0]:[185,75,25], WARNSOFT = neutre?[255,255,255]:[252,235,226], GREY = neutre?[232,232,232]:[240,238,233], CARD = neutre?[255,255,255]:[250,249,246];
  let y=M;
  const san = pdfSan;
  const font = (style,size,color)=>{ doc.setFont('helvetica',style); doc.setFontSize(size); doc.setTextColor(color[0],color[1],color[2]); };
  const lhOf = size => size*0.3528*1.38;
  const ensure = h => { if(y+h>H-FOOT){ doc.addPage(); y=M; } };
  const para = (txt, o={}) => {
    const size=o.size||9.5, style=o.style||'normal', color=o.color||INK, x=(o.x==null?M:o.x), w=o.w||CW, gap=o.gap==null?1.4:o.gap, ind=o.indent||0;
    font(style,size,color); const lines=doc.splitTextToSize(san(txt), w-ind); const lh=lhOf(size);
    for(const l of lines){ ensure(lh); doc.text(l, x+ind, y+lh*0.75); y+=lh; }
    y+=gap;
  };
  const bullet = (txt, o={}) => {
    const size=o.size||9.2, lh=lhOf(size); font('normal',size,o.color||INK);
    const lines=doc.splitTextToSize(san(txt), CW-6);
    lines.forEach((l,i)=>{ ensure(lh); if(i===0) doc.text('-', M+1, y+lh*0.75); doc.text(l, M+5, y+lh*0.75); y+=lh; });
    y+=0.8;
  };
  const section = title => {
    ensure(16); y+=3;
    font('bold',11,ACC); doc.text(san(title), M, y+4);
    doc.setDrawColor(ACC[0],ACC[1],ACC[2]); doc.setLineWidth(0.4); doc.line(M, y+6, W-M, y+6);
    y+=9.5;
  };
  const kv = (label, value, o={}) => {
    const size=9.5, lh=lhOf(size); font('normal',size,MUT);
    const ll=doc.splitTextToSize(san(label), o.lw||112);
    font(o.bold?'bold':'normal',size,INK); const vl=doc.splitTextToSize(san(value), CW-(o.lw||112)-4);
    const n=Math.max(ll.length,vl.length), h=n*lh+1.6; ensure(h);
    font('normal',size,MUT); ll.forEach((l,i)=>doc.text(l, M, y+lh*0.75+i*lh));
    font(o.bold?'bold':'normal',size,o.color||INK); vl.forEach((l,i)=>doc.text(l, W-M, y+lh*0.75+i*lh, {align:'right'}));
    y+=h; doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.setLineWidth(0.15); doc.line(M, y-0.5, W-M, y-0.5);
  };
  const box = (x,w,top,h,fill,stroke,lw) => { doc.setFillColor(fill[0],fill[1],fill[2]); doc.setDrawColor(stroke[0],stroke[1],stroke[2]); doc.setLineWidth(lw||0.3); doc.roundedRect(x,top,w,h,2,2,'FD'); };

  /* ---------- En-tête ---------- */
  const nomComplet = ((S.nom||'')+' '+(S.prenom||'')).trim();
  if(opts.entete){ font('normal',8.5,MUT); doc.text(san(opts.entete), M, y+3); }
  font('normal',8.5,MUT); doc.text(san('Établi le '+d.dateJour+(sel.has('auteur')&&(S.auteur||'').trim()?' par '+S.auteur.trim():'')), W-M, y+3, {align:'right'});
  y+=7;
  font('bold',17,INK); const tl=doc.splitTextToSize(san(MOTIFS[S.motif==='lic'&&S.eco?'licEco':S.motif]||'Calcul d\'indemnité'), CW);
  tl.forEach(l=>{ doc.text(l, M, y+6); y+=7.4; });
  if(ccnNom){ font('normal',10.5,INK); doc.splitTextToSize(san(ccnNom), CW).forEach(l=>{ doc.text(l, M, y+4); y+=5; }); }
  font('normal',8.5,MUT); doc.splitTextToSize(san(opts.titre || ('Calcul d\'indemnité'+(nomComplet?' - '+nomComplet:''))), CW).forEach(l=>{ doc.text(l, M, y+4); y+=4.2; }); y+=2.5;
  doc.setDrawColor(ACC[0],ACC[1],ACC[2]); doc.setLineWidth(0.8); doc.line(M, y, W-M, y); y+=5;

  /* ---------- Bandeau de résultat ---------- */
  if(sel.has('montants') && !r.erreur){
    const f=r.fin; ensure(24);
    box(M,CW,y,20,ACCSOFT,ACC,0.4);
    font('normal',9,ACC); doc.text(san(f.supra>0?'Indemnité totale (avec supra-légale)':'Indemnité'), M+5, y+6.5);
    font('bold',20,ACC); doc.text(san(fmtEur(f.total)), M+5, y+15.5);
    font('normal',9,INK);
    const sub = f.retenuArrondi ? 'Base '+r.retenu.source+(f.supra>0?' + supra-légale':'') : 'Aucune indemnité due selon ces données';
    doc.text(san(sub), W-M-5, y+8, {align:'right'});
    if(sel.has('contrib') && f.taux!==null) doc.text(san('Contribution patronale '+Math.round(f.taux*100)+' % : '+fmtEur(f.contrib)), W-M-5, y+14.5, {align:'right'});
    y+=25;
  }
  if(r.erreur){ para(r.erreur, {color:WARN, style:'bold'}); }

  /* ---------- 1. Identité ---------- */
  if(sel.has('ident')){
    section('Salarié et convention');
    kv('Salarié', nomComplet||'-'); if(S.emploi) kv('Emploi', S.emploi); if(S.statut) kv('Statut', S.statut); if(S.classif) kv('Classification', S.classif);
    kv('Motif de rupture', MOTIFS[S.motif==='lic'&&S.eco?'licEco':S.motif]||'');
    kv('Convention collective', S.ccn==='none' ? 'Code du travail seul (sans convention)' : ccnNom);
    if(d.categorieLabel) kv('Catégorie', d.categorieLabel);
    if(d.ageTxt) kv('Âge', d.ageTxt);
  }
  /* ---------- 2. Dates ---------- */
  if(sel.has('dates')){
    section('Dates et ancienneté');
    kv('Date d\'entrée', fr(S.entree)); kv('Date de fin de contrat', fr(S.sortie));
    kv(S.motif==='rc' ? 'Date de signature' : 'Date de notification', fr(S.dateRef));
    kv('Ancienneté retenue', r.erreur? '-' : fmtAnc(r.mois)+' ('+r.mois+' mois complets)', {bold:true});
  }
  if(sel.has('absences')){
    const ab = r.lignes.filter(l=>/ j\)/.test(l) || /^Total déduit/.test(l));
    section('Absences examinées pour l\'ancienneté');
    if(ab.length) ab.forEach(l=>bullet(l)); else para('Aucune absence saisie.', {color:MUT});
    if(S.remAbs) para('Remarque : '+S.remAbs, {size:9,color:MUT});
  }
  /* ---------- 3. Rémunération ---------- */
  if(sel.has('mois')){
    section('Rémunération des 12 derniers mois');
    const cw=[34,27,27,27,15,CW-130], hx=[M]; for(let i=0;i<cw.length;i++) hx.push(hx[i]+cw[i]);
    ensure(10); doc.setFillColor(GREY[0],GREY[1],GREY[2]); doc.rect(M,y,CW,6.2,'F'); font('bold',8.5,INK);
    ['Mois','Brut','Reconstitué','Total','Retenu','Note'].forEach((t,i)=>doc.text(t, i>=1&&i<=3 ? hx[i]+cw[i]-2 : hx[i]+2, y+4.3, {align:(i>=1&&i<=3)?'right':'left'}));
    y+=6.6;
    rows.forEach(m=>{
      const tot=(+m.brut||0)+(+m.recon||0); const nl=doc.splitTextToSize(san(m.note||''), cw[5]-3); const h=Math.max(1,nl.length)*lhOf(8.8)+1.2; ensure(h);
      font('normal',8.8,m.inclus===false?MUT:INK);
      doc.text(san(m.label), hx[0]+2, y+lhOf(8.8)*0.75);
      doc.text(san(fmtEur(+m.brut||0)), hx[1]+cw[1]-2, y+lhOf(8.8)*0.75, {align:'right'});
      doc.text(san(m.recon?fmtEur(+m.recon||0):''), hx[2]+cw[2]-2, y+lhOf(8.8)*0.75, {align:'right'});
      doc.text(san(fmtEur(tot)), hx[3]+cw[3]-2, y+lhOf(8.8)*0.75, {align:'right'});
      doc.text(m.inclus===false?'non':'oui', hx[4]+2, y+lhOf(8.8)*0.75);
      nl.forEach((l,i)=>doc.text(l, hx[5]+2, y+lhOf(8.8)*0.75+i*lhOf(8.8)));
      y+=h; doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.setLineWidth(0.12); doc.line(M,y-0.4,W-M,y-0.4);
    });
    y+=1.5;
  }
  if(sel.has('sr')){
    section('Salaire de référence');
    kv('Moyenne des 12 derniers mois', fmtEur(sr12)); kv('Moyenne des 3 derniers mois', fmtEur(sr3));
    kv('Salaire de référence retenu (le plus favorable)', fmtEur(Math.max(sr12,sr3)), {bold:true});
  }
  /* ---------- 4. Comparaison ---------- */
  if(sel.has('cmp') && !r.erreur){
    section('Comparaison légal / conventionnel');
    const winLeg = r.retenu.source==='légale';
    const colW=(CW-4)/2;
    const cards=[
      { t:'Minimum légal (Code du travail)', v:fmtEur(r.legal.eligible?r.legal.montant:0), x:r.legal.texte, win:winLeg },
      r.conv ? { t:'Conventionnelle', v:r.conv.montant?fmtEur(r.conv.montant):'-', x:r.conv.lignes.join(' '), win:!winLeg } : { t:'Convention collective', v:'-', x:'Code du travail seul : aucune convention sélectionnée.', win:false }
    ];
    font('normal',8.4,MUT);
    const heights = cards.map(c=>doc.splitTextToSize(san(c.x), colW-8).length*lhOf(8.4)+19);
    const h=Math.max(...heights); ensure(h+2);
    cards.forEach((c,i)=>{
      const x=M+i*(colW+4); box(x,colW,y,h,c.win?ACCSOFT:CARD,c.win?ACC:LINE,c.win?0.5:0.25);
      font('normal',8.6,c.win?ACC:MUT); doc.text(san(c.t+(c.win?' - retenu':'')), x+4, y+5.5);
      font('bold',13,INK); doc.text(san(c.v), x+4, y+12.5);
      font('normal',8.4,MUT); doc.splitTextToSize(san(c.x), colW-8).forEach((l,k)=>doc.text(l, x+4, y+17.5+k*lhOf(8.4)));
    });
    y+=h+3;
  }
  /* ---------- 5. Détail ---------- */
  if(sel.has('detail') && !r.erreur){
    section('Détail du calcul');
    d.formule.split('\n').forEach(l=>para(l,{size:8.8,color:MUT,gap:0.4}));
    y+=1.2;
    r.lignes.forEach(l=>bullet(l)); bullet(r.legal.texte);
    if(r.conv) r.conv.lignes.forEach(l=>bullet(l));
    bullet('Retenu : '+fmtEur(r.retenu.montant)+' ('+r.retenu.source+').', {color:ACC});
  }
  /* ---------- 6. Montants ---------- */
  if(sel.has('montants') && !r.erreur){
    const f=r.fin; section('Montants');
    const modeTxt = f.mode==='dizaine' ? 'arrondie à la dizaine supérieure' : f.mode==='euro' ? 'arrondie à l\'euro supérieur' : 'sans arrondi';
    kv('Indemnité retenue ('+modeTxt+')', fmtEur(f.retenuArrondi));
    if(f.supra>0){ kv('Indemnité supra-légale', fmtEur(f.supra)); }
    kv(f.supra>0?'Total':'Total de l\'indemnité', fmtEur(f.total), {bold:true});
    if(sel.has('contrib') && f.taux!==null) kv('Contribution patronale ('+Math.round(f.taux*100)+' %)', fmtEur(f.contrib));
  } else if(sel.has('contrib') && !r.erreur && r.fin && r.fin.taux!==null){
    section('Contribution patronale'); kv('Contribution patronale ('+Math.round(r.fin.taux*100)+' %)', fmtEur(r.fin.contrib), {bold:true});
  }
  if(sel.has('hono') && !r.erreur && r.fin.honoraires!==null && !isNaN(r.fin.honoraires)){
    section('Honoraires'); kv('Honoraires', fmtEur(r.fin.honoraires), {bold:true});
  }
  if(sel.has('regime') && !r.erreur && r.regime){
    const g=r.regime; section('Régime social et fiscal');
    if(g.manque){ para('Rémunération brute de l\'année civile précédente non renseignée : fractions non calculées.', {color:MUT}); }
    else {
      (d.regimeRows||[]).forEach(([l,v])=>kv(l, fmtEur(v)));
      para('Cotisations salariales et impôt sur le revenu non calculés. Hors PSE et mandataires sociaux. PASS '+g.annee+' : '+fmtEur(g.pass)+'. Calcul indicatif, à valider sur le BOSS.', {size:8.5,color:MUT});
    }
  }
  if(sel.has('csp') && !r.erreur && r.csp){
    section('Contrat de sécurisation professionnelle (CSP)');
    (d.cspRows||[]).forEach(([l,v,b])=>kv(l, v, {bold:!!b}));
    r.csp.lignes.forEach(l=>bullet(l,{size:8.8,color:MUT}));
  }
  /* ---------- 7. Calendrier ---------- */
  if(sel.has('cal') && S.motif==='rc' && cal && !cal.erreur){
    const o=cal.options, L=d.frL;
    ensure(72);
    section('Calendrier de la rupture conventionnelle');
    if(cal.entretien) kv('Entretien', L(cal.entretien));
    if(cal.signature) kv('Signature de la convention', L(cal.signature)+(cal.signatureReportDepuis?' (reportée : '+L(cal.signatureReportDepuis)+' non ouvré)':''));
    if(cal.retractationDebut) kv('Délai de rétractation (15 jours calendaires)', 'du '+fr(cal.retractationDebut)+' au '+fr(cal.retractationFin));
    kv('Fin de la rétractation', L(cal.retractationFin)+(cal.retractationFin!==cal.retractationBrute?' (prorogée)':''));
    kv('Envoi de la demande d\'homologation à compter du', L(cal.envoi));
    if(o.post) kv('Réception par l\'administration', L(cal.reception));
    kv('Fin de l\'instruction (15 jours ouvrables)', L(cal.instructionFin)+(cal.instructionFin!==cal.instructionBrute?' (prorogée)':''));
    kv('Rupture du contrat au plus tôt le', L(cal.ruptureAuPlusTot), {bold:true});
    cal.notes.forEach(n=>para(n,{size:8.8,color:WARN}));
    para('Délais : L1237-13 et L1237-14 ; prorogés si samedi, dimanche ou férié (R1231-1). '+(o.am?'Jours fériés d\'Alsace-Moselle inclus. ':'Jours fériés de France métropolitaine. ')+'Calendrier indicatif, à contrôler avec le simulateur TéléRC.', {size:8.3,color:MUT});
  }
  if(sel.has('cal') && S.motif!=='rc' && d.proc){
    const L=d.frL; ensure(72);
    section('Calendrier de la procédure');
    d.proc.etapes.forEach(e=>{ kv(e.label, L(e.iso), {bold:e.key}); if(e.detail) para(e.detail,{size:8.3,color:MUT,gap:0}); });
    d.proc.notes.forEach(n=>para(n,{size:8.8,color:/non respecté|antérieure|plus d'un mois|précède/.test(n)?WARN:MUT}));
    para('Calendrier indicatif (dates au plus tôt) : délais en jours ouvrables hors dimanches et jours fériés, à contrôler avec les dispositions conventionnelles.',{size:8.3,color:MUT});
  }
  /* ---------- 8. Points d'attention ---------- */
  if(sel.has('alertes') && !r.erreur){
    section('Points d\'attention');
    r.alertes.forEach(a=>bullet(a));
  }
  if(sel.has('notes') && (S.notes||'').trim()){
    section('Notes et remarques'); (S.notes||'').trim().split(/\n+/).forEach(l=>para(l,{size:9.5,gap:1}));
  }
  /* ---------- 9. Règles ---------- */
  if(sel.has('regles')){
    section('Règles appliquées et sources');
    regles.forEach(dc=>{
      para(dc.titre, {style:'bold',size:10,color:ACC,gap:0.8});
      dc.items.forEach(x=>{ para(x[0], {style:'bold',size:9,gap:0.2}); para(x[1], {size:9,color:INK,gap:1.2,indent:3}); });
      if(dc.ambigu.length){ para('Points ambigus', {style:'bold',size:9,gap:0.4}); dc.ambigu.forEach(a=>bullet(a,{size:8.8,color:MUT})); }
      if(dc.sources.length){ para('Sources', {style:'bold',size:9,gap:0.4}); dc.sources.forEach(s=>bullet(s[0]+' - '+s[1],{size:8.2,color:MUT})); }
      if(dc.provisoire) para('Règle provisoire : à valider sur le texte de la convention (Légifrance).', {size:8.5,color:WARN});
      y+=2;
    });
  }

  /* ---------- Pieds de page ---------- */
  if(opts.single){ H = y+FOOT; }
  doc.contentHeight = H;
  const n=doc.getNumberOfPages(), note=opts.note||'Calcul indicatif, à valider avant toute utilisation. Montants bruts.';
  for(let p=1;p<=n;p++){
    doc.setPage(p); doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.setLineWidth(0.2); doc.line(M,H-12,W-M,H-12);
    font('normal',7.8,MUT); doc.text(san(note), M, H-8, {maxWidth:CW-24}); doc.text('Page '+p+' / '+n, W-M, H-8, {align:'right'});
  }
  return doc;
}


/* ===== Rendu image : même mise en page que le PDF, dessinée sur un canvas (une seule page continue) =====
   Imite la partie de l'API jsPDF utilisée par buildPdf. Les unités sont des millimètres, comme dans le PDF. */
function makeCanvasDoc(scale){
  const mcv = (typeof document!=='undefined') ? document.createElement('canvas') : null;
  const mctx = mcv ? mcv.getContext('2d') : null;
  const st = { font:'helvetica', style:'normal', size:10, text:[0,0,0], draw:[0,0,0], fill:[255,255,255], lw:0.2 };
  const ops = []; let maxY = 0;
  const PT = 25.4/72;
  const fontStr = (k,s) => (s.style==='bold'?'bold ':'') + (s.size*PT*k).toFixed(2) + 'px Helvetica, Arial, "Liberation Sans", sans-serif';
  const rgb = a => 'rgb('+a[0]+','+a[1]+','+a[2]+')';
  const snap = () => ({ ...st, text:st.text.slice(), draw:st.draw.slice(), fill:st.fill.slice() });
  const measure = s => { mctx.font = fontStr(scale, st); return mctx.measureText(s).width/scale; };
  const rr = (c,x,y,w,h,r) => { c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); };
  const doc = {
    setFont(n,s){ st.style = s==='bold' ? 'bold' : 'normal'; return doc; },
    setFontSize(s){ st.size=s; return doc; },
    setTextColor(r,g,b){ st.text=[r,g,b]; return doc; },
    setDrawColor(r,g,b){ st.draw=[r,g,b]; return doc; },
    setFillColor(r,g,b){ st.fill=[r,g,b]; return doc; },
    setLineWidth(w){ st.lw=w; return doc; },
    splitTextToSize(text,maxW){
      const out=[];
      String(text).split('\n').forEach(par=>{
        const words=par.split(' '); let cur='';
        words.forEach(w=>{ const t=cur?cur+' '+w:w; if(cur && measure(t)>maxW){ out.push(cur); cur=w; } else cur=t;
          while(measure(cur)>maxW && cur.length>1){ let n=cur.length; while(n>1 && measure(cur.slice(0,n))>maxW) n--; out.push(cur.slice(0,n)); cur=cur.slice(n); } /* mot trop long (adresse web) : coupé */ });
        out.push(cur);
      });
      return out;
    },
    text(str,x,y,o){
      o=o||{}; const s=snap();
      const lines = o.maxWidth ? doc.splitTextToSize(str,o.maxWidth) : [String(str)];
      lines.forEach((l,i)=>{ const yy=y+i*s.size*PT*1.2; if(yy>maxY) maxY=yy+1;
        ops.push((c,k)=>{ c.font=fontStr(k,s); c.fillStyle=rgb(s.text); c.textAlign=o.align==='right'?'right':'left'; c.textBaseline='alphabetic'; c.fillText(l,x*k,yy*k); }); });
      return doc;
    },
    line(x1,y1,x2,y2){ const s=snap(); if(y2>maxY) maxY=y2;
      ops.push((c,k)=>{ c.strokeStyle=rgb(s.draw); c.lineWidth=Math.max(1,s.lw*k); c.beginPath(); c.moveTo(x1*k,y1*k); c.lineTo(x2*k,y2*k); c.stroke(); }); return doc; },
    rect(x,y,w,h,style){ const s=snap(); if(y+h>maxY) maxY=y+h;
      ops.push((c,k)=>{ if(/F/.test(style||'')){ c.fillStyle=rgb(s.fill); c.fillRect(x*k,y*k,w*k,h*k); } if(/D/.test(style||'') || !style){ c.strokeStyle=rgb(s.draw); c.lineWidth=Math.max(1,s.lw*k); c.strokeRect(x*k,y*k,w*k,h*k); } }); return doc; },
    roundedRect(x,y,w,h,rx,ry,style){ const s=snap(); if(y+h>maxY) maxY=y+h;
      ops.push((c,k)=>{ rr(c,x*k,y*k,w*k,h*k,rx*k); if(/F/.test(style||'')){ c.fillStyle=rgb(s.fill); c.fill(); } if(/D/.test(style||'')){ c.strokeStyle=rgb(s.draw); c.lineWidth=Math.max(1,s.lw*k); c.stroke(); } }); return doc; },
    addPage(){ return doc; }, setPage(){ return doc; }, getNumberOfPages(){ return 1; },
    /* Dessine l'ensemble ; réduit la définition si l'image dépasserait les limites des navigateurs. */
    toCanvas(widthMm){
      const H = Math.max(doc.contentHeight||maxY+16, 40);
      let k = scale; const LIM = 15000; if(H*k>LIM) k = LIM/H;
      const cv = document.createElement('canvas'); cv.width=Math.round(widthMm*k); cv.height=Math.round(H*k);
      const c = cv.getContext('2d'); c.fillStyle='#fff'; c.fillRect(0,0,cv.width,cv.height);
      ops.forEach(f=>f(c,k)); return cv;
    }
  };
  return doc;
}
function canvasToBlob(cv, type, q){
  return new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error('toBlob')), type||'image/png', q));
}

if(typeof module!=='undefined') module.exports={ buildPdf, PDF_BLOCS, PDF_PRESETS, pdfSan, makeCanvasDoc };
