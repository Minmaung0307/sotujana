// app.js — main logic (mobile-first, fully responsive)
import { auth, db, st, EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, applyPrefs } from './firebase.js';
import {
  collection, addDoc, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { ref as sref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js';

const $ = sel => document.querySelector(sel);
$('#year') && ($('#year').textContent = new Date().getFullYear());

// ===== Mobile nav toggle =====
$('#btnMenu').addEventListener('click', ()=>{
  const nav = $('#mainNav');
  const cur = getComputedStyle(nav).display;
  nav.style.display = (cur === 'none') ? 'flex' : 'none';
});

// ===== Tab switching =====
window.tab = (el, id) => {
  document.querySelectorAll('#mainNav button').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  const sec = document.getElementById(id);
  if (sec) { sec.classList.add('active'); sec.focus?.({ preventScroll:true }); }
  if(id==='history') loadHistory();
  if(id==='events')  loadEvents();
  if(id==='donate')  loadDonation();
  if(id==='records') refreshRecordGate();
};
window.show = id => document.querySelector(`button[data-tab="${id}"]`)?.click();

// ===== Theme & Font settings =====
document.querySelectorAll('.seg-btn[data-theme]').forEach(b=>b.addEventListener('click', ()=>{
  localStorage.setItem('theme', b.getAttribute('data-theme')); applyPrefs();
}));
document.querySelectorAll('.seg-btn[data-font]').forEach(b=>b.addEventListener('click', ()=>{
  localStorage.setItem('font', b.getAttribute('data-font')); applyPrefs();
}));

// Mobile nav
const menuBtn = $('#btnMenu');
if(menuBtn){
  menuBtn.addEventListener('click', ()=>{
    const nav = $('#mainNav');
    const cur = getComputedStyle(nav).display;
    nav.style.display = (cur === 'none') ? 'flex' : 'none';
  });
}

// Auth state
onAuthStateChanged(auth, u=>{
  const pill = $('#authState');
  if(pill){
    if(u){ pill.textContent='Admin'; pill.classList.add('ok'); }
    else { pill.textContent='Guest'; pill.classList.remove('ok'); }
  }
  refreshRecordGate();
});

window.login = async ()=>{
  const email = $('#admEmail')?.value.trim();
  const pass  = $('#admPass')?.value.trim();
  try{ await signInWithEmailAndPassword(auth,email,pass); alert('Signed in'); }
  catch(e){ alert('Login failed: ' + e.message) }
};
window.logout = async ()=>{ await signOut(auth); alert('Signed out'); };

// ===== Posts =====
async function mediaUpload(file){
  if(!file) return '';
  const id = Math.random().toString(36).slice(2);
  const r = sref(st, `posts/${id}-${file.name}`);
  await uploadBytes(r,file); return await getDownloadURL(r);
}
window.createPost = async(ev)=>{
  ev.preventDefault();
  if(!auth.currentUser) return alert('Admin only');
  const t = $('#pTitle').value.trim();
  const b = $('#pBody').value.trim();
  const mtype = [...document.querySelectorAll('input[name="mtype"]')].find(x=>x.checked).value;
  const f = $('#pFile').files[0]||null;
  $('#postMsg').textContent='Uploading…';
  try{
    const url = await mediaUpload(f);
    const d = new Date();
    const ref = await addDoc(collection(db,'posts'),{
      title:t, body:b, mtype, url:url||'', createdAt:serverTimestamp(), month:d.getMonth()+1, year:d.getFullYear()
    });
    $('#postMsg').textContent='Published!';
    await notifySubscribers({id:ref.id, title:t, body:b});
    loadLatest();
  }catch(e){ console.error(e); $('#postMsg').textContent=e.message; }
};
async function loadLatest(){
  const host = $('#postGrid'); host.innerHTML='';
  const snap = await getDocs(query(collection(db,'posts'), orderBy('createdAt','desc'), limit(24)));
  let n=0; snap.forEach(d=>{ n++; renderPostCard(d.id,d.data(), host); });
  $('#homeEmpty').style.display = n? 'none':'block';
}
function renderPostCard(id,p,host){
  const el = document.createElement('div'); el.className='card';
  const media = p.mtype==='video' && p.url ?
    `<video class="media" src="${p.url}" controls playsinline></video>` :
    `<img class="media" src="${p.url||'https://picsum.photos/800/450?blur=2'}" alt="post">`;
  el.innerHTML = `${media}
    <div class="body">
      <h3 id="post-${id}">${escapeHTML(p.title||'Untitled')}</h3>
      <div class="muted">${escapeHTML(p.body||'')}</div>
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
  await updateDoc(doc(db,'posts',id), { body:'[deleted]' });
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
window.saveDonation = async()=>{
  if(!auth.currentUser) return alert('Admin only');
  const put = async(id)=>{
    const f = document.getElementById(id).files[0];
    if(!f) return null;
    const r = sref(st, `donations/${id}-${Date.now()}-${f.name}`);
    await uploadBytes(r,f); return await getDownloadURL(r);
  };
  const kbzURL = await put('kbzQR'); const cbURL = await put('cbQR');
  const ref = doc(db,'meta','donation'); const curr = (await getDoc(ref)).data()||{};
  await setDoc(ref, {
    kbzQR: kbzURL || curr.kbzQR || '',
    cbQR:  cbURL  || curr.cbQR  || '',
    kbzNote: $('#kbzNoteIn').value.trim(),
    cbNote:  $('#cbNoteIn').value.trim()
  }, { merge:true });
  alert('Donation setup saved'); loadDonation();
};

// ===== Events =====
window.addEvent = async()=>{
  if(!auth.currentUser) return alert('Admin only');
  const t = $('#evTitle').value.trim(); const d = $('#evDate').value;
  if(!t||!d) return alert('Enter title & date');
  await addDoc(collection(db,'events'), { title:t, date:d });
  $('#evTitle').value=''; $('#evDate').value=''; loadEvents();
};
async function loadEvents(){
  const snap = await getDocs(collection(db,'events'));
  const arr=[]; snap.forEach(d=>arr.push({id:d.id, ...d.data()}));
  // upcoming
  const today = new Date().toISOString().slice(0,10);
  const upcoming = arr.filter(x=>x.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const host = $('#eventUpcoming'); host.innerHTML='';
  if(!upcoming.length) host.innerHTML='<div class="empty">No upcoming events</div>';
  upcoming.forEach(x=>{
    const li = document.createElement('div'); li.className='card';
    li.innerHTML = `<div class="row"><strong>${escapeHTML(x.title)}</strong><div class="space"></div><span class="pill">${x.date}</span></div>`;
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
        title: post.title, body: post.body, url: location.href + `#post-${post.id}`, to_email
      });
    }
  }catch(e){ console.warn('Email notify failed', e) }
}

// ===== Records (admin only) =====
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
  const role=$('#rRole').value.trim(); const photo=$('#rPhoto').files[0]||null;
  let url=''; if(photo){ const r=sref(st, `records/${y}-${Date.now()}-${photo.name}`); await uploadBytes(r,photo); url=await getDownloadURL(r); }
  await addDoc(collection(db,'records'), { y,name,age,nrc,edu,mother,father,role,photo:url, ts:Date.now() });
  $('#recMsg').textContent='Saved'; setTimeout(()=>$('#recMsg').textContent='',2000);
};
window.searchRecords = async()=>{
  if(!auth.currentUser) return alert('Admin only');
  const y = Number($('#recYear').value||0); if(!y) return alert('Enter year');
  const host = $('#recGrid'); host.innerHTML='';
  const snap = await getDocs(query(collection(db,'records'), where('y','==',y)));
  let n=0; snap.forEach(d=>{ n++; const x=d.data();
    const c=document.createElement('div'); c.className='card';
    c.innerHTML = `<div class="row" style="gap:12px">
       <img src="${x.photo||'https://picsum.photos/seed/mm/120/100'}" width="120" height="100" style="object-fit:cover; border-radius:12px; border:1px solid #e5e7eb">
       <div>
         <strong>${escapeHTML(x.name||'-')}</strong>
         <div class="muted">Age ${x.age||'-'} • ${escapeHTML(x.role||'-')}</div>
         <div class="note">NRC: ${escapeHTML(x.nrc||'-')} • Education: ${escapeHTML(x.edu||'-')}</div>
         <div class="note">Mother: ${escapeHTML(x.mother||'-')} • Father: ${escapeHTML(x.father||'-')}</div>
       </div>
     </div>`;
    host.appendChild(c);
  });
  $('#recEmpty').style.display = n? 'none':'block';
};

// ===== Helpers =====
function escapeHTML(s){ return (s||'').replace(/[&<>"]+/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])) }
function daysBetween(a,b){ return Math.round((b-a)/(1000*60*60*24)); }

// ===== Bootstrap =====
loadLatest(); loadDonation(); loadEvents();