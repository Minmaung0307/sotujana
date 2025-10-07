// app.js v2.1 (Login Modal)
import { auth, db, st, applyPrefs } from './firebase.js';
import { collection, addDoc, doc, getDoc, getDocs, setDoc, query, where, orderBy, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { ref as sref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js';

const $ = s => document.querySelector(s);

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Settings
const selTheme = $('#selTheme'), selFont = $('#selFont');
selTheme.value = localStorage.getItem('theme') || 'light';
selFont.value  = localStorage.getItem('font')  || 'base';
selTheme.addEventListener('change', e=>{ localStorage.setItem('theme', e.target.value); applyPrefs(); });
selFont.addEventListener('change',  e=>{ localStorage.setItem('font',  e.target.value);  applyPrefs(); });

// Tabs
window.tab = (el, id) => {
  document.querySelectorAll('#mainNav button').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if(id==='events')  loadEvents();
  if(id==='donate')  loadDonation();
  if(id==='records') refreshRecordGate();
};
window.show = id => document.querySelector(`button[data-tab="${id}"]`)?.click();

// Topbar sign out
$('#btnTopSignOut').addEventListener('click', ()=> logout());

// ----- LOGIN MODAL -----
const modal = $('#loginModal');
window.openLogin  = ()=> { modal.classList.add('show'); $('#mEmail')?.focus(); };
window.closeLogin = ()=> modal.classList.remove('show');

window.loginModal = async ()=>{
  try{
    const email = ($('#mEmail')?.value||'').trim();
    const pass  = ($('#mPass')?.value||'').trim();
    await signInWithEmailAndPassword(auth, email, pass);
    closeLogin();
    alert('Signed in');
    loadLatest();
    // Optional: jump to Admin tab after login
    show('admin');
  }catch(e){ alert('Login failed: ' + e.message); }
};

// Auth / admin gating
let isAdmin = false;
async function checkAdmin(u){
  if(!u) return false;
  const snap = await getDoc(doc(db,'admins', u.uid));
  return snap.exists();
}
async function updateAuthUI(u){
  const pill = $('#authState'); const btnAdminTab = $('#btnTabAdmin'); const adminSec = $('#admin');
  isAdmin = await checkAdmin(u);
  if(u){
    pill.textContent = isAdmin ? 'Admin' : 'User';
    $('#btnTopSignIn').style.display='none'; $('#btnTopSignOut').style.display='inline-flex';
    btnAdminTab.style.display = isAdmin ? 'inline-flex' : 'none';
    adminSec.style.display = isAdmin ? 'block' : 'none';
  }else{
    pill.textContent = 'Guest';
    $('#btnTopSignIn').style.display='inline-flex'; $('#btnTopSignOut').style.display='none';
    btnAdminTab.style.display='none'; adminSec.style.display='none';
  }
  refreshRecordGate();
}
onAuthStateChanged(auth, (u)=> { updateAuthUI(u); if(u) closeLogin(); });

// Logout
window.logout = async ()=>{
  try{ await signOut(auth); alert('Signed out'); location.reload(); }
  catch(e){ alert('Sign out failed: ' + e.message); }
};

// ===== Posts (raw HTML blocks) =====
const blocksHost = $('#blocks');
function blockTpl(type){
  if(type==='text') return `<div class="block" data-type="text"><textarea placeholder="Text or HTML..." data-role="text"></textarea></div>`;
  const accept = type==='image' ? 'image/*' : type==='video' ? 'video/*' : 'audio/*';
  return `<div class="block" data-type="${type}"><input type="file" accept="${accept}" data-role="file"/></div>`;
}
window.addBlock = (type)=>{ const wrap=document.createElement('div'); wrap.innerHTML=blockTpl(type); blocksHost.appendChild(wrap.firstElementChild); };
addBlock('text');

async function uploadAny(file, folder){
  if(!file) return '';
  const r = sref(st, `${folder}/${Date.now()}-${file.name}`);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}
window.createPost = async(ev)=>{
  ev.preventDefault();
  if(!auth.currentUser) return alert('Admin only');
  const title = $('#pTitle').value.trim();
  const allowHTML = $('#pAllowHTML').checked;
  const blocks = [];
  for(const el of blocksHost.children){
    const type = el.getAttribute('data-type');
    if(type==='text'){
      blocks.push({ type:'text', text: el.querySelector('[data-role="text"]').value, allowHTML });
    }else{
      const f = el.querySelector('[data-role="file"]').files[0]||null;
      const url = f ? await uploadAny(f, 'posts') : '';
      blocks.push({ type, url });
    }
  }
  const d=new Date();
  await addDoc(collection(db,'posts'), { title, blocks, month:d.getMonth()+1, year:d.getFullYear(), createdAt: serverTimestamp() });
  $('#postMsg').textContent='Published';
  blocksHost.innerHTML=''; addBlock('text'); $('#pTitle').value='';
  loadLatest();
};
function safeHTML(s){ return (s||'').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,''); }
function escapeHTML(s){ return (s||'').replace(/[&<>"]+/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])) }
function renderBlocks(arr){
  return arr.map(b=>{
    if(b.type==='text')  return `<div style="white-space:pre-wrap">${b.allowHTML? safeHTML(b.text): escapeHTML(b.text)}</div>`;
    if(b.type==='image') return `<img src="${b.url}" style="width:100%;border:1px solid #e5e7eb;border-radius:10px">`;
    if(b.type==='video') return `<video src="${b.url}" controls style="width:100%;border-radius:10px"></video>`;
    if(b.type==='audio') return `<audio src="${b.url}" controls style="width:100%"></audio>`;
    return '';
  }).join('');
}
async function loadLatest(){
  const host = $('#postGrid'); host.innerHTML='';
  try{
    const snap = await getDocs(query(collection(db,'posts'), orderBy('createdAt','desc'), limit(24)));
    let n=0; snap.forEach(d=>{ const p=d.data(); n++; const el=document.createElement('div'); el.className='card';
      el.innerHTML = `<h3>${escapeHTML(p.title||'Untitled')}</h3>${renderBlocks(p.blocks||[])}<div class="note mt">${p.month||'?'} / ${p.year||'?'}</div>`;
      host.appendChild(el);
    });
    $('#homeEmpty').style.display = n? 'none':'block';
  }catch(e){
    host.innerHTML = `<div class="empty">Posts မဖတ်နိုင်ပါ — ${e.message}</div>`;
  }
}
loadLatest();

// ===== Donations =====
async function loadDonation(){
  const cfg = await getDoc(doc(db,'meta','donation'));
  const x = cfg.exists()? cfg.data(): {};
  $('#qrKBZ').src = x.kbzQR||''; $('#qrCB').src = x.cbQR||''; $('#qrAYA').src = x.ayaQR||'';
  $('#kbzNote').textContent = x.kbzNote||''; $('#cbNote').textContent = x.cbNote||''; $('#ayaNote').textContent = x.ayaNote||'';
}
window.saveDonation = async ()=>{
  if(!auth.currentUser) return alert('Admin only');
  async function up(q){ const f=$(q).files[0]||null; if(!f) return ''; const r=sref(st,`donations/${Date.now()}-${f.name}`); await uploadBytes(r,f); return await getDownloadURL(r); }
  const kbzQR=await up('#kbzQR'), cbQR=await up('#cbQR'), ayaQR=await up('#ayaQR');
  const kbzNote=$('#kbzNoteIn').value.trim(), cbNote=$('#cbNoteIn').value.trim(), ayaNote=$('#ayaNoteIn').value.trim();
  const cur=await getDoc(doc(db,'meta','donation')); const prev=cur.exists()? cur.data(): {};
  await setDoc(doc(db,'meta','donation'), { kbzQR:kbzQR||prev.kbzQR||'', cbQR:cbQR||prev.cbQR||'', ayaQR:ayaQR||prev.ayaQR||'', kbzNote, cbNote, ayaNote });
  alert('Saved'); loadDonation();
}
loadDonation();

// ===== Events + Month Nav =====
let cur = new Date();
const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
window.prevMonth = ()=>{ cur = new Date(cur.getFullYear(), cur.getMonth()-1, 1); loadEvents(); };
window.nextMonth = ()=>{ cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1); loadEvents(); };

async function getDayNote(iso){ const s=await getDoc(doc(db,'eventNotes', iso)); return s.exists()? (s.data().note||'') : ''; }
async function saveDayNote(iso, text){ if(!auth.currentUser) return alert('Admin only'); await setDoc(doc(db,'eventNotes', iso), { note:text, ts:Date.now() }); }
function dayISO(y,m,d){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

async function renderCalendar(all){
  const c = $('#cal'); c.innerHTML='';
  const y = cur.getFullYear(); const m = cur.getMonth();
  $('#monthLabel').textContent = `${monthNames[m]} ${y}`;
  const first = new Date(y,m,1); const start = first.getDay();
  const days = new Date(y,m+1,0).getDate();
  for(let i=0;i<start;i++){ c.appendChild(document.createElement('div')); }
  let admin=false; if(auth.currentUser){ const s=await getDoc(doc(db,'admins', auth.currentUser.uid)); admin=s.exists(); }
  for(let d=1; d<=days; d++){
    const iso = dayISO(y,m,d);
    const cell = document.createElement('div'); cell.className='day';
    cell.innerHTML = `<div class="d">${d}</div>`;
    const todays = all.filter(x=>x.date===iso);
    todays.forEach(x=>{ const tag=document.createElement('div'); tag.className='tag'; tag.textContent=x.title; cell.appendChild(tag); });
    if(admin){
      const ta = document.createElement('textarea'); ta.placeholder='မှတ်ချက်...'; ta.value = await getDayNote(iso); ta.addEventListener('change', ()=> saveDayNote(iso, ta.value)); cell.appendChild(ta);
    }else{
      const p = document.createElement('div'); p.className='note-view'; p.textContent = await getDayNote(iso); cell.appendChild(p);
    }
    c.appendChild(cell);
  }
}
async function loadEvents(){
  const snap = await getDocs(collection(db,'events')); const arr=[]; snap.forEach(d=>arr.push({id:d.id, ...d.data()}));
  const today = new Date().toISOString().slice(0,10);
  const upcoming = arr.filter(x=>x.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const host = $('#eventUpcoming'); host.innerHTML=''; if(!upcoming.length) host.innerHTML='<div class="empty">No upcoming events</div>';
  upcoming.forEach(x=>{ const el=document.createElement('div'); el.className='card'; el.innerHTML=`<div class="row"><strong>${x.title}</strong><div class="space"></div><span class="pill">${x.date}</span></div>${x.desc? `<div class="note mt">${x.desc}</div>`:''}`; host.appendChild(el); });
  await renderCalendar(arr);
}
loadEvents();

// ===== Records =====
function refreshRecordGate(){
  const can = !!auth.currentUser && isAdmin;
  document.querySelector('#records .wrap').style.opacity = can? '1':'0.7';
  $('#recEmpty').textContent = can? 'Year ထည့်ပြီး Search' : 'Admin အတွက်သာ…';
  const nn = document.querySelector('.nonadmin-note'); if(nn) nn.style.display = can? 'none':'block';
}
window.saveRecord = async(ev)=>{
  ev.preventDefault(); if(!auth.currentUser) return alert('Admin only');
  const y=Number($('#rYear').value), name=$('#rName').value.trim();
  const age=Number($('#rAge').value||0), nrc=$('#rNRC').value.trim();
  const edu=$('#rEdu').value.trim(), mother=$('#rMother').value.trim(), father=$('#rFather').value.trim();
  const role=$('#rRole').value.trim(), phone=$('#rPhone').value.trim(), email=$('#rEmail').value.trim();
  const photo=$('#rPhoto').files[0]||null;
  let url=''; if(photo){ const r=sref(st, `records/${y}-${Date.now()}-${photo.name}`); await uploadBytes(r,photo); url=await getDownloadURL(r); }
  await addDoc(collection(db,'records'), { y,name,age,nrc,edu,mother,father,role,phone,email,photo:url, ts:Date.now() });
  // clear after save
  $('#recForm').reset();
  $('#recMsg').textContent='Saved'; setTimeout(()=>$('#recMsg').textContent='',1500);
};
window.searchRecords = async()=>{
  if(!auth.currentUser || !isAdmin) return alert('Admin only');
  const y = Number($('#recYear').value||0);
  const qtext = ($('#recQuery').value||'').toLowerCase().trim();
  if(!y) return alert('Enter year');
  const host = $('#recGrid'); host.innerHTML='';
  const snap = await getDocs(query(collection(db,'records'), where('y','==',y)));
  let n=0; snap.forEach(d=>{ const x=d.data();
    const hay = [x.name,x.phone,x.email].map(v=>(v||'').toLowerCase()).join(' ');
    if(qtext && !hay.includes(qtext)) return;
    n++; const c=document.createElement('div'); c.className='card';
    c.innerHTML = `<strong>${(x.name||'-')}</strong><div class="note">Age ${x.age||'-'} • ${x.role||'-'}</div><div class="note">Phone ${x.phone||'-'} • Email ${x.email||'-'}</div>`;
    host.appendChild(c);
  });
  $('#recEmpty').style.display = n? 'none':'block';
};

// ===== Subscribers =====
window.signup = async(ev)=>{
  ev.preventDefault();
  const email = $('#signupEmail').value.trim();
  if(!email) return;
  await setDoc(doc(db,'subscribers', email.replace(/\W/g,'_')), { email, ts: Date.now() });
  $('#signupEmail').value=''; alert('Subscribed');
};