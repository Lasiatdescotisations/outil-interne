/* ===== Import d'une « fiche individuelle » Silae (12 mois de référence) =====
   Entrée : tableau de lignes (sheet_to_json header:1). Sortie : lignes classées + calcul par mois.
   Principe : Brut (Silae) + Reconstitué = Total. Reconstitué = − somme des lignes « neutralisées »
   (absence réintégrée, prime retirée…). Choix par rubrique ; les cas douteux sont à trancher. */

const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const _plain = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const _num = v => {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { const n = parseFloat(v.replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : null; }
  return null;
};
function _monthCell(v) {
  if (v instanceof Date && !isNaN(v)) return { y: v.getFullYear(), m: v.getMonth() + 1 };
  const s = _plain(v); if (!s) return null;
  for (let i = 0; i < 12; i++) {
    const m = s.match(new RegExp('^' + _plain(MOIS_FR[i]) + '\\s+(\\d{4})$'));
    if (m) return { y: +m[1], m: i + 1 };
  }
  return null;
}
const _r2 = x => Math.round(x * 100) / 100;

/* Types de rubriques et choix proposé par défaut.
   dec : 'garder' (reste dans le brut) | 'neutraliser' (annule l'effet de la ligne : réintègre l'absence / retire la prime)
   ask : true = à confirmer par l'utilisateur (ambigu) */
function classify(label, ctx) {
  const p = _plain(label);
  if (/^heures travaill/.test(p)) return { kind: 'heures', dec: 'garder', ask: false, ignore: true };
  if (/^sous-total/.test(p) || p === 'brut') return { kind: 'sous-total', ignore: true };
  if (!p) return { kind: 'sans-libelle', ignore: true };
  // absences non rémunérées : ambigu (la fiche ne dit pas toujours s'il faut réintégrer)
  if (/absence non remuneree|conge sans solde|absence injustifiee|mise a pied/.test(p))
    return { kind: 'abs-non-remuneree', dec: 'garder', ask: true, why: 'Absence non rémunérée : à réintégrer ou à laisser réduire la moyenne ?' };
  // indemnités journalières, ajustement du net : toujours neutralisés (ni salaire, ni absence réelle)
  if (/ijss|indemnites? journalieres?|ajustement du net/.test(p))
    return { kind: 'ijss', dec: 'neutraliser', ask: false, why: 'IJSS / ajustement du net : retirés du brut.' };
  if (/maintien/.test(p)) return { kind: 'maintien', dec: 'neutraliser', ask: false, why: 'Maintien de salaire : neutralisé avec l\'absence.' };
  if (/^indemnites? complementaires?|^complement (maladie|prevoyance)/.test(p))
    return { kind: 'maintien', dec: 'neutraliser', ask: false, why: 'Indemnité complémentaire d\'absence : neutralisée avec l\'absence.' };
  if (/maladie|accident|paternite|maternite|adoption|accueil de l'enfant|enfant malade|mi-temps therapeutique|^absences?$/.test(p))
    return { kind: 'absence', dec: 'neutraliser', ask: false, why: 'Absence : salaire réintégré.' };
  if (/^conges payes$/.test(p)) {
    return ctx.hasIndemCP
      ? { kind: 'cp', dec: 'garder', ask: false, why: 'Congés payés compensés par l\'indemnité de congés payés.' }
      : { kind: 'cp-seul', dec: 'neutraliser', ask: true, why: 'Congés payés en déduction sans ligne d\'indemnité correspondante : à réintégrer ?' };
  }
  if (/^indemnites? conges payes/.test(p)) return { kind: 'cp-indem', dec: 'garder', ask: false };
  if (/preavis|rupture|licenci|transaction|solde de tout compte|depart|retraite|dommages/.test(p))
    return { kind: 'rupture', dec: 'neutraliser', ask: true, why: 'Somme liée à la rupture : en principe hors salaire de référence.' };
  if (/regul|rappel|remboursement|rembourse/.test(p))
    return { kind: 'regul', dec: 'garder', ask: true, why: 'Régularisation / rappel / remboursement : appartient-elle à la période ?' };
  if (/exceptionnel|annuel|13|treizieme|vacances|gratification|bonus|participation|interessement|objectif/.test(p))
    return { kind: 'prime-except', dec: 'garder', ask: true, why: 'Prime exceptionnelle ou annuelle : à retenir, à retirer ou à proratiser.' };
  if (/frais|panier|transport|navigo|deplacement|km|ticket/.test(p))
    return { kind: 'frais', dec: 'neutraliser', ask: true, why: 'Remboursement de frais : en principe hors salaire.' };
  return { kind: 'salaire', dec: 'garder', ask: false };
}

/* Repère le tableau dans un classeur : cherche une feuille avec une ligne d'en-tête de mois et une ligne « Brut ». */
function trouverFeuille(feuilles) {
  // feuilles : [{name, rows}]
  let best = null;
  for (const f of feuilles) {
    const res = lireTableau(f.rows);
    if (res && (!best || res.mois.length > best.mois.length)) { best = { ...res, feuille: f.name }; }
  }
  return best;
}

function lireTableau(rows) {
  let hr = -1, c0 = -1, cols = [];
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const cells = rows[r] || []; const found = [];
    cells.forEach((v, c) => { const m = _monthCell(v); if (m) found.push({ c, ...m }); });
    if (found.length >= 3) { hr = r; cols = found; c0 = found[0].c; break; }
  }
  if (hr < 0) return null;
  let titre = '';
  for (let r = 0; r < hr; r++) for (const v of (rows[r] || [])) if (typeof v === 'string' && /fiche individuelle/i.test(v)) titre = v.trim();
  // colonnes contiguës (le « Total » n'est pas un mois, donc exclu)
  const mois = cols.map(x => ({ c: x.c, y: x.y, m: x.m, iso: `${x.y}-${String(x.m).padStart(2, '0')}-01`, label: `${MOIS_FR[x.m - 1]} ${x.y}` }));
  const lignes = []; let brut = null;
  const labelCols = []; for (let c = 0; c < c0; c++) labelCols.push(c);
  for (let r = hr + 1; r < rows.length; r++) {
    const cells = rows[r] || [];
    const txt = labelCols.map(c => String(cells[c] == null ? '' : cells[c]).trim()).filter(Boolean);
    const label = txt.length ? txt[txt.length - 1] : '';
    const code = txt.length > 1 ? txt[0] : '';
    const vals = mois.map(mo => _num(cells[mo.c]));
    const any = vals.some(v => v !== null);
    if (!label && !any) continue;
    if (_plain(label) === 'brut') { brut = vals.map(v => (v === null ? 0 : v)); break; }
    lignes.push({ row: r + 1, code, label, vals: vals.map(v => (v === null ? 0 : v)), any });
  }
  if (!brut) return null;
  return { mois, lignes, brut, hr: hr + 1, titre };
}

/* Analyse complète : classe chaque ligne, détecte les sections, contrôle la somme. */
function analyser(tab) {
  const labs = tab.lignes.map(l => _plain(l.label));
  const hasIndemCP = labs.some(l => /^indemnites? conges payes/.test(l));
  const ctx = { hasIndemCP };
  const out = tab.lignes.map((l, i) => {
    const cl = classify(l.label, ctx);
    return { ...l, idx: i, ...cl, aDonnees: l.vals.some(v => Math.abs(v) > 0.004) };
  });
  const details = out.filter(l => !l.ignore);
  const somme = tab.mois.map((_, k) => _r2(details.reduce((s, l) => s + l.vals[k], 0)));
  const ecart = tab.mois.map((_, k) => _r2(tab.brut[k] - somme[k]));
  return { ...tab, lignes: out, somme, ecart, controleOk: ecart.every(e => Math.abs(e) < 0.02) };
}

/* Choix : { [idx]: 'garder'|'neutraliser' } ; surcharges par mois : { 'idx:k': 'garder'|'neutraliser' }.
   Par défaut : décision proposée par classify. Mémoire : { [libelle normalisé]: 'garder'|'neutraliser' }. */
function decisionDe(l, choix, memo, k) {
  if (choix && k != null && choix[l.idx + ':' + k]) return choix[l.idx + ':' + k];
  if (choix && choix[l.idx]) return choix[l.idx];
  const key = _plain(l.label);
  if (l.ask && memo && memo[key]) return memo[key];
  return l.dec;
}

const _court = {
  'abs-non-remuneree': 'Abs. non rém.', ijss: 'IJSS', maintien: '', absence: '', cp: 'CP', 'cp-seul': 'CP',
  rupture: 'Rupture', regul: 'Régul.', 'prime-except': 'Prime', frais: 'Frais'
};
function noteCourte(l) {
  const p = _plain(l.label);
  if (/maladie/.test(p)) return 'Mal';
  if (/accident/.test(p)) return 'AT';
  if (/paternite/.test(p)) return 'Pat';
  if (/maternite/.test(p)) return 'Mat';
  if (/^absences?$/.test(p)) return 'Abs.';
  return _court[l.kind] || '';
}

/* Calcul des 12 lignes à partir des choix. Retourne [{brut, recon, note, inclus, present}] pour chaque mois du fichier. */
function appliquer(an, choix, memo) {
  return an.mois.map((mo, k) => {
    let recon = 0; const notes = [];
    for (const l of an.lignes) {
      if (l.ignore || Math.abs(l.vals[k]) < 0.005) continue;
      if (decisionDe(l, choix, memo, k) === 'neutraliser') {
        recon -= l.vals[k];
        const n = noteCourte(l);
        if (n && !notes.includes(n)) notes.push(n);
      }
    }
    recon = _r2(recon);
    // Les absences neutralisées s'annulent parfois (maladie + maintien) : pas de note si le montant est nul.
    return { brut: an.brut[k], recon: Math.abs(recon) < 0.005 ? 0 : recon, note: Math.abs(recon) < 0.005 ? '' : notes.join(' + '), inclus: true, ...mo };
  });
}

/* Aligne les mois du fichier sur les 12 mois attendus (dates ISO du 1er du mois). */
function aligner(moisFichier, cibles) {
  const idx = {}; moisFichier.forEach((m, k) => { idx[m.iso.slice(0, 7)] = k; });
  const map = cibles.map(iso => (idx[iso.slice(0, 7)] !== undefined ? idx[iso.slice(0, 7)] : -1));
  const trouves = map.filter(k => k >= 0).length;
  return { map, trouves };
}

/* « Fiche individuelle - NOM Prénom - De juillet 2024 à juin 2025 » → { nom, prenom } */
function lireTitre(t) {
  const m = String(t || '').match(/fiche individuelle\s*-\s*(.+?)\s*-\s*de\s/i);
  if (!m) return null;
  const parts = m[1].trim().split(/\s+/); const nom = []; const pre = [];
  parts.forEach(w => { (pre.length === 0 && w === w.toUpperCase() ? nom : pre).push(w); });
  return { nom: nom.join(' '), prenom: pre.join(' ') };
}

if (typeof module !== 'undefined') module.exports = { lireTitre, classify, lireTableau, trouverFeuille, analyser, appliquer, aligner, decisionDe, MOIS_FR };
