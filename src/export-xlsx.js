/* ===== Export Excel : reprend la disposition de vos feuilles « Calculs » (avec formules) ===== */
function buildWorkbook(XLSX, S, r, rows, legalLines){
  const ws = {}; let maxRow = 1;
  const serial = iso => { const d=parseISO(iso); return (Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-Date.UTC(1899,11,30))/86400000; };
  const put = (addr, v, o) => {
    o = o || {};
    const c = {};
    if(typeof v==='number'){ c.t='n'; c.v=v; } else if(v==null){ return; } else { c.t='s'; c.v=String(v); }
    if(o.f){ c.f=o.f; if(o.v!==undefined){ c.t='n'; c.v=o.v; } }
    if(o.z) c.z=o.z;
    ws[addr]=c;
    const row=+addr.replace(/[A-Z]+/,''); if(row>maxRow) maxRow=row;
  };
  const money='#,##0.00', date='dd/mm/yyyy';
  const mode = r.fin.mode;

  /* En-tête */
  put('A1', S.nom||''); put('B1', S.prenom||''); put('E1', S.emploi||'');
  put('A2','Classification'); put('B2', S.classif||''); put('D2','Statut'); put('E2', S.statut||'');

  /* Ancienneté */
  const excl = Math.max(0, Math.round(r.mois ? 0 : 0)); // recalculé ci-dessous
  const debutOrig = parseISO(S.entree), sortie = parseISO(S.sortie);
  // jours déduits = écart entre entrée et début d'ancienneté retenu
  let joursDeduits = 0;
  const m = r.lignes.find(l=>/^Total déduit/.test(l)); if(m){ joursDeduits = parseInt(m.replace(/\D+/g,' ').trim().split(' ')[0],10)||0; }
  put('A4','Ancienneté'); put('C4','Entrée le'); put('D4', serial(S.entree), {z:date}); put('E4','Sortie le'); put('F4', serial(S.sortie), {z:date});
  put('A5','Absences déduites (jours)'); put('B5', joursDeduits);
  put('C5','soit');
  put('D5', Math.floor(r.mois/12), {f:'DATEDIF(D4+B5,F4+1,"y")', v:Math.floor(r.mois/12)}); put('E5','ans');
  put('D6', r.mois%12, {f:'DATEDIF(D4+B5,F4+1,"ym")', v:r.mois%12}); put('E6','mois');

  /* Remarques */
  const ccnTxt = r.conv ? (r.conv.montant>r.legal.montant ? 'CCN : supérieur au légal' : 'CCN : inférieur au légal') : '';
  put('A8', S.remCcn || ccnTxt); put('E8', S.remAbs || '');

  /* 12 mois */
  put('B10','Brut'); put('C10','Reconstitué'); put('D10','Total');
  const tot = [];
  rows.forEach((x,i)=>{
    const row=11+i, t=(+x.brut||0)+(+x.recon||0); tot.push(t);
    put('A'+row, serial(x.date), {z:'mmm yyyy'});
    put('B'+row, +x.brut||0, {z:money});
    if(+x.recon) put('C'+row, +x.recon, {z:money});
    put('D'+row, t, {f:`C${row}+B${row}`, v:t, z:money});
    const lib = [x.note, x.inclus===false?'exclu de la moyenne':''].filter(Boolean).join(' — ');
    if(lib) put('E'+row, lib);
  });
  const sum = tot.reduce((a,b)=>a+b,0);
  put('D24', sum, {f:'SUM(D11:D22)', v:sum, z:money});
  const inc = rows.map((x,i)=>x.inclus!==false ? 11+i : null).filter(Boolean);
  const contiguous = inc.length && inc.every((v,i)=>v===inc[0]+i) && inc[inc.length-1]===22;
  const avgRef = contiguous ? `D${inc[0]}:D22` : inc.map(n=>'D'+n).join(',');
  const sr = salaireDepuisMois(rows);
  put('A26','Moyenne 12 mois'); put('C26', sr.sr12, {f:`AVERAGE(${avgRef})`, v:sr.sr12, z:money});
  if(inc.length<12) put('D26', `sur ${inc.length} mois`);
  put('A27','Moyenne 3 mois'); put('C27', sr.sr3, {f:'AVERAGE(D20:D22)', v:sr.sr3, z:money});

  /* Formules */
  const hasConv = !!(r.conv && r.exprConv);
  const isRetraiteDep = S.motif==='departRet';
  put('A29', hasConv ? 'Soit' : 'Soit légal');
  const legMontant = r.legal.eligible ? r.legal.montant : 0;
  put('B29', legMontant, { f: r.legal.eligible ? `MAX(C26,C27)*(${r.exprLegal})` : '0', v:legMontant, z:money });
  if(hasConv){
    const baseRef = r.conv.baseKey==='sr12' ? 'C26' : r.conv.baseKey==='srMax3' ? (sr.lastIdx>=0 ? `MAX(C26,C27,D${11+sr.lastIdx})` : 'MAX(C26,C27)') : 'MAX(C26,C27)';
    put('D29', r.conv.montant, { f:`${baseRef}*(${r.exprConv})`, v:r.conv.montant, z:money });
    put('B30','Légal'); put('D30','CCN');
  }
  put('A31', S.motif==='rc' ? 'Rupture conventionnelle légale' : 'Indemnité de ' + (MOTIFS[S.motif==='lic'&&S.eco?'licEco':S.motif]||'rupture').toLowerCase());

  /* Retenu, supra, total, contribution, honoraires */
  let row = 33;
  const best = hasConv ? 'MAX(B29,D29)' : 'B29';
  const fnArr = mode==='dizaine' ? `CEILING(${best},10)` : mode==='euro' ? `ROUNDUP(${best},0)` : `ROUND(${best},2)`;
  put('A'+row, 'Indemnité retenue'); put('C'+row, r.fin.retenuArrondi, {f:fnArr, v:r.fin.retenuArrondi, z:money});
  const rRet=row; row++;
  let rTot=rRet;
  if(r.fin.supra>0){
    put('A'+row,'Supra légale'); put('C'+row, r.fin.supra, {z:money}); const rS=row; row++;
    put('A'+row,'Total'); put('C'+row, r.fin.total, {f:`C${rRet}+C${rS}`, v:r.fin.total, z:money}); rTot=row; row++;
  }
  if(r.fin.taux!==null){
    const pct=Math.round(r.fin.taux*100);
    put('A'+row,`URSSAF ${pct}%`); put('C'+row, r.fin.contrib, {f:`C${rTot}*${r.fin.taux}`, v:r.fin.contrib, z:money}); row++;
  }
  if(r.fin.honoraires!==null && !isNaN(r.fin.honoraires)){ put('A'+row,'Honoraires'); put('C'+row, r.fin.honoraires, {z:money}); row++; }

  ws['!ref'] = `A1:F${Math.max(maxRow,row)}`;
  ws['!cols'] = [{wch:34},{wch:14},{wch:14},{wch:16},{wch:34},{wch:12}];

  /* Feuille Légal : texte des règles utilisées (à la place des captures d'écran) */
  const wl = {}; let lr=1;
  const lput=(t,bold)=>{ wl['A'+lr]={t:'s',v:String(t)}; lr++; };
  (legalLines||[]).forEach(l=>lput(l));
  wl['!ref']=`A1:A${Math.max(lr-1,1)}`; wl['!cols']=[{wch:140}];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Calculs');
  XLSX.utils.book_append_sheet(wb, wl, 'Légal');
  wb.Workbook = { CalcPr:{ fullCalcOnLoad:true } };
  return wb;
}
if(typeof module!=='undefined') module.exports={ buildWorkbook };
