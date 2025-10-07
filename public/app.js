// app.js v2.3 (fixed imports, syntax-safe)
// Source based on user's last upload; cleaned for syntax + missing imports.

import { auth, db, st, applyPrefs } from './firebase.js';
import {
  collection, addDoc, doc, getDoc, getDocs, setDoc,
  query, where, orderBy, limit, serverTimestamp, deleteDoc,
  updateDoc, increment
} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { ref as sref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js';

const $ = s => document.querySelector(s);
const yearEl = document.getElementById('year'); if (yearEl) yearEl.textContent = new Date().getFullYear();

// Theme / Font
const selTheme = $('#selTheme'), selFont = $('#selFont');
if (selTheme) selTheme.value = localStorage.getItem('theme') || 'light';
if (selFont)  selFont.value  = localStorage.getItem('font')  || 'base';
selTheme?.addEventListener('change', e=>{ localStorage.setItem('theme', e.target.value); applyPrefs(); });
selFont?.addEventListener('change',  e=>{ localStorage.setItem('font',  e.target.value);  applyPrefs(); });

// Tabs
window.tab = (el, id) => {
  document.querySelectorAll('#mainNav button').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  const sec = document.getElementById(id);
  if (sec) sec.classList.add('active');
  if(id==='events')  loadEvents();
  if(id==='donate')  loadDonation();
  if(id==='records') refreshRecordGate();
};
window.show = id => document.querySelector(`button[data-tab="${id}"]`)?.click();

document.getElementById('btnTopSignOut')?.addEventListener('click', ()=> logout());

// Modal login
const modal = document.getElementById('loginModal');
window.openLogin  = ()=> { modal?.classList.add('show'); document.getElementById('mEmail')?.focus(); };
window.closeLogin = ()=> modal?.classList.remove('show');
window.loginModal = async ()=>{
  try{
    const email = (document.getElementById('mEmail')?.value||'').trim();
    const pass  = (document.getElementById('mPass')?.value||'').trim();
    await signInWithEmailAndPassword(auth, email, pass);
    closeLogin(); alert('Signed in'); loadLatest(); show('admin');
  }catch(e){ alert('Login failed: ' + e.message); }
};

let isAdmin = false;
async function checkAdmin(u){
  if(!u) return false;
  const snap = await getDoc(doc(db,'admins', u.uid));
  return snap.exists();
}
async function updateAuthUI(u){
  const pill = document.getElementById('authState');
  const btnAdminTab = document.getElementById('btnTabAdmin');
  const adminSec = document.getElementById('admin');
  isAdmin = await checkAdmin(u);
  if(u){
    if (pill) pill.textContent = isAdmin ? 'Admin' : 'User';
    const inBtn = document.getElementById('btnTopSignIn');
    const outBtn = document.getElementById('btnTopSignOut');
    if (inBtn) inBtn.style.display='none';
    if (outBtn) outBtn.style.display='inline-flex';
    if (btnAdminTab) btnAdminTab.style.display = isAdmin ? 'inline-flex' : 'none';
    if (adminSec) adminSec.style.display = isAdmin ? 'block' : 'none';
  }else{
    if (pill) pill.textContent = 'Guest';
    const inBtn = document.getElementById('btnTopSignIn');
    const outBtn = document.getElementById('btnTopSignOut');
    if (inBtn) inBtn.style.display='inline-flex';
    if (outBtn) outBtn.style.display='none';
    if (btnAdminTab) btnAdminTab.style.display='none';
    if (adminSec) adminSec.style.display='none';
  }
  refreshRecordGate();
}
onAuthStateChanged(auth, function(u){
  updateAuthUI(u).then(function(){
    loadLatest(); // login/logout အတိုင်း posts UI ပြန်ဖော်ပြ
  });
});

window.logout = async ()=>{
  try{ await signOut(auth); alert('Signed out'); location.reload(); }
  catch(e){ alert('Sign out failed: ' + e.message); }
};

// Posts
const blocksHost = document.getElementById('blocks');
function blockTpl(type){
  if(type==='text') return `<div class="block" data-type="text"><textarea placeholder="Text or HTML..." data-role="text"></textarea></div>`;
  const accept = type==='image' ? 'image/*' : type==='video' ? 'video/*' : 'audio/*';
  return `<div class="block" data-type="${type}"><input type="file" accept="${accept}" data-role="file"/></div>`;
}
window.addBlock = (type)=>{
  const wrap=document.createElement('div'); wrap.innerHTML=blockTpl(type);
  blocksHost?.appendChild(wrap.firstElementChild);
};
// initial one text block
if (blocksHost && !blocksHost.children.length) { window.addBlock('text'); }

async function uploadAny(file, folder){
  if(!file) return '';
  const r = sref(st, `${folder}/${Date.now()}-${file.name}`);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}

window.createPost = async(ev)=>{
  ev.preventDefault();
  if(!auth.currentUser || !isAdmin) return alert('Admin only');
  const title = (document.getElementById('pTitle')?.value || '').trim();
  const allowHTML = document.getElementById('pAllowHTML')?.checked || false;
  const postId = (document.getElementById('pId')?.value || '').trim();
  const blocks = [];
  const container = document.getElementById('blocks');
  if (container) {
    for(const el of container.children){
      const type = el.getAttribute('data-type');
      if(type==='text'){
        const txt = el.querySelector('[data-role="text"]')?.value || '';
        blocks.push({ type:'text', text: txt, allowHTML });
      }else{
        const remove = el.querySelector('[data-role="remove"]')?.checked || false;
        if(remove) continue;
        const file = el.querySelector('[data-role="file"]')?.files?.[0] || null;
        let url = el.getAttribute('data-existing-url') || '';
        if(file){ url = await uploadAny(file, 'posts'); }
        if(url) blocks.push({ type, url });
      }
    }
  }
  const d=new Date();
  if (postId) {
    await updateDoc(doc(db,'posts', postId), { title, blocks, updatedAt: serverTimestamp() });
    alert('✅ Post updated successfully!');
  } else {
    await addDoc(collection(db,'posts'), { title, blocks, month:d.getMonth()+1, year:d.getFullYear(), likes: 0, createdAt: serverTimestamp() });
    alert('✅ Post published successfully!');
  }
  // reset form
  const host = document.getElementById('blocks'); if(host){ host.innerHTML=''; host.insertAdjacentHTML('beforeend', `<div class="block" data-type="text"><textarea placeholder="Text or HTML..." data-role="text"></textarea></div>`); }
  const titleEl = document.getElementById('pTitle'); if (titleEl) titleEl.value='';
  const idEl = document.getElementById('pId'); if(idEl) idEl.value='';
  const msg = document.getElementById('postMsg'); if (msg) msg.textContent='';
  loadLatest();
};

// ---------- Helpers ----------
function isLikedLocal(id){ return localStorage.getItem('liked_'+id)==='1'; }
function setLikedLocal(id, v){ if(v) localStorage.setItem('liked_'+id,'1'); else localStorage.removeItem('liked_'+id); }
function getLastCount(id){
  const n = Number(localStorage.getItem('likes_last_'+id));
  return Number.isFinite(n) ? n : null;
}
function setLastCount(id, n){ localStorage.setItem('likes_last_'+id, String(n)); }

function safeHTML(s){
  return String(s||'').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,'');
}
function escapeHTML(s){
  const map = { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" };
  return String(s||'').replace(/[&<>"']/g, m => map[m]);
}

// ---------- Render post blocks ----------
function renderBlocks(arr){
  return (arr||[]).map(function(b){
    if(b.type==='text'){
      if (b.allowHTML) {
        return '<div style="white-space:pre-wrap">' + safeHTML(b.text||'') + '</div>';
      }
      return '<div style="white-space:pre-wrap">' + escapeHTML(b.text||'') + '</div>';
    }
    if(b.type==='image'){
      return '<div class="post-media"><img src="'+ b.url +'" alt=""></div>';
    }
    if(b.type==='video'){
      return '<div class="post-media"><video src="'+ b.url +'" controls></video></div>';
    }
    if(b.type==='audio'){
      return '<div class="post-media"><audio src="'+ b.url +'" controls></audio></div>';
    }
    return '';
  }).join('');
}

// ---------- Like toggle ----------
window.toggleLike = async function(id){
  const btn = document.querySelector('[data-like="'+id+'"]');
  if(!btn) return;
  const countEl = btn.querySelector('.like-count');
  const wasLiked = isLikedLocal(id);
  const cur = parseInt((countEl && countEl.textContent) ? countEl.textContent : '0', 10);
  const next = wasLiked ? Math.max(0, cur-1) : cur+1;

  // optimistic UI
  btn.classList.toggle('liked', !wasLiked);
  if(countEl) countEl.textContent = String(next);
  setLikedLocal(id, !wasLiked);
  setLastCount(id, next);

  try{
    await updateDoc(doc(db,'posts', id), { likes: increment(wasLiked ? -1 : 1) });
  }catch(e){ /* ignore */ }
};

// ---------- Load latest posts (1 block per post + admin buttons) ----------
async function loadLatest(){
  const host = document.getElementById('postGrid');
  if(!host) return;
  host.innerHTML='';

  try{
    const q = query(collection(db,'posts'), orderBy('createdAt','desc'), limit(24));
    const snap = await getDocs(q);
    let n = 0;

    snap.forEach(function(d){
      const p = d.data(); n++;

      const likesServer = (typeof p.likes==='number') ? p.likes : 0;
      const liked = isLikedLocal(d.id);
      const shadow = getLastCount(d.id);
      const likesToShow = (liked && shadow!=null && shadow>likesServer) ? shadow : likesServer;

      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML =
        '<h3>'+ escapeHTML(p.title||'Untitled') +'</h3>' +
        renderBlocks(p.blocks||[]) +
        '<div class="row mt post-foot">' +
          '<span class="note">'+ (p.month||'?') +' / '+ (p.year||'?') +'</span>' +
          '<div class="space"></div>' +
          '<button class="like-btn '+ (liked?'liked':'') +'" data-like="'+ d.id +'" onclick="toggleLike(\''+ d.id +'\')">❤ ' +
            '<span class="like-count">'+ likesToShow +'</span>' +
          '</button>' +
          (window.isAdmin ? (
            '<div class="post-actions">' +
              '<button class="btn small edit" onclick="editPost(\''+ d.id +'\')">✏ Edit</button>' +
              '<button class="btn small danger" onclick="deletePost(\''+ d.id +'\')">🗑 Delete</button>' +
            '</div>'
          ) : '') +
        '</div>';

      host.appendChild(el);
    });

    const empty = document.getElementById('homeEmpty');
    if(empty){ empty.style.display = n ? 'none' : 'block'; }

  }catch(e){
    host.innerHTML = '<div class="empty">Posts မဖတ်နိုင်ပါ — '+ e.message +'</div>';
  }
}
loadLatest();

// Donations
async function loadDonation(){
  const cfg = await getDoc(doc(db,'meta','donation'));
  const x = cfg.exists()? cfg.data(): {};
  const elKBZ = document.getElementById('qrKBZ');
  const elCB  = document.getElementById('qrCB');
  const elAYA = document.getElementById('qrAYA');
  if (elKBZ) elKBZ.src = x.kbzQR||'';
  if (elCB)  elCB.src  = x.cbQR||'';
  if (elAYA) elAYA.src = x.ayaQR||'';
  const kbzNote = document.getElementById('kbzNote'); if (kbzNote) kbzNote.textContent = x.kbzNote||'';
  const cbNote  = document.getElementById('cbNote');  if (cbNote)  cbNote.textContent  = x.cbNote||'';
  const ayaNote = document.getElementById('ayaNote'); if (ayaNote) ayaNote.textContent = x.ayaNote||'';
}
window.saveDonation = async ()=>{
  if(!auth.currentUser) return alert('Admin only');
  async function up(id){
    const f=(document.getElementById(id)?.files||[])[0]||null;
    if(!f) return '';
    const r=sref(st,`donations/${Date.now()}-${f.name}`);
    await uploadBytes(r,f); return await getDownloadURL(r);
  }
  const kbzQR=await up('kbzQR'), cbQR=await up('cbQR'), ayaQR=await up('ayaQR');
  const kbzNote=(document.getElementById('kbzNoteIn')?.value||'').trim();
  const cbNote =(document.getElementById('cbNoteIn')?.value||'').trim();
  const ayaNote=(document.getElementById('ayaNoteIn')?.value||'').trim();
  const cur=await getDoc(doc(db,'meta','donation')); const prev=cur.exists()? cur.data(): {};
  await setDoc(doc(db,'meta','donation'), { kbzQR:kbzQR||prev.kbzQR||'', cbQR:cbQR||prev.cbQR||'', ayaQR:ayaQR||prev.ayaQR||'', kbzNote, cbNote, ayaNote });
  alert('Saved'); loadDonation();
}
loadDonation();

// Events + calendar notes
let cur = new Date();
const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
window.prevMonth = ()=>{ cur = new Date(cur.getFullYear(), cur.getMonth()-1, 1); loadEvents(); };
window.nextMonth = ()=>{ cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1); loadEvents(); };
async function getDayNote(iso){ const s=await getDoc(doc(db,'eventNotes', iso)); return s.exists()? (s.data().note||'') : ''; }
async function saveDayNote(iso, text){ if(!auth.currentUser) return alert('Admin only'); await setDoc(doc(db,'eventNotes', iso), { note:text, ts:Date.now() }); }
function dayISO(y,m,d){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
async function renderCalendar(arr){
  const c = document.getElementById('cal'); if(!c) return; c.innerHTML='';
  const y = cur.getFullYear(); const m = cur.getMonth();
  const monthLabel = document.getElementById('monthLabel'); if (monthLabel) monthLabel.textContent = `${monthNames[m]} ${y}`;
  const first = new Date(y,m,1); const start = first.getDay();
  const days = new Date(y,m+1,0).getDate();
  for(let i=0;i<start;i++){ c.appendChild(document.createElement('div')); }
  let admin=false; if(auth.currentUser){ const s=await getDoc(doc(db,'admins', auth.currentUser.uid)); admin=s.exists(); }
  for(let d=1; d<=days; d++){
    const iso = dayISO(y,m,d);
    const cell = document.createElement('div'); cell.className='day';
    cell.innerHTML = `<div class="d">${d}</div>`;
    const todays = arr.filter(x=>x.date===iso);
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
  const host = document.getElementById('eventUpcoming'); if(!host) return;
  host.innerHTML=''; if(!upcoming.length) host.innerHTML='<div class="empty">No upcoming events</div>';
  upcoming.forEach(x=>{
    const el=document.createElement('div'); el.className='card';
    el.innerHTML=`<div class="row"><strong>${x.title}</strong><div class="space"></div><span class="pill">${x.date}</span></div>${x.desc? `<div class="note mt">${x.desc}</div>`:''}`;
    host.appendChild(el);
  });
  await renderCalendar(arr);
}
loadEvents();

// Records CRUD + Export
let editingId = null;
function refreshRecordGate(){
  const can = !!auth.currentUser && isAdmin;
  const wrap = document.querySelector('#records .wrap'); if (wrap) wrap.style.opacity = can? '1':'0.7';
  const msg = document.getElementById('recEmpty'); if (msg) msg.textContent = can? 'Year ထည့်ပြီး Search' : 'Admin အတွက်သာ…';
  const nn = document.querySelector('.nonadmin-note'); if(nn) nn.style.display = can? 'none':'block';
}

window.saveRecord = async function (ev) {
  ev.preventDefault();
  if (!auth.currentUser || !isAdmin) {
    alert('Admin only');
    return;
  }

  const y = Number(document.getElementById('rYear').value);
  const name = document.getElementById('rName').value.trim();
  const age = Number(document.getElementById('rAge').value || 0);
  const nrc = document.getElementById('rNRC').value.trim();
  const vow = document.getElementById('rVow').value.trim();
  const edu = document.getElementById('rEdu').value.trim();
  const mother = document.getElementById('rMother').value.trim();
  const father = document.getElementById('rFather').value.trim();
  const addr = document.getElementById('rAddr').value.trim();
  const role = document.getElementById('rRole').value.trim();
  const phone = document.getElementById('rPhone').value.trim();
  const email = document.getElementById('rEmail').value.trim();

  const file = document.getElementById('rPhoto').files[0] || null;
  let url = '';

  try {
    if (file) {
      const r = sref(st, `records/${y}-${Date.now()}-${file.name}`);
      await uploadBytes(r, file);
      url = await getDownloadURL(r);
    }
  } catch (e) {
    console.warn('Photo upload failed', e);
  }

  const payload = {
    y, name, age, vow, nrc, mother, father, addr, edu, role, phone, email,
    photo: url,
    ts: Date.now()
  };

  try {
    if (editingId) {
      const prev = await getDoc(doc(db, 'records', editingId));
      const old = prev.exists() ? prev.data() : {};

      await setDoc(
        doc(db, 'records', editingId),
        {
          ...old,
          ...payload,
          photo: url || old.photo || ''
        }
      );
    } else {
      await addDoc(collection(db, 'records'), payload);
    }
  } catch (e) {
    console.error('saveRecord failed:', e);
    alert('Save failed: ' + e.message);
    return;
  }

  const form = document.getElementById('recForm');
  if (form) form.reset();
  editingId = null;

  const msgEl = document.getElementById('recMsg');
  if (msgEl) {
    msgEl.textContent = 'Saved';
    setTimeout(() => { msgEl.textContent = ''; }, 1500);
  }

  try { await window.searchRecords(); } catch (e) { console.warn('searchRecords error', e); }
};

window.searchRecords = async()=>{
  if(!auth.currentUser || !isAdmin) return alert('Admin only');
  const y = Number(document.getElementById('recYear').value||0);
  const qtext = (document.getElementById('recQuery').value||'').toLowerCase().trim();
  if(!y) return alert('Enter year');
  const host = document.getElementById('recGrid'); if(!host) return; host.innerHTML='';
  const snap = await getDocs(query(collection(db,'records'), where('y','==',y)));
  let n=0; snap.forEach(d=>{
    const x = { id: d.id, ...d.data() };
    const hay = [x.name,x.phone,x.email,(x.addr||''),(x.vow||'')].map(v=>(v||'').toLowerCase()).join(' ');
    if(qtext && !hay.includes(qtext)) return;
    n++;
    const img = x.photo
      ? `<div class="rec-photo-box"><img class="rec-photo" src="${x.photo}" alt="${x.name||''}"></div>`
      : `<div class="rec-photo-box empty">No Photo</div>`;
    const item = document.createElement('div'); item.className='card';
    item.innerHTML = `${img}
      <ol style="padding-left:18px;margin:0">
        <li>ဓာတ်ပုံ</li>
        <li><strong>နာမည်</strong> — ${x.name||'-'}</li>
        <li><strong>အသက်</strong> — ${x.age||'-'}</li>
        <li><strong>ဝါတော်</strong> — ${x.vow||'-'}</li>
        <li><strong>မှတ်ပုံတင်</strong> — ${x.nrc||'-'}</li>
        <li><strong>မိဘအမည်</strong> — ${[x.mother,x.father].filter(Boolean).join(' / ')||'-'}</li>
        <li><strong>ယခင်နေရပ်လိပ်စာ</strong> — ${x.addr||'-'}</li>
        <li><strong>ပညာအရည်အချင်း</strong> — ${x.edu||'-'}</li>
        <li><strong>လက်ရှိရာထူး</strong> — ${x.role||'-'}</li>
        <li><strong>ဆက်သွယ်ရန်ဖုန်း</strong> — ${x.phone||'-'}</li>
        <li><strong>ဆက်သွယ်ရန် email</strong> — ${x.email||'-'}</li>
      </ol>
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="btn" onclick="editRecord('${x.id}')">Edit</button>
        <button class="btn" onclick="deleteRecord('${x.id}')">Delete</button>
      </div>`;
    host.appendChild(item);
  });
  const empty = document.getElementById('recEmpty'); if (empty) empty.style.display = n? 'none':'block';
};
window.editRecord = async(id)=>{
  if(!auth.currentUser || !isAdmin) return alert('Admin only');
  const snap = await getDoc(doc(db,'records', id));
  if(!snap.exists()) return alert('Record not found');
  const x = snap.data();
  editingId = id;
  document.getElementById('rYear').value = x.y||'';
  document.getElementById('rName').value = x.name||'';
  document.getElementById('rAge').value  = x.age||'';
  document.getElementById('rNRC').value  = x.nrc||'';
  document.getElementById('rEdu').value  = x.edu||'';
  document.getElementById('rMother').value = x.mother||'';
  document.getElementById('rFather').value = x.father||'';
  document.getElementById('rRole').value   = x.role||'';
  document.getElementById('rPhone').value  = x.phone||'';
  document.getElementById('rEmail').value  = x.email||'';
  document.getElementById('rVow').value    = x.vow||'';
  document.getElementById('rAddr').value   = x.addr||'';
  alert('Loaded into form. Update then press Save Record.');
  show('admin');
};
window.deleteRecord = async(id)=>{
  if(!auth.currentUser || !isAdmin) return alert('Admin only');
  if(!confirm('ဒီမှတ်တမ်းကို ဖျက်မလား?')) return;
  await deleteDoc(doc(db,'records', id));
  await window.searchRecords();
};

// Export helpers
async function fetchYearRecords(){ 
  const y = Number(document.getElementById('recYear').value||0);
  if(!y) throw new Error('Enter year');
  const snap = await getDocs(query(collection(db,'records'), where('y','==',y)));
  const rows = [];
  snap.forEach(d=>{
    const x = { id: d.id, ...d.data() };
    rows.push({
      photo: x.photo||'',
      name: x.name||'',
      age: x.age||'',
      vow: x.vow||'',
      nrc: x.nrc||'',
      parents: [x.mother,x.father].filter(Boolean).join(' / '),
      addr: x.addr||'',
      edu: x.edu||'',
      role: x.role||'',
      phone: x.phone||'',
      email: x.email||''
    });
  });
  return rows;
}
function toCSV(rows){
  const head = ['ဓာတ်ပုံ(URL)','နာမည်','အသက်','ဝါတော်','မှတ်ပုံတင်','မိဘအမည်','ယခင်နေရပ်လိပ်စာ','ပညာအရည်အချင်း','လက်ရှိရာထူး','ဖုန်း','Email'];
  const body = rows.map(r=>[r.photo,r.name,r.age,r.vow,r.nrc,r.parents,r.addr,r.edu,r.role,r.phone,r.email]
    .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  return [head.join(','), ...body].join('\r\n');
}
window.exportRecordsCSV = async ()=>{
  try{
    if(!auth.currentUser || !isAdmin) return alert('Admin only');
    const rows = await fetchYearRecords();
    const csv = toCSV(rows);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const y = document.getElementById('recYear').value || new Date().getFullYear();
    a.href = url; a.download = `records-${y}.csv`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  }catch(e){ alert('Export CSV failed: ' + e.message); }
};
window.exportRecordsPDF = async ()=>{
  try{
    if(!auth.currentUser || !isAdmin) return alert('Admin only');
    const rows = await fetchYearRecords();
    const y = document.getElementById('recYear').value || new Date().getFullYear();
    const win = window.open('', '_blank');
    const style = `<style>
        body{ font-family: "Inter","Noto Sans Myanmar", Arial, sans-serif; padding: 16px; }
        h2{ margin: 0 0 12px 0 }
        table{ border-collapse: collapse; width:100%; }
        th, td{ border:1px solid #999; padding:6px 8px; font-size:12px; vertical-align:top }
        th{ background:#f1f5f9; }
        img{ max-width:80px; max-height:80px; object-fit:cover; border-radius:8px }
      </style>`;
    const head = ['ဓာတ်ပုံ','နာမည်','အသက်','ဝါတော်','မှတ်ပုံတင်','မိဘအမည်','ယခင်နေရပ်လိပ်စာ','ပညာအရည်အချင်း','လက်ရှိရာထူး','ဖုန်း','Email'];
    const rowsHTML = rows.map(r=>`
      <tr>
        <td>${r.photo? `<img src="${r.photo}">` : ''}</td>
        <td>${r.name}</td>
        <td>${r.age}</td>
        <td>${r.vow}</td>
        <td>${r.nrc}</td>
        <td>${r.parents}</td>
        <td>${r.addr}</td>
        <td>${r.edu}</td>
        <td>${r.role}</td>
        <td>${r.phone}</td>
        <td>${r.email}</td>
      </tr>`).join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8">${style}</head><body>
      <h2>Records ${y}</h2>
      <table>
        <thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
      <script>window.onload = () => { window.print(); }</script>
    </body></html>`);
    win.document.close();
  }catch(e){ alert('Export PDF failed: ' + e.message); }
};

window.editPost = async function(id){
  if(!auth.currentUser || !isAdmin) return alert('Admin only');
  const snap = await getDoc(doc(db,'posts', id));
  if(!snap.exists()) return alert('Post not found');
  const p = snap.data();
  const titleEl = document.getElementById('pTitle'); if (titleEl) titleEl.value = p.title||'';
  const allow = !!(p.blocks||[]).find(b=>b.type==='text' && b.allowHTML===true);
  const allowEl = document.getElementById('pAllowHTML'); if(allowEl) allowEl.checked = allow;
  const host = document.getElementById('blocks');
  if (host) {
    host.innerHTML='';
    (p.blocks||[]).forEach(b=>{
      if(b.type==='text'){
        const wrap = document.createElement('div');
        wrap.innerHTML = `<div class="block" data-type="text">
            <textarea placeholder="Text or HTML..." data-role="text"></textarea>
          </div>`;
        const el = wrap.firstElementChild;
        el.querySelector('[data-role="text"]').value = b.text||'';
        host.appendChild(el);
      }else{
        const preview = b.type==='image' ? `<img src="${b.url}" class="prev">` :
                       b.type==='video' ? `<video src="${b.url}" class="prev" controls></video>` :
                       `<audio src="${b.url}" class="prev" controls></audio>`;
        const accept = b.type==='image' ? 'image/*' : b.type==='video' ? 'video/*' : 'audio/*';
        const wrap = document.createElement('div');
        wrap.innerHTML = `<div class="block" data-type="${b.type}" data-existing-url="${b.url}">
            <div class="post-media">${preview}</div>
            <div class="media-input">
              <label class="file small">
                <span>Replace ${b.type.toUpperCase()}</span>
                <input type="file" accept="${accept}" data-role="file"/>
              </label>
              <label class="switch">
                <input type="checkbox" data-role="remove">
                <span>Remove this ${b.type}</span>
              </label>
            </div>
          </div>`;
        host.appendChild(wrap.firstElementChild);
      }
    });
  }
  const idEl = document.getElementById('pId'); if(idEl) idEl.value = id;
  show('admin'); window.scrollTo({top:0, behavior:'smooth'});
};
