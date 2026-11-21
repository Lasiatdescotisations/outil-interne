/* Messagerie auteur (Firebase : Auth Google + Firestore). Inactive tant que la configuration est vide.
   Renseignez firebase.* (configuration « application web » du projet Firebase) et auteurEmail (adresse Google de l'auteur). */
const RETOURS_CFG = {
  firebase: { apiKey:'AIzaSyCE-8s-svYGW0uVS48UxmC0flrHL98mJCc', authDomain:'indemnites-b42a0.firebaseapp.com', projectId:'indemnites-b42a0', appId:'1:385112247145:web:cc7617b8416b151f3d8bf8' },
  auteurEmail: '', /* facultatif : l'accès est de toute façon contrôlé par les règles Firestore */
  collection: 'retours-indemnites',
  sdk: 'https://www.gstatic.com/firebasejs/10.14.1/'
};
const retoursOn = () => !!(RETOURS_CFG.firebase.apiKey && RETOURS_CFG.firebase.projectId);
let FB = null;
async function fbLoad(){
  if(FB) return FB;
  const b = RETOURS_CFG.sdk;
  const [a,au,fs] = await Promise.all([import(b+'firebase-app.js'), import(b+'firebase-auth.js'), import(b+'firebase-firestore.js')]);
  const app = a.initializeApp(RETOURS_CFG.firebase, 'indemnites');
  FB = { au, fs, auth:au.getAuth(app), db:fs.getFirestore(app) };
  return FB;
}
async function retoursEnvoi(){
  const msg = $('rm-msg').value.trim(), st = $('rm-status');
  if($('rm-hp').value) { st.textContent='Message envoyé. Merci !'; return; }
  if(msg.length<5){ st.textContent='Écrivez au moins quelques mots.'; return; }
  const btn=$('rm-send'); btn.disabled=true; st.textContent='Envoi…';
  try{
    const f = await fbLoad();
    if(!f.auth.currentUser) await f.au.signInAnonymously(f.auth);
    const doc = { type:$('rm-type').value, message:msg.slice(0,2000), statut:'nouveau', createdAt:f.fs.serverTimestamp() };
    const ct = $('rm-contact').value.trim(); if(ct) doc.contact = ct.slice(0,200);
    doc.contexte = ('Version '+HISTORIQUE_V()).slice(0,400);
    if($('rm-join').checked){ const ft=retoursFiche(retoursSel()); if(ft) doc.fiche=ft.slice(0,8000); }
    await f.fs.addDoc(f.fs.collection(f.db,RETOURS_CFG.collection), doc);
    $('rm-msg').value=''; st.textContent='Message envoyé. Merci !';
  }catch(e){ st.textContent='Envoi impossible pour le moment ('+((e&&e.code)||'erreur')+'). Utilisez le signalement GitHub ci-dessous.'; }
  btn.disabled=false;
}
const HISTORIQUE_V = () => HISTORIQUE[0].v+' du '+HISTORIQUE[0].d;
const RT_TYPES = { probleme:'Problème', idee:'Idée', question:'Question' };
let _rtUnsub=null;
let _watch=false, _auteur=false;
async function estAuteur(f,u){
  if(!u||u.isAnonymous) return false;
  try{ await f.fs.getDocs(f.fs.query(f.fs.collection(f.db,RETOURS_CFG.collection), f.fs.limit(1))); return true; }catch(e){ return false; }
}
async function auteurWatch(){
  if(_watch) return; _watch=true;
  try{
    const f=await fbLoad();
    f.au.onAuthStateChanged(f.auth, async u=>{
      _auteur = await estAuteur(f,u);
      const named = !!(u && !u.isAnonymous);
      $('nav-auteur').hidden=!_auteur;
      try{ localStorage.setItem('ind-auteur', named?'1':''); }catch(e){}
      if(!$('v-auteur').hidden) auteurRender(u,f);
      else if(!_auteur && u && !u.isAnonymous){ /* compte Google non autorisé : déconnexion silencieuse */ }
    });
  }catch(e){ _watch=false; $('au-body').innerHTML='<div class="alert">Connexion au service impossible ('+esc((e&&e.code)||e&&e.message||'erreur')+').</div>'; }
}
async function auteurInit(){
  const box=$('au-body');
  if(!retoursOn()){ box.innerHTML='<div class="hint">Messagerie non configurée.</div>'; return; }
  box.innerHTML='<div class="hint">Chargement…</div>';
  const first=!_watch; await auteurWatch();
  if(!first && FB) auteurRender(FB.auth.currentUser,FB);
}
function auteurRender(u,f){
  const box=$('au-body'); $('au-h').textContent = 'Espace auteur'; if(_rtUnsub){ _rtUnsub(); _rtUnsub=null; }
  const ok = _auteur;
  if(!ok){
    box.innerHTML = (u&&!u.isAnonymous ? '<div class="alert">Ce compte Google n\'est pas autorisé à lire les messages.</div><button class="btn sm" type="button" id="au-so" style="margin:8px 0">Se déconnecter</button>' : '')+''+(u&&!u.isAnonymous?'<p class="hint">Connecté : '+esc(u.email||'')+'.</p>':'<p class="hint">Espace réservé à l\'auteur.</p><button class="btn primary" type="button" id="au-in">Se connecter avec Google</button>')+''; if($('au-so')) $('au-so').addEventListener('click',()=>f.au.signOut(f.auth));
    $('au-in').addEventListener('click',async()=>{ try{ if(u&&!u.isAnonymous) await f.au.signOut(f.auth); await f.au.signInWithPopup(f.auth,new f.au.GoogleAuthProvider()); }catch(e){ $('au-in').insertAdjacentHTML('afterend','<div class="hint">Connexion annulée ou impossible ('+esc((e&&e.code)||'erreur')+').</div>'); } });
    return;
  }
  box.innerHTML='<div class="bar"><span class="hint" style="margin:0">Connecté : '+esc(u.email)+'</span><select id="au-f"><option value="">Tous</option><option value="nouveau">Nouveaux</option><option value="lu">Lus</option><option value="traite">Traités</option></select><button class="btn sm" type="button" id="au-out">Se déconnecter</button></div><div id="au-list" style="margin-top:10px"></div>';
  $('au-out').addEventListener('click',()=>f.au.signOut(f.auth));
  let rows=[];
  const draw=()=>{ const flt=$('au-f').value, L=rows.filter(r=>!flt||r.statut===flt);
    $('au-list').innerHTML = L.length ? L.map(r=>`<div class="card" style="margin-bottom:8px" data-id="${esc(r.id)}"><div class="hint" style="margin:0 0 6px"><b>${esc(RT_TYPES[r.type]||r.type)}</b> · ${esc(r.date)} · ${esc(r.statut)}${r.contact?' · contact : '+esc(r.contact):''}</div><div style="white-space:pre-wrap;font-size:13px">${esc(r.message)}</div>${r.contexte?`<div class="hint">${esc(r.contexte)}</div>`:''}${r.fiche?`<details style="margin-top:6px"><summary class="hint" style="cursor:pointer">Fiche jointe</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(r.fiche)}</pre></details>`:''}<div class="bar" style="margin-top:8px"><button class="btn sm" data-st="lu" type="button">Marquer lu</button><button class="btn sm" data-st="traite" type="button">Traité</button><button class="btn sm" data-del="1" type="button">Supprimer</button></div></div>`).join('') : '<div class="hint">Aucun message.</div>'; };
  $('au-f').addEventListener('change',draw);
  $('au-list').addEventListener('click',async e=>{ const b=e.target.closest('button'); if(!b) return; const id=b.closest('[data-id]').dataset.id, ref=f.fs.doc(f.db,RETOURS_CFG.collection,id);
    try{ if(b.dataset.st) await f.fs.updateDoc(ref,{statut:b.dataset.st}); else if(b.dataset.del && confirm('Supprimer ce message ?')) await f.fs.deleteDoc(ref); }catch(err){ alert('Action impossible : '+((err&&err.code)||'erreur')); } });
  const q=f.fs.query(f.fs.collection(f.db,RETOURS_CFG.collection), f.fs.orderBy('createdAt','desc'), f.fs.limit(200));
  _rtUnsub=f.fs.onSnapshot(q, snap=>{ rows=snap.docs.map(d=>{ const x=d.data(); const t=x.createdAt&&x.createdAt.toDate?x.createdAt.toDate():null; return { id:d.id, type:x.type, message:x.message||'', contact:x.contact||'', contexte:x.contexte||'', fiche:x.fiche||'', statut:x.statut||'nouveau', date:t?t.toLocaleString('fr-FR'):'' }; }); draw(); }, err=>{ $('au-list').innerHTML = err&&err.code==='permission-denied' ? '<div class="alert">Ce compte Google n\'est pas autorisé à lire les messages.</div>' : '<div class="alert">Lecture impossible ('+esc((err&&err.code)||'erreur')+').</div>'; });
}

const RT_BLOCS = [['motif','Motif et convention',true],['ini','Initiales du salarié (ex. « D. M. »)',false],['dates','Dates et ancienneté',false],['age','Âge',false],['remu','Rémunération des 12 mois',false],['res','Résultat du calcul (légal, conventionnel, retenu)',true],['detail','Détail du calcul (comprend l\'ancienneté et les salaires de référence)',true]];
function retoursSel(){ const o={}; RT_BLOCS.forEach(([k])=>{ const el=$('rb-'+k); o[k]=!!(el&&el.checked); }); return o; }
function retoursFiche(sel){
  let r; try{ r=compute(inpFromS()); }catch(e){ return ''; }
  const L=[], ini=t=>(t||'').trim().split(/[\s-]+/).filter(Boolean).map(w=>w[0].toUpperCase()+'.').join(' ');
  if(sel.motif){ L.push('Motif : '+(MOTIFS[motifKey()]||''), 'Convention : '+ccnLabel(S.ccn)); }
  if(sel.ini && ((S.nom||'').trim()||(S.prenom||'').trim())) L.push('Salarié (initiales) : '+[ini(S.prenom),ini(S.nom)].filter(Boolean).join(' '));
  if(sel.dates){ L.push('Entrée : '+fr(S.entree)+' · Sortie : '+fr(S.sortie)+' · '+(S.motif==='rc'?'Signature : ':'Notification : ')+fr(S.dateRef)); if(!r.erreur) L.push('Ancienneté retenue : '+fmtAnc(r.mois)); }
  if(sel.age && !r.erreur && r.age!=null) L.push('Âge retenu : '+r.age+' ans');
  if(sel.remu){ const sal=salaireDepuisMois(S.mois); L.push('Rémunération brute des 12 mois : '+S.mois.map(m=>m.brut===''?'-':m.brut).join(' ; '), 'Moyenne 12 mois : '+fmtEur(sal.sr12)+' · moyenne 3 mois : '+fmtEur(sal.sr3)); }
  if(r.erreur){ if(sel.res||sel.detail) L.push('Calcul : '+r.erreur); return L.join('\n'); }
  if(sel.res){ const f=r.fin; L.push('Légal : '+fmtEur(r.legal.montant), ...(r.conv?['Conventionnel : '+(r.conv.montant?fmtEur(r.conv.montant):'—')]:[]), 'Retenu : '+fmtEur(r.retenu.montant)+' ('+r.retenu.source+')', ...(f?['Indemnité retenue arrondie : '+fmtEur(f.retenuArrondi)]:[])); }
  if(sel.detail){ L.push('', ...r.lignes, r.legal.texte, ...(r.conv?r.conv.lignes:[])); }
  return L.join('\n').replace(/<[^>]+>/g,'');
}
function retoursPreview(){ const on=$('rm-join').checked; $('rm-blocs').hidden=!on; $('rm-prev').hidden=!on; if(on) $('rm-prev').value=retoursFiche(retoursSel()); }
function initRetours(){
  $('rm-blocs').innerHTML = RT_BLOCS.map(([k,l,d])=>`<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="rb-${k}" style="width:auto"${d?' checked':''}> ${l}</label>`).join('');
  $('rm-join').addEventListener('change',retoursPreview); $('rm-blocs').addEventListener('change',retoursPreview);
  $('rm-send').addEventListener('click',retoursEnvoi);
  document.querySelectorAll('#nav button[data-view="params"]').forEach(b=>b.addEventListener('click',retoursPreview));
  $('foot-auteur').addEventListener('click',e=>{ e.preventDefault(); show('auteur'); });
  if(retoursOn()){ $('foot-auteur').hidden=false; let on=false; try{ on=localStorage.getItem('ind-auteur')==='1'; }catch(e){} if(on) auteurWatch(); }
}
