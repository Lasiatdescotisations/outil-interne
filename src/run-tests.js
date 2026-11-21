const { compute } = require('./engine.js');
const { TESTS, REGIME_TESTS, CSP_TESTS, PROC_TESTS } = require('./tests.js');
let ko = 0;
for (const t of TESTS) {
  const r = compute(t.inp);
  const checks = [];
  if (r.erreur) checks.push('erreur: ' + r.erreur);
  else {
    if (r.mois !== t.mois) checks.push(`mois ${r.mois} ≠ ${t.mois}`);
    if (Math.abs(r.legal.montant - t.legal) > 0.011) checks.push(`légal ${r.legal.montant} ≠ ${t.legal}`);
    if (t.conv !== undefined && Math.abs(r.conv.montant - t.conv) > 0.011) checks.push(`conv ${r.conv.montant} ≠ ${t.conv}`);
    if (Math.abs(r.retenu.montant - t.retenu) > 0.011) checks.push(`retenu ${r.retenu.montant} ≠ ${t.retenu}`);
    if (t.arrondi !== undefined && r.fin.retenuArrondi !== t.arrondi) checks.push(`arrondi ${r.fin.retenuArrondi} ≠ ${t.arrondi}`);
    if (t.total !== undefined && Math.abs(r.fin.total - t.total) > 0.011) checks.push(`total ${r.fin.total} ≠ ${t.total}`);
    if (t.contrib !== undefined && t.contrib !== null && Math.abs(r.fin.contrib - t.contrib) > 0.011) checks.push(`contrib ${r.fin.contrib} ≠ ${t.contrib}`);
  }
  if (checks.length) ko++;
  console.log((checks.length ? 'KO ' : 'OK ') + t.nom + (checks.length ? '  → ' + checks.join(' | ') : ''));
}

/* ---------- calendrier de la rupture conventionnelle (règles de l'outil Antevorta) ---------- */
const { calendrierRC } = require('./engine.js');
const CAL = [
  ['Signature 04/09/2025 : capture du simulateur (19/09, 20/09, 09/10)', '2025-09-04', {}, {retractationFin:'2025-09-19', envoi:'2025-09-20', instructionFin:'2025-10-08', ruptureAuPlusTot:'2025-10-09'}],
  ['Rétractation expirant un samedi : prorogée au lundi', '2025-09-05', {}, {retractationBrute:'2025-09-20', retractationFin:'2025-09-22', envoi:'2025-09-23'}],
  ['Instruction expirant un samedi : prorogée au lundi', '2024-01-01', {sigOuvre:false}, {retractationFin:'2024-01-16', instructionBrute:'2024-02-03', instructionFin:'2024-02-05', ruptureAuPlusTot:'2024-02-06'}],
  ['Vendredi saint compté en métropole', '2025-03-28', {}, {retractationFin:'2025-04-14', instructionFin:'2025-05-05', ruptureAuPlusTot:'2025-05-06'}],
  ['Alsace-Moselle : Vendredi saint non compté', '2025-03-28', {am:true}, {instructionFin:'2025-05-06', ruptureAuPlusTot:'2025-05-07'}],
  ['Dépôt un jour ouvré (samedi → lundi)', '2025-09-04', {depOuvre:true}, {depot0:'2025-09-20', envoi:'2025-09-22', instructionFin:'2025-10-09', ruptureAuPlusTot:'2025-10-10'}],
  ['Marges de 2 j avant dépôt et 3 j avant rupture', '2025-09-04', {mDep:2, mRup:3}, {envoi:'2025-09-22', ruptureAuPlusTot:'2025-10-13'}],
  ['Mode entretien un samedi : signature reportée au lundi', '2025-09-06', {mode:'ent', ent:'2025-09-06'}, {signature:'2025-09-08', signatureReportDepuis:'2025-09-06'}],
  ['Mode rupture souhaitée 09/10/2025 : signature au plus tard le 04/09', '2025-10-09', {mode:'rup', d_rup:'2025-10-09'}, {signature:'2025-09-04', ruptureAuPlusTot:'2025-10-09'}],
  ['Mode fin de rétractation 19/09/2025', '2025-09-19', {mode:'ret', d_ret:'2025-09-19'}, {signature:null, envoi:'2025-09-20', instructionFin:'2025-10-08', ruptureAuPlusTot:'2025-10-09'}]
];
const { ageAt } = require('./engine.js');
let koAge = 0;
for (const [n, d, att] of [['né le 29/02/2000, au 28/02/2025', ['2000-02-29','2025-02-28'], 24], ['né le 29/02/2000, au 01/03/2025', ['2000-02-29','2025-03-01'], 25], ['anniversaire le jour même', ['1970-06-15','2025-06-15'], 55], ['veille de l\'anniversaire', ['1970-06-15','2025-06-14'], 54]]) {
  const a = ageAt(d[0], d[1]); if (a !== att) koAge++;
  console.log((a === att ? 'OK ' : 'KO ') + 'Âge — ' + n + (a === att ? '' : '  → ' + a + ' ≠ ' + att));
}
let koCal = 0;
for (const [nom, d, cfg, att] of CAL) {
  const r = calendrierRC(d, cfg), bad = [];
  if (!r || r.erreur) bad.push('aucun résultat'); else for (const k in att) if (r[k] !== att[k]) bad.push(`${k} ${r[k]} ≠ ${att[k]}`);
  if (bad.length) koCal++;
  console.log((bad.length ? 'KO ' : 'OK ') + 'Calendrier RC — ' + nom + (bad.length ? '  → ' + bad.join(' | ') : ''));
}

/* ---------- régime social et fiscal ---------- */
const { regimeSocialFiscal } = require('./engine.js');
let koReg = 0;
for (const t of REGIME_TESTS) {
  const r = regimeSocialFiscal(t.p), bad = [];
  for (const k in t.att) { const a = r[k], b = t.att[k]; if (b === null ? a !== null : Math.abs(a - b) > 0.011) bad.push(`${k} ${a} ≠ ${b}`); }
  if (bad.length) koReg++;
  console.log((bad.length ? 'KO ' : 'OK ') + 'Régime — ' + t.nom + (bad.length ? '  → ' + bad.join(' | ') : ''));
}
/* ---------- CSP ---------- */
const { calculCsp, preavisLegalMois, compute: computeCsp } = require('./engine.js');
let koCsp = 0;
for (const t of CSP_TESTS) {
  const bad = [];
  if (t.legal) { for (const [m, att] of t.legal) if (preavisLegalMois(m) !== att) bad.push(`préavis légal ${m} mois → ${preavisLegalMois(m)} ≠ ${att}`); }
  else if (t.p) { const r = calculCsp(t.p); for (const k in t.att) { const a = r[k], b = t.att[k]; if (b === null ? a !== null : Math.abs(a - b) > 0.011) bad.push(`${k} ${a} ≠ ${b}`); } }
  else { const r = computeCsp(t.inp); const g = k => k.split('.').reduce((o, x) => o && o[x], r) ?? (r.csp && r.csp[k]); for (const k in t.att) { const a = g(k), b = t.att[k]; if (a === undefined || Math.abs(a - b) > 0.011) bad.push(`${k} ${a} ≠ ${b}`); } }
  if (bad.length) koCsp++;
  console.log((bad.length ? 'KO ' : 'OK ') + 'CSP — ' + t.nom + (bad.length ? '  → ' + bad.join(' | ') : ''));
}
/* ---------- Calendriers par motif ---------- */
const { calendrierProcedure } = require('./engine.js');
let koProc = 0;
for (const t of PROC_TESTS) {
  const c = calendrierProcedure(t.m, t.cfg), bad = [];
  const find = re => (c.etapes.find(e => re.test(e.label)) || {}).iso;
  const got = { ent: find(/^Entretien/), notif: find(/^Notification du licenciement/), fin: c.fin, repr: find(/^Reprise du salaire/), interro: find(/^Interrogation/) };
  for (const k in t.att) if (got[k] !== t.att[k]) bad.push(`${k} ${got[k]} ≠ ${t.att[k]}`);
  if (bad.length) koProc++;
  console.log((bad.length ? 'KO ' : 'OK ') + 'Calendrier — ' + t.nom + (bad.length ? '  → ' + bad.join(' | ') : ''));
}
ko += koProc;
ko += koCsp;
ko += koReg;
ko += koCal + koAge;
console.log(ko ? `\n${ko} échec(s)` : `\nTous les ${TESTS.length} tests de montants, ${CAL.length} de calendrier, 4 d'âge et ${REGIME_TESTS.length} de régime social et fiscal et ${CSP_TESTS.length} de CSP et ${PROC_TESTS.length} de calendriers de procédure passent`);
process.exit(ko ? 1 : 0);
