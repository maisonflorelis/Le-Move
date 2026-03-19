
const SUPABASE_URL = 'https://xnmlpxteslwmimmdqjye.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cCIu5hEEt-zRYpz6qJV2ow_jmDbfJoM';
const ADMIN_EMAIL = atob('c2hlcnlsLm1lcmNpZXJAZ21haWwuY29t');
const RESEND_KEY = atob('cmVfQWtYNU5jUEVfQmhmaTRnWlh2R0gza2p3WHhhdEJkYUZHbg==');
const STRIPE_LINK = 'https://buy.stripe.com/9B63cv9HickT8pLeF56EU06';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allUsers = [], allCandidatures = [], allPartenaires = [];
let editingUser = null;

(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user.email === ADMIN_EMAIL) showAdmin();
  document.getElementById('loginBtn').addEventListener('click', adminLogin);
  document.getElementById('adminPwd').addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
  const ae = document.getElementById('adminEmail');
  if (ae) ae.value = ADMIN_EMAIL;
})();

async function adminLogin() {
  const { data, error } = await sb.auth.signInWithPassword({
    email: document.getElementById('adminEmail').value,
    password: document.getElementById('adminPwd').value
  });
  if (error || data.user.email !== ADMIN_EMAIL) {
    document.getElementById('authErr').style.display = 'block'; return;
  }
  showAdmin();
}

async function adminLogout() { await sb.auth.signOut(); location.reload(); }

function showAdmin() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appSidebar').style.display = 'flex';
  document.getElementById('appMain').style.display = 'block';
  document.getElementById('lastUpdate').textContent = 'Mis à jour : ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const se = document.getElementById('sidebarEmail');
  if (se) se.textContent = ADMIN_EMAIL;
  loadAll();
}

async function loadAll() {
  const [usersRes, profilesRes, candidaturesRes, partenairesRes] = await Promise.all([
    sb.from('Users').select('*').order('created_at', { ascending: false }),
    sb.from('Profiles').select('*').order('created_at', { ascending: false }),
    sb.from('candidatures_partenaires').select('*').order('created_at', { ascending: false }),
    sb.from('partenaires').select('*').order('created_at', { ascending: false }),
  ]);
  allUsers = (usersRes.data || []).map(u => {
    const profile = (profilesRes.data || []).find(p => p.id === u.id) || {};
    return { ...u, ...profile };
  });
  allCandidatures = candidaturesRes.data || [];
  allPartenaires = partenairesRes.data || [];
  renderDashboard(); renderUsers(); renderPlans(); renderCandidatures(); renderPartenaires(); renderRevenus();
  const pending = allCandidatures.filter(c => c.statut === 'en_attente').length;
  if (pending > 0) { document.getElementById('navBadge').textContent = pending; document.getElementById('navBadge').style.display = 'inline'; }
}

function renderDashboard() {
  const total = allUsers.length;
  const essentiel = allUsers.filter(u => u.Plan === 'essentiel').length;
  const complet = allUsers.filter(u => u.Plan === 'complet').length;
  const premium = allUsers.filter(u => u.Plan === 'premium').length;
  const partenairesActifs = allPartenaires.filter(p => p.statut === 'actif').length;
  const pending = allCandidatures.filter(c => c.statut === 'en_attente').length;
  const mrr = (essentiel*39)+(complet*69)+(premium*99)+(partenairesActifs*39);
  const conversion = total > 0 ? Math.round(((essentiel+complet+premium)/total)*100) : 0;
  document.getElementById('dTotalUsers').textContent = total;
  document.getElementById('dMRR').textContent = mrr.toLocaleString('fr-FR')+'€';
  document.getElementById('dPartenaires').textContent = partenairesActifs;
  document.getElementById('dConversion').textContent = conversion+'%';
  document.getElementById('dCandidatures').textContent = pending+' en attente';
  const week = new Date(); week.setDate(week.getDate()-7);
  document.getElementById('dNewUsers').textContent = '+'+allUsers.filter(u=>new Date(u.created_at)>week).length+' cette semaine';
  const plans = [{name:'Essentiel',count:essentiel,color:'var(--sand)',price:39},{name:'Complet',count:complet,color:'var(--gold)',price:69},{name:'Premium',count:premium,color:'var(--terracotta)',price:99}];
  document.getElementById('planBreakdown').innerHTML = plans.map(p => `<div style="display:flex;align-items:center;gap:12px"><div style="width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0"></div><div style="font-size:12px;font-weight:300;color:var(--espresso);flex:1">${p.name}</div><div style="font-size:12px;color:var(--text-light)">${p.count} utilisateur${p.count>1?'s':''}</div><div style="font-family:'Cormorant Garamond',serif;font-size:16px">${(p.count*p.price).toLocaleString('fr-FR')}€/mois</div></div><div style="height:4px;background:var(--linen);border-radius:2px;overflow:hidden"><div style="height:100%;background:${p.color};width:${total>0?Math.round((p.count/total)*100):0}%;border-radius:2px;transition:width 0.6s"></div></div>`).join('');
  document.getElementById('recentUsersBody').innerHTML = allUsers.slice(0,5).map(u=>`<tr><td>${u.prenom||u.Email?.split('@')[0]||'—'}</td><td><span class="plan-badge plan-${u.Plan||'essentiel'}">${u.Plan||'essentiel'}</span></td><td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td></tr>`).join('')||'<tr><td colspan="3" style="text-align:center;font-style:italic;color:var(--text-light)">Aucun utilisateur</td></tr>';
  const zoneCounts = {};
  allUsers.forEach(u => { const k=(u.ville||'Non renseignée').trim().split(' ')[0]; zoneCounts[k]=(zoneCounts[k]||0)+1; });
  const sortedZones = Object.entries(zoneCounts).sort((a,b)=>b[1]-a[1]).slice(0,9);
  const maxZone = sortedZones[0]?.[1]||1;
  document.getElementById('zoneStats').innerHTML = sortedZones.length ? sortedZones.map(([zone,count])=>`<div style="background:var(--cream);border-radius:10px;padding:14px"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><div style="font-size:12px;font-weight:300">${zone}</div><div style="font-family:'Cormorant Garamond',serif;font-size:20px">${count}</div></div><div style="height:3px;background:var(--linen);border-radius:2px;overflow:hidden"><div style="height:100%;background:var(--terracotta);width:${Math.round((count/maxZone)*100)}%;border-radius:2px"></div></div><div style="font-size:9px;color:var(--text-light);margin-top:4px">${total>0?Math.round((count/total)*100):0}% des utilisateurs</div></div>`).join(''):'<div style="color:var(--text-light);font-size:12px;font-style:italic;text-align:center;padding:20px;grid-column:1/-1">Aucune donnée de zone.</div>';
  const pendingList = allCandidatures.filter(c=>c.statut==='en_attente').slice(0,5);
  document.getElementById('dashCandidatures').innerHTML = pendingList.map(c=>`<tr><td><strong>${c.prenom} ${c.nom}</strong><br><span style="font-size:10px;color:var(--text-light)">${c.email}</span></td><td>${c.activite}</td><td>${c.zone}</td><td>${new Date(c.created_at).toLocaleDateString('fr-FR')}</td><td style="display:flex;gap:6px"><button class="action-btn btn-validate" onclick="validerCandidature('${c.id}','${c.email}','${c.prenom}','${c.nom}')">✓ Valider</button><button class="action-btn btn-refuse" onclick="refuserCandidature('${c.id}','${c.email}','${c.prenom}')">✕ Refuser</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Aucune candidature en attente</td></tr>';
}

function renderUsers() {
  document.getElementById('usersCount').textContent = allUsers.length+' utilisateurs';
  updateUsersTable(allUsers);
}
function updateUsersTable(users) {
  document.getElementById('usersTableBody').innerHTML = users.map(u=>`<tr><td>${u.prenom||'—'}</td><td style="font-size:11px">${u.Email||'—'}</td><td><span class="plan-badge plan-${u.Plan||'essentiel'}">${u.Plan||'essentiel'}</span></td><td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td><td>${u.date_emmenagement?new Date(u.date_emmenagement).toLocaleDateString('fr-FR'):'—'}</td><td style="display:flex;gap:5px;flex-wrap:wrap"><button class="action-btn btn-edit" onclick='openUserModal(${JSON.stringify(u)})'>Modifier</button><button class="action-btn btn-email" onclick="openEmailModal('${u.Email}')">Email</button><button class="action-btn btn-delete" onclick="deleteUser('${u.id}','${u.Email}')">Supprimer</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">Aucun utilisateur</td></tr>';
}
function filterUsers() {
  const q=document.getElementById('userSearch').value.toLowerCase();
  const plan=document.getElementById('userPlanFilter').value;
  let f=allUsers;
  if(q) f=f.filter(u=>(u.Email||'').toLowerCase().includes(q)||(u.prenom||'').toLowerCase().includes(q));
  if(plan) f=f.filter(u=>u.Plan===plan);
  updateUsersTable(f);
}
function renderPlans() { updatePlansTable(allUsers); }
function updatePlansTable(users) {
  document.getElementById('plansTableBody').innerHTML = users.map(u=>`<tr><td>${u.prenom||'—'}</td><td style="font-size:11px">${u.Email||'—'}</td><td><span class="plan-badge plan-${u.Plan||'essentiel'}">${u.Plan||'essentiel'}</span></td><td><select class="filter-select" style="font-size:11px;padding:5px 10px" onchange="quickChangePlan('${u.id}',this.value)"><option value="essentiel" ${(u.Plan||'essentiel')==='essentiel'?'selected':''}>Essentiel 39€</option><option value="complet" ${u.Plan==='complet'?'selected':''}>Complet 69€</option><option value="premium" ${u.Plan==='premium'?'selected':''}>Premium 99€</option></select></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Aucun utilisateur</td></tr>';
}
function filterPlans() { const q=document.getElementById('planSearch').value.toLowerCase(); updatePlansTable(allUsers.filter(u=>(u.Email||'').toLowerCase().includes(q)||(u.prenom||'').toLowerCase().includes(q))); }
async function quickChangePlan(userId,newPlan) {
  await sb.from('Users').update({Plan:newPlan}).eq('id',userId);
  const u=allUsers.find(u=>u.id===userId); if(u) u.Plan=newPlan;
  showToast('Plan mis à jour → '+newPlan); renderDashboard(); renderRevenus();
}
function openUserModal(user) {
  editingUser=user;
  document.getElementById('userModalTitle').textContent=user.prenom||user.Email?.split('@')[0]||'Utilisateur';
  document.getElementById('userModalPlan').value=user.Plan||'essentiel';
  document.getElementById('userModalInfo').innerHTML=`<div class="info-item"><div class="info-label">Email</div><div class="info-value">${user.Email||'—'}</div></div><div class="info-item"><div class="info-label">Prénom</div><div class="info-value">${user.prenom||'—'}</div></div><div class="info-item"><div class="info-label">Inscription</div><div class="info-value">${new Date(user.created_at).toLocaleDateString('fr-FR')}</div></div><div class="info-item"><div class="info-label">Déménagement</div><div class="info-value">${user.date_emmenagement?new Date(user.date_emmenagement).toLocaleDateString('fr-FR'):'—'}</div></div><div class="info-item"><div class="info-label">Type logement</div><div class="info-value">${user.type_logement||'—'}</div></div><div class="info-item"><div class="info-label">Ville</div><div class="info-value">${user.ville||'—'}</div></div>`;
  document.getElementById('userModal').classList.add('open');
}
async function saveUserPlan() {
  if(!editingUser) return;
  const newPlan=document.getElementById('userModalPlan').value;
  await sb.from('Users').update({Plan:newPlan}).eq('id',editingUser.id);
  const u=allUsers.find(u=>u.id===editingUser.id); if(u) u.Plan=newPlan;
  closeModal('userModal'); renderDashboard(); renderUsers(); renderPlans(); renderRevenus();
  showToast('Plan mis à jour !');
}
async function deleteUser(id,email) {
  if(!confirm('Supprimer '+email+' ? Irréversible.')) return;
  await sb.from('Users').delete().eq('id',id);
  allUsers=allUsers.filter(u=>u.id!==id);
  renderDashboard(); renderUsers(); renderPlans(); showToast('Utilisateur supprimé.');
}
function openEmailModal(email) {
  document.getElementById('emailTo').value=email;
  document.getElementById('emailSubject').value='';
  document.getElementById('emailBody').value='';
  document.getElementById('emailModal').classList.add('open');
}
async function sendEmail() {
  const to=document.getElementById('emailTo').value;
  const subject=document.getElementById('emailSubject').value.trim();
  const body=document.getElementById('emailBody').value.trim();
  if(!subject||!body){alert('Remplis le sujet et le message.');return;}
  await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RESEND_KEY},body:JSON.stringify({from:'Le Move <'+['bonjour','lemove.fr'].join('@')+'>',to,subject,html:'<div style="font-family:Arial,sans-serif;padding:32px">'+body.replace(/\n/g,'<br>')+'</div>'})});
  closeModal('emailModal'); showToast('Email envoyé !');
}
function renderCandidatures() {
  document.getElementById('candidaturesCount').textContent=allCandidatures.length+' candidatures';
  updateCandidaturesList(allCandidatures);
}
function filterCandidatures() {
  const q=document.getElementById('candidatureSearch').value.toLowerCase();
  const status=document.getElementById('candidatureStatusFilter').value;
  let f=allCandidatures;
  if(q) f=f.filter(c=>(c.nom||'').toLowerCase().includes(q)||(c.email||'').toLowerCase().includes(q)||(c.entreprise||'').toLowerCase().includes(q));
  if(status) f=f.filter(c=>c.statut===status);
  updateCandidaturesList(f);
}
function updateCandidaturesList(list) {
  document.getElementById('candidaturesList').innerHTML=list.map(c=>`<div style="background:var(--warm-white);border:1px solid var(--linen);border-radius:12px;padding:20px;margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:12px"><div><div style="font-size:14px;font-weight:400">${c.prenom} ${c.nom} — ${c.entreprise}</div><div style="font-size:11px;color:var(--text-light);margin-top:2px">${c.activite} · ${c.zone} · ${new Date(c.created_at).toLocaleDateString('fr-FR')}</div></div><span style="font-size:8px;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:20px;${c.statut==='en_attente'?'background:rgba(184,154,106,0.12);color:var(--gold)':c.statut==='valide'?'background:rgba(122,140,126,0.12);color:var(--sage)':'background:rgba(196,113,74,0.1);color:var(--terracotta)'}">${c.statut==='en_attente'?'En attente':c.statut==='valide'?'✓ Validé':'✕ Refusé'}</span></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px"><div><div style="font-size:8px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-light)">Email</div><div style="font-size:11px">${c.email}</div></div><div><div style="font-size:8px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-light)">SIRET</div><div style="font-size:11px">${c.siret||'—'}</div></div><div><div style="font-size:8px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-light)">Téléphone</div><div style="font-size:11px">${c.telephone||'—'}</div></div></div>${c.message?`<div style="background:var(--cream);border-radius:8px;padding:10px 14px;font-size:11px;color:var(--text-light);font-style:italic;margin-bottom:12px">"${c.message}"</div>`:''}<div style="display:flex;gap:8px;flex-wrap:wrap">${c.kbis_url?`<button class="action-btn btn-edit" onclick="viewDoc('${c.kbis_url}')">📄 Kbis</button>`:'<span style="font-size:10px;color:var(--terracotta)">⚠ Kbis manquant</span>'}${c.rc_pro_url?`<button class="action-btn btn-edit" onclick="viewDoc('${c.rc_pro_url}')">🛡️ RC Pro</button>`:''}${c.diplomes_url?`<button class="action-btn btn-edit" onclick="viewDoc('${c.diplomes_url}')">🎓 Diplômes</button>`:''}<div style="flex:1"></div><button class="action-btn btn-email" onclick="openEmailModal('${c.email}')">✉ Contacter</button>${c.statut==='en_attente'?`<button class="action-btn btn-validate" onclick="validerCandidature('${c.id}','${c.email}','${c.prenom}','${c.nom}')">✓ Valider</button><button class="action-btn btn-refuse" onclick="refuserCandidature('${c.id}','${c.email}','${c.prenom}')">✕ Refuser</button>`:''}</div></div>`).join('')||'<div class="empty">Aucune candidature</div>';
}
async function viewDoc(path) {
  const{data}=await sb.storage.from('partenaires-docs').createSignedUrl(path,300);
  if(data?.signedUrl) window.open(data.signedUrl,'_blank');
}
async function validerCandidature(id,email,prenom,nom) {
  if(!confirm('Valider '+prenom+' '+nom+' ?')) return;
  await sb.from('candidatures_partenaires').update({statut:'valide',stripe_link_sent:true}).eq('id',id);
  const fromEmail='Le Move <'+['bonjour','lemove.fr'].join('@')+'>';
  await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RESEND_KEY},body:JSON.stringify({from:fromEmail,to:email,subject:'✦ Votre candidature Partenaire Le Move est validée !',html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto"><div style="background:#2C1F14;padding:32px;text-align:center;border-radius:16px 16px 0 0"><div style="font-family:Georgia,serif;font-style:italic;font-size:24px;color:#F7F3EE">Le Move</div></div><div style="background:white;padding:40px;border-radius:0 0 16px 16px"><h2 style="font-family:Georgia,serif;font-style:italic;font-weight:300;color:#2C1F14">Félicitations ${prenom} ! ✦</h2><p style="color:#6B5C4E;line-height:1.8">Votre candidature a été <strong>validée</strong>.</p><div style="background:#F7F3EE;border-radius:12px;padding:20px;margin:20px 0;text-align:center"><div style="font-family:Georgia,serif;font-size:40px;color:#2C1F14">39€<span style="font-size:16px">/mois</span></div><div style="font-size:11px;color:#9C8B7E">Tarif Fondateurs · Sans engagement</div></div><div style="text-align:center"><a href="${STRIPE_LINK}" style="background:#C4714A;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:12px;text-transform:uppercase;display:inline-block">Activer mon accès →</a></div></div></div>`})});
  const c=allCandidatures.find(c=>c.id===id); if(c) c.statut='valide';
  renderDashboard(); renderCandidatures(); showToast('✓ Validé — email envoyé !');
}
async function refuserCandidature(id,email,prenom) {
  const raison=prompt('Motif de refus (optionnel) :'); if(raison===null) return;
  await sb.from('candidatures_partenaires').update({statut:'refuse'}).eq('id',id);
  const fromEmail='Le Move <'+['bonjour','lemove.fr'].join('@')+'>';
  await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+RESEND_KEY},body:JSON.stringify({from:fromEmail,to:email,subject:'Votre candidature Partenaire Le Move',html:`<div style="font-family:Arial,sans-serif;padding:32px;max-width:560px"><p>Bonjour ${prenom},</p><p>Nous ne pouvons pas accepter votre candidature à ce stade.${raison?'<br><br>Motif : '+raison:''}</p><p style="color:#9C8B7E;font-size:12px">L'équipe Le Move</p></div>`})});
  const c=allCandidatures.find(c=>c.id===id); if(c) c.statut='refuse';
  renderDashboard(); renderCandidatures(); showToast('✕ Refusé.');
}
function renderPartenaires() {
  document.getElementById('partenairesCount').textContent=allPartenaires.length+' partenaires';
  document.getElementById('partenairesTableBody').innerHTML=allPartenaires.map(p=>`<tr><td><strong>${p.entreprise||'—'}</strong></td><td>${p.activite||'—'}</td><td>${p.zone||'—'}</td><td>${p.vues||0}</td><td>${p.contacts||0}</td><td><span style="font-size:10px;font-weight:300" class="${p.statut==='actif'?'status-actif':'status-suspendu'}">● ${p.statut||'actif'}</span></td><td style="display:flex;gap:5px"><button class="action-btn btn-edit" onclick='openPartenaireModal(${JSON.stringify(p)})'>Modifier</button><button class="action-btn btn-email" onclick="openEmailModal('${p.email}')">Email</button><button class="action-btn btn-suspend" onclick="togglePartenaire('${p.id}','${p.statut}')">${p.statut==='actif'?'Suspendre':'Réactiver'}</button></td></tr>`).join('')||'<tr><td colspan="7" class="empty">Aucun partenaire</td></tr>';
}
function openPartenaireModal(p) {
  document.getElementById('partenaireModalId').value=p.id;
  document.getElementById('pmEntreprise').value=p.entreprise||'';
  document.getElementById('pmActivite').value=p.activite||'';
  document.getElementById('pmZone').value=p.zone||'';
  document.getElementById('pmStatut').value=p.statut||'actif';
  document.getElementById('partenaireModal').classList.add('open');
}
async function savePartenaire() {
  const id=document.getElementById('partenaireModalId').value;
  const updates={entreprise:document.getElementById('pmEntreprise').value,activite:document.getElementById('pmActivite').value,zone:document.getElementById('pmZone').value,statut:document.getElementById('pmStatut').value};
  await sb.from('partenaires').update(updates).eq('id',id);
  const p=allPartenaires.find(p=>p.id===id); if(p) Object.assign(p,updates);
  closeModal('partenaireModal'); renderPartenaires(); renderDashboard(); showToast('Partenaire mis à jour !');
}
async function togglePartenaire(id,currentStatus) {
  const newStatus=currentStatus==='actif'?'suspendu':'actif';
  if(!confirm(newStatus==='suspendu'?'Suspendre ?':'Réactiver ?')) return;
  await sb.from('partenaires').update({statut:newStatus}).eq('id',id);
  const p=allPartenaires.find(p=>p.id===id); if(p) p.statut=newStatus;
  renderPartenaires(); renderDashboard(); showToast(newStatus==='actif'?'Réactivé !':'Suspendu.');
}
function renderRevenus() {
  const e=allUsers.filter(u=>u.Plan==='essentiel').length;
  const c=allUsers.filter(u=>u.Plan==='complet').length;
  const p=allUsers.filter(u=>u.Plan==='premium').length;
  const pa=allPartenaires.filter(p=>p.statut==='actif').length;
  const mu=(e*39)+(c*69)+(p*99), mp=pa*39, mt=mu+mp;
  document.getElementById('mrrTotal').textContent=mt.toLocaleString('fr-FR')+'€';
  document.getElementById('mrrUsers').textContent=mu.toLocaleString('fr-FR')+'€';
  document.getElementById('mrrPartenaires').textContent=mp.toLocaleString('fr-FR')+'€';
  document.getElementById('revenusBreakdown').innerHTML=[{name:'Essentiel',count:e,price:39,color:'var(--sand)'},{name:'Complet',count:c,price:69,color:'var(--gold)'},{name:'Premium',count:p,price:99,color:'var(--terracotta)'},{name:'Partenaires',count:pa,price:39,color:'var(--sage)'}].map(r=>`<div style="display:flex;align-items:center;gap:16px"><div style="width:10px;height:10px;border-radius:50%;background:${r.color};flex-shrink:0"></div><div style="flex:1;font-size:13px;font-weight:300">${r.name}</div><div style="font-size:12px;color:var(--text-light)">${r.count} × ${r.price}€</div><div style="font-family:'Cormorant Garamond',serif;font-size:20px;width:100px;text-align:right">${(r.count*r.price).toLocaleString('fr-FR')}€/mois</div></div><div style="height:3px;background:var(--linen);border-radius:2px;overflow:hidden"><div style="height:100%;background:${r.color};width:${mt>0?Math.round((r.count*r.price/mt)*100):0}%"></div></div>`).join('');
}
function showSection(name,btn) {
  ['Dashboard','Users','Plans','Candidatures','Partenaires','Revenus'].forEach(s=>{document.getElementById('section'+s).style.display=s.toLowerCase()===name?'block':'none';});
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  if(btn) btn.classList.add('active');
}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.style.display='block';setTimeout(()=>t.style.display='none',3000);}
document.querySelectorAll('.modal-overlay').forEach(m=>{m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');});});
