import { auth, db, st, EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, applyPrefs } from './firebase.js';
import {
  collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { ref as sref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js';

const $ = s => document.querySelector(s);

// footer year
$('#year') && ($('#year').textContent = new Date().getFullYear());
loadMapLinks();

// ===== Settings as selects =====
const selTheme = $('#selTheme'), selFont = $('#selFont');
if (selTheme && selFont) {
  selTheme.value = localStorage.getItem('theme') || 'light';
  selFont.value  = localStorage.getItem('font')  || 'base';
  selTheme.addEventListener('change', e=>{ localStorage.setItem('theme', e.target.value); applyPrefs(); });
  selFont.addEventListener('change',  e=>{ localStorage.setItem('font',  e.target.value);  applyPrefs(); });
}

// ===== Mobile nav toggle =====
$('#btnMenu')?.addEventListener('click', ()=>{
  const nav = $('#mainNav');
  const cur = getComputedStyle(nav).display;
  nav.style.display = (cur === 'none') ? 'flex' : 'none';
});

// ===== Tabs =====
window.tab = (el, id) => {
  document.querySelectorAll('#mainNav button').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  const sec = document.getElementById(id);
  sec.classList.add('active');
  sec.focus?.({ preventScroll:true });
  if(id==='history') loadHistory();
  if(id==='events')  loadEvents();
  if(id==='donate')  loadDonation();
  if(id==='records') refreshRecordGate();
  if(id==='map')     loadMapLinks();
  if(id==='account') updateAccountStatus();
};
window.show = id => document.querySelector(`button[data-tab="${id}"]`)?.click();

// ============ Auth & Role ============
let isAdmin = false;

async function checkAdmin(u){
  if(!u) return false;
  const ref = doc(db, 'admins', u.uid);
  const snap = await getDoc(ref);
  return snap.exists();
}

async function refreshAuthUI(u){
  isAdmin = await checkAdmin(u);
  const pill = $('#authState');
  if(u){
    pill.textContent = isAdmin ? 'Admin' : 'User';
    pill.classList.add('ok');
  }else{
    pill.textContent = 'Guest';
    pill.classList.remove('ok');
  }
  updateAccountStatus();
  refreshRecordGate();
}

// persist login across reloads
setPersistence(auth, browserLocalPersistence).catch(()=>{});

// ===== Auth =====
onAuthStateChanged(auth, u=>{
  const pill = $('#authState');
  if(u){ pill.textContent='Admin'; pill.classList.add('ok'); }
  else { pill.textContent='Guest'; pill.classList.remove('ok'); }
  refreshRecordGate();
  refreshAuthUI(u);
});

window.login = async ()=>{
  try {
    const email = $('#admEmail').value.trim();
    const pass  = $('#admPass').value.trim();
    await signInWithEmailAndPassword(auth,email,pass);
    alert('Signed in');
  } catch(e){ alert('Login failed: ' + e.message) }
};

window.logout = async ()=>{
  try{
    await signOut(auth);
    // Force UI to guest immediately; avoid SW/SPA cache illusions
    await refreshAuthUI(null);
    // Optional hard reload to fully reset state:
    location.reload();
  }catch(e){ alert('Sign out failed: ' + e.message); }
};

// ---- Account tab handlers (for other users)
window.accountLogin = async ()=>{
  try{
    const email = $('#acEmail').value.trim();
    const pass  = $('#acPass').value.trim();
    await signInWithEmailAndPassword(auth,email,pass);
    alert('Signed in');
    show('home');
  }catch(e){ alert('Login failed: ' + e.message) }
};
window.accountSignup = async ()=>{
  try{
    const email = $('#acNewEmail').value.trim();
    const pass  = $('#acNewPass').value.trim();
    await createUserWithEmailAndPassword(auth,email,pass);
    alert('Account created. You are signed in.');
    show('home');
  }catch(e){ alert('Signup failed: ' + e.message) }
};
window.accountLogout = async ()=>{ return window.logout(); };

function updateAccountStatus(){
  const el = $('#accountStatus');
  if(!el) return;
  const u = auth.currentUser;
  if(!u){ el.textContent = 'Signed out (Guest)'; return; }
  el.textContent = `${isAdmin ? 'Admin' : 'User'} • ${u.email||u.uid}`;
}

// ===== Map & Directions =====
function loadMapLinks(){
  const addr = encodeURIComponent('3407, Buddhist College, Dagon Myothit (South), Yangon, Myanmar');
  $('#btnDrive')?.setAttribute('href', `https://www.google.com/maps/dir/?api=1&destination=${addr}&travelmode=driving`);
  $('#btnMoto')?.setAttribute('href',  `https://www.google.com/maps/dir/?api=1&destination=${addr}&travelmode=two_wheeler`);
  $('#btnOpenMap')?.setAttribute('href',`https://www.google.com/maps/search/?api=1&query=${addr}`);
}

// ===== Posts (Multi-block) =====
const blocksHost = $('#blocks');
const blockTpl = (type, idx) => {
  if(type==='text'){
    return `<div class="block" data-type="text">
      <div class="row">
        <span class="type pill">Text</span>
        <button class="btn sm" type="button" onclick="rmBlock(${idx})">Remove</button>
      </div>
      <textarea placeholder="စာသားရေး..." data-role="text"></textarea>
    </div>`;
  }
  const label = type==='image' ? 'Image' : type==='video' ? 'Video' : 'Audio';
  const accept = type==='image' ? 'image/*' : type==='video' ? 'video/*' : 'audio/*';
  return `<div class="block" data-type="${type}">
    <div class="row">
      <span class="type pill">${label}</span>
      <button class="btn sm" type="button" onclick="rmBlock(${idx})">Remove</button>
    </div>
    <input type="file" accept="${accept}" data-role="file" />
    <div class="preview">ဖိုင်ရွေးပါ…</div>
  </div>`;
};
function reindexBlocks(){
  [...blocksHost.querySelectorAll('.block')].forEach((b,i)=>{
    b.querySelector('button.btn.sm').setAttribute('onclick', `rmBlock(${i})`);
  });
}
window.addBlock = (type)=>{
  const idx = blocksHost.children.length;
  const wrap = document.createElement('div');
  wrap.innerHTML = blockTpl(type, idx);
  const el = wrap.firstElementChild;
  const file = el.querySelector('[data-role="file"]');
  if(file){
    file.addEventListener('change', ()=> {
      el.querySelector('.preview').textContent = file.files[0]?.name || 'ဖိုင်ရွေးပါ…';
    });
  }
  blocksHost.appendChild(el);
};
window.rmBlock = (idx)=>{
  const el = blocksHost.children[idx];
  if(el) el.remove();
  reindexBlocks();
};

// single-click defaults
if(blocksHost && blocksHost.children.length===0){
  addBlock('text');
}

// upload util
async function uploadAny(file, folder){
  if(!file) return '';
  const id = Math.random().toString(36).slice(2);
  const r = sref(st, `${folder}/${id}-${file.name}`);
  await uploadBytes(r,file);
  return await getDownloadURL(r);
}

// Create post with blocks
window.createPost = async(ev)=>{
  ev.preventDefault();
  if(!auth.currentUser) return alert('Admin only');

  const title = $('#pTitle').value.trim();
  const allowHTML = $('#pAllowHTML').checked;

  // collect blocks
  const blocks = [];
  for(const el of blocksHost.children){
    const type = el.getAttribute('data-type');
    if(type==='text'){
      const text = el.querySelector('[data-role="text"]').value.trim();
      blocks.push({ type:'text', text, allowHTML });
    }else{
      const f = el.querySelector('[data-role="file"]').files[0]||null;
      const url = f ? await uploadAny(f, 'posts') : '';
      blocks.push({ type, url });
    }
  }
  if(!blocks.length) return alert('အနည်းဆုံး block တစ်ခုထည့်ပါ');

  $('#postMsg').textContent='Publishing…';
  try{
    const d = new Date();
    await addDoc(collection(db,'posts'),{
      title, blocks, createdAt:serverTimestamp(), month:d.getMonth()+1, year:d.getFullYear()
    });
    $('#postMsg').textContent='Published!';
    // simple notify
    await notifySubscribers({ id:'', title, body:'' });
    // reset
    blocksHost.innerHTML=''; addBlock('text'); $('#pTitle').value=''; $('#pAllowHTML').checked=false;
    loadLatest();
  }catch(e){ console.error(e); $('#postMsg').textContent=e.message; }
};

// render posts
async function loadLatest(){
  const host = $('#postGrid'); host.innerHTML='';
  const snap = await getDocs(query(collection(db,'posts'), orderBy('createdAt','desc'), limit(24)));
  let n=0; snap.forEach(d=>{ n++; renderPostCard(d.id, d.data(), host); });
  $('#homeEmpty').style.display = n? 'none':'block';
}
function safeHTML(s){
  // simple sanitizer: strip <script>…</script>
  return (s||'').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,'');
}
function renderBlocks(arr){
  return arr.map(b=>{
    if(b.type==='text'){
      return `<div class="muted" style="white-space:pre-wrap">${b.allowHTML ? safeHTML(b.text) : escapeHTML(b.text)}</div>`;
    }
    if(b.type==='image') return `<img class="media" src="${b.url}" alt="image">`;
    if(b.type==='video') return `<video class="media" src="${b.url}" controls playsinline></video>`;
    if(b.type==='audio') return `<audio controls src="${b.url}" style="width:100%"></audio>`;
    return '';
  }).join('');
}
function renderPostCard(id, p, host){
  const el = document.createElement('div'); el.className='card';
  el.innerHTML = `
    <div class="body">
      <h3 id="post-${id}">${escapeHTML(p.title||'Untitled')}</h3>
      ${Array.isArray(p.blocks) ? renderBlocks(p.blocks) :
        `<div class="muted">[old post format]</div>`}
      <div class="row gap mt">
        <span class="pill">${p.month||'?'} / ${p.year||'?'}</span>
        <div class="space"></div>
        ${auth.currentUser? `<button class="btn" onclick="delPost('${id}')">Delete</button>`:''}
      </div>
    </div>`;
  host.appendChild(el);
}
window.delPost = async(id)=>{
  if(!confirm('Delete this post?')) return;
  await updateDoc(doc(db,'posts',id), { deleted:true });
  loadLatest(); loadHistory();
};

// ===== History =====
window.loadHistory = async()=>{
  const m = $('#histMonth').value; const y = $('#histYear').value.trim();
  const host = $('#histGrid'); host.innerHTML='';
  const col = collection(db,'posts');
  const filters = [];
  if(y) filters.push(where('year','==', Number(y)));
  if(m) filters.push(where('month','==', Number(m)));
  const qx = filters.length ? query(col, ...filters, orderBy('createdAt','desc')) : query(col, orderBy('createdAt','desc'));
  const snap = await getDocs(qx); let n=0;
  snap.forEach(d=>{ n++; renderPostCard(d.id, d.data(), host); });
  $('#histEmpty').style.display = n? 'none':'block';
};

// ===== Donations =====
async function loadDonation(){
  const cfg = await getDoc(doc(db,'meta','donation'));
  const x = cfg.exists()? cfg.data(): {};
  if(x.kbzQR) $('#qrKBZ').src = x.kbzQR; else $('#qrKBZ').removeAttribute('src');
  if(x.cbQR)  $('#qrCB').src  = x.cbQR;  else $('#qrCB').removeAttribute('src');
  $('#kbzNote').textContent = x.kbzNote||'';
  $('#cbNote').textContent  = x.cbNote||'';
}

// ===== Events (with description) =====
window.addEvent = async()=>{
  if(!auth.currentUser) return alert('Admin only');
  const t = $('#evTitle').value.trim();
  const d = $('#evDate').value;
  const desc = $('#evDesc').value.trim();
  if(!t||!d) return alert('Enter title & date');
  await addDoc(collection(db,'events'), { title:t, date:d, desc });
  $('#evTitle').value=''; $('#evDate').value=''; $('#evDesc').value='';
  loadEvents();
};
async function loadEvents(){
  const snap = await getDocs(collection(db,'events'));
  const arr=[]; snap.forEach(d=>arr.push({id:d.id, ...d.data()}));
  const today = new Date().toISOString().slice(0,10);
  const upcoming = arr.filter(x=>x.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const host = $('#eventUpcoming'); host.innerHTML='';
  if(!upcoming.length) host.innerHTML='<div class="empty">No upcoming events</div>';
  upcoming.forEach(x=>{
    const li = document.createElement('div'); li.className='card';
    li.innerHTML = `<div class="row">
        <strong>${escapeHTML(x.title)}</strong>
        <div class="space"></div><span class="pill">${x.date}</span>
      </div>
      ${x.desc? `<div class="note" style="white-space:pre-wrap;margin-top:6px">${escapeHTML(x.desc)}</div>`:''}`;
    host.appendChild(li);
  });
  const soon = upcoming.filter(x=>daysBetween(new Date(), new Date(x.date))<=7);
  const wb = $('#upcomingWarn');
  if(soon.length){ wb.classList.add('show'); wb.textContent = `🔔 အနီးကပ် အခါကြီး ${soon[0].title} • ${soon[0].date}`; }
  else { wb.classList.remove('show'); wb.textContent=''; }
  renderCalendar(arr);
}
function renderCalendar(all){
  const c = $('#cal'); c.innerHTML='';
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  const first = new Date(y,m,1); const start = first.getDay();
  const days = new Date(y,m+1,0).getDate();
  for(let i=0;i<start;i++){ c.appendChild(document.createElement('div')); }
  for(let d=1; d<=days; d++){
    const cell = document.createElement('div'); cell.className='day';
    const iso = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cell.innerHTML = `<div class="d">${d}</div>`;
    const todays = all.filter(x=>x.date===iso);
    todays.forEach(x=>{ const t = document.createElement('div'); t.className='tag'; t.textContent=x.title; cell.appendChild(t); });
    c.appendChild(cell);
  }
}

// ===== Subscribers & EmailJS =====
window.signup = async(ev)=>{
  ev.preventDefault();
  const e1 = $('#signupEmail'); const e2 = $('#signupEmail2');
  const email = (e1?.value||'').trim() || (e2?.value||'').trim();
  if(!email) return;
  await setDoc(doc(db,'subscribers', email.replace(/\W/g,'_')), { email, ts: Date.now() });
  if(e1) e1.value=''; if(e2) e2.value='';
  alert('Subscribed!');
};
async function notifySubscribers(post){
  try{
    const snap = await getDocs(collection(db,'subscribers'));
    const list=[]; snap.forEach(d=>{ const x=d.data(); if(x.email) list.push(x.email) });
    if(!list.length) return;
    if(!window.emailjsInit){ emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); window.emailjsInit=true; }
    for(const to_email of list){
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        title: post.title, body: post.body||'', url: location.href + `#post-${post.id||''}`, to_email
      });
    }
  }catch(e){ console.warn('Email notify failed', e) }
}

// ===== Records (admin only) with phone/email & search =====
function refreshRecordGate(){
  const isAdm = !!auth.currentUser;
  document.querySelector('#records .wrap').style.opacity = isAdm? '1':'0.6';
  $('#recEmpty').textContent = isAdm? 'ရှာရန် နှစ်ထည့်ပြီး Search နှိပ်ပါ' : 'Admin အတွက်သာ ဖြစ်ပါသည်…';
}
window.saveRecord = async(ev)=>{
  ev.preventDefault(); if(!auth.currentUser) return alert('Admin only');
  const y=Number($('#rYear').value), name=$('#rName').value.trim();
  const age=Number($('#rAge').value||0), nrc=$('#rNRC').value.trim();
  const edu=$('#rEdu').value.trim(), mother=$('#rMother').value.trim(), father=$('#rFather').value.trim();
  const role=$('#rRole').value.trim(); const phone=$('#rPhone').value.trim(); const email=$('#rEmail').value.trim();
  const photo=$('#rPhoto').files[0]||null;
  let url=''; if(photo){ const r=sref(st, `records/${y}-${Date.now()}-${photo.name}`); await uploadBytes(r,photo); url=await getDownloadURL(r); }
  await addDoc(collection(db,'records'), { y,name,age,nrc,edu,mother,father,role,phone,email,photo:url, ts:Date.now() });
  $('#recMsg').textContent='Saved'; setTimeout(()=>$('#recMsg').textContent='',2000);
};
window.searchRecords = async()=>{
  if(!auth.currentUser) return alert('Admin only');
  const y = Number($('#recYear').value||0);
  const qtext = ($('#recQuery').value||'').toLowerCase().trim();
  if(!y) return alert('Enter year');
  const host = $('#recGrid'); host.innerHTML='';
  const snap = await getDocs(query(collection(db,'records'), where('y','==',y)));
  let n=0; snap.forEach(d=>{ const x=d.data();
    const hay = [x.name, x.phone, x.email].map(v=>(v||'').toLowerCase()).join(' ');
    if(qtext && !hay.includes(qtext)) return; // client-side filter
    n++;
    const c=document.createElement('div'); c.className='card';
    c.innerHTML = `<div class="row" style="gap:12px; align-items:flex-start">
       <img src="${x.photo||'https://picsum.photos/seed/mm/120/100'}" width="120" height="100" style="object-fit:cover; border-radius:12px; border:1px solid #e5e7eb">
       <div>
         <strong>${escapeHTML(x.name||'-')}</strong>
         <div class="muted">Age ${x.age||'-'} • ${escapeHTML(x.role||'-')}</div>
         <div class="note">Phone: ${escapeHTML(x.phone||'-')} • Email: ${escapeHTML(x.email||'-')}</div>
         <div class="note">NRC: ${escapeHTML(x.nrc||'-')} • Education: ${escapeHTML(x.edu||'-')}</div>
         <div class="note">Mother: ${escapeHTML(x.mother||'-')} • Father: ${escapeHTML(x.father||'-')}</div>
       </div>
     </div>`;
    host.appendChild(c);
  });
  $('#recEmpty').style.display = n? 'none':'block';
};

// ===== Helpers & Boot =====
function escapeHTML(s){ return (s||'').replace(/[&<>"]+/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])) }
function daysBetween(a,b){ return Math.round((b-a)/(1000*60*60*24)); }

loadLatest(); loadDonation(); loadEvents(); loadMapLinks();