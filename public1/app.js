// app.js
import { auth, db, st, EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, applyPrefs } from './firebase.js';
import { collection, addDoc, doc, getDoc, getDocs, setDoc, query, where, orderBy, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js';
import { ref as sref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-storage.js';

const $ = s => document.querySelector(s);

// year
document.getElementById('year').textContent = new Date().getFullYear();

// settings
const selTheme=$('#selTheme'), selFont=$('#selFont');
selTheme.value = localStorage.getItem('theme') || 'light';
selFont.value  = localStorage.getItem('font')  || 'base';
selTheme.addEventListener('change', e=>{ localStorage.setItem('theme', e.target.value); applyPrefs(); });
selFont.addEventListener('change',  e=>{ localStorage.setItem('font',  e.target.value);  applyPrefs(); });

// tabs
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

// topbar auth buttons
$('#btnTopSignIn').addEventListener('click', ()=> show('admin'));
$('#btnTopSignOut').addEventListener('click', ()=> logout());

// auth
let isAdmin=false;
async function checkAdmin(u){
  if(!u) return false;
  const snap = await getDoc(doc(db,'admins', u.uid));
  return snap.exists();
}
async function updateAuthUI(u){
  const pill=$('#authState'), tabAdm=$('#btnTabAdmin'), secAdm=$('#admin');
  isAdmin = await checkAdmin(u);
  if(u){
    pill.textContent = isAdmin ? 'Admin':'User';
    $('#btnTopSignIn').style.display='none'; $('#btnTopSignOut').style.display='inline-flex';
    tabAdm.style.display = isAdmin ? 'inline-flex' : 'none';
    secAdm.style.display = isAdmin ? 'block' : 'none';
  }else{
    pill.textContent = 'Guest';
    $('#btnTopSignIn').style.display='inline-flex'; $('#btnTopSignOut').style.display='none';
    tabAdm.style.display='none'; secAdm.style.display='none';
  }
  refreshRecordGate();
}
onAuthStateChanged(auth, u=> updateAuthUI(u));

// login/logout
window.login = async()=>{
  try{
    const email=$('#admEmail').value.trim(), pass=$('#admPass').value.trim();
    await signInWithEmailAndPassword(auth,email,pass); alert('Signed in'); loadLatest();
  }catch(e){ alert('Login failed: '+e.message); }
};
window.logout = async()=>{
  try{ await signOut(auth); alert('Signed out'); location.reload(); }
  catch(e){ alert('Sign out failed: '+e.message); }
};

// posts
const blocksHost = $('#blocks');
function blockTpl(type){ if(type==='text') return `<div class="block" data-type="text"><textarea placeholder="Text or HTML..." data-role="text"></textarea></div>`;
  const accept = type==='image' ? 'image/*' : type==='video' ? 'video/*' : 'audio/*';
  return `<div class="block" data-type="${type}"><input type="file" accept="${accept}" data-role="file"/></div>`;}
window.addBlock = (type)=>{ const wrap=document.createElement('div'); wrap.innerHTML=blockTpl(type); blocksHost.appendChild(wrap.firstElementChild); };
addBlock('text');
async function uploadAny(file, folder){ if(!file) return ''; const r=sref(st, `${folder}/${Date.now()}-${file.name}`); await uploadBytes(r,file); return await getDownloadURL(r); }
window.createPost = async(ev)=>{
  ev.preventDefault();
  if(!auth.currentUser) return alert('Admin only');
  const title=$('#pTitle').value.trim(); const allowHTML=$('#pAllowHTML').checked;
  const blocks=[];
  for(const el of blocksHost.children){
    const type=el.getAttribute('data-type');
    if(type==='text'){ blocks.push({type:'text', text:el.querySelector('[data-role="text"]').value, allowHTML}); }
    else{ const f=el.querySelector('[data-role="file"]').files[0]||null; const url=f? await uploadAny(f,'posts'):''; blocks.push({type, url}); }
  }
  const d=new Date();
  await addDoc(collection(db,'posts'), { title, blocks, month:d.getMonth()+1, year:d.getFullYear(), createdAt: serverTimestamp() });
  $('#postMsg').textContent='Published'; blocksHost.innerHTML=''; addBlock('text'); $('#pTitle').value=''; loadLatest();
};
function safeHTML(s){ return (s||'').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,''); }
function escapeHTML(s){ return (s||'').replace(/[&<>"]+/g, m=>({"&":"&amp;","<":"&lt;","\\\"":"&quot;","\\>":"&gt;"}[m])) }
function renderBlocks(arr){
  return arr.map(b=>{
    if(b.type==='text') return `<div style="white-space:pre-wrap">${b.allowHTML? safeHTML(b.text): (b.text||'').replace(/[&<>"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]))}</div>`;
    if(b.type==='image') return `<img src="${b.url}" style="width:100%;border:1px solid #e5e7eb;border-radius:10px">`;
    if(b.type==='video') return `<video src="${b.url}" controls style="width:100%;border-radius:10px"></video>`;
    if(b.type==='audio') return `<audio src="${b.url}" controls style="width:100%"></audio>`;
    return '';
  }).join('');
}
async function loadLatest(){
  const host=$('#postGrid'); host.innerHTML='';
  try{
    const snap=await getDocs(query(collection(db,'posts'), orderBy('createdAt','desc'), limit(24)));
    let n=0; snap.forEach(d=>{ const p=d.data(); n++; const el=document.createElement('div'); el.className='card';
      el.innerHTML = `<h3>${(p.title||'Untitled')}</h3>${renderBlocks(p.blocks||[])}<div class="note mt">${p.month||'?'} / ${p.year||'?'}</div>`;
      host.appendChild(el); });
    $('#homeEmpty').style.display = n? 'none':'block';
  }catch(e){ host.innerHTML = `<div class="empty">Posts မဖတ်နိုင်ပါ — ${e.message}</div>`; }
}
loadLatest();

// donation
async function loadDonation(){
  const cfg = await getDoc(doc(db,'meta','donation'));
  const x = cfg.exists()? cfg.data(): {};
  if(x.kbzQR) $('#qrKBZ').src = x.kbzQR; else $('#qrKBZ').removeAttribute('src');
  if(x.cbQR)  $('#qrCB').src  = x.cbQR;  else $('#qrCB').removeAttribute('src');
  $('#kbzNote').textContent = x.kbzNote||''; $('#cbNote').textContent = x.cbNote||'';
}
window.saveDonation = async()=>{
  if(!auth.currentUser) return alert('Admin only');
  const kbzFile=$('#kbzQR').files[0]||null, cbFile=$('#cbQR').files[0]||null;
  const kbzQR = kbzFile? await uploadAny(kbzFile,'donations'):''; const cbQR = cbFile? await uploadAny(cbFile,'donations'):'';
  const kbzNote=$('#kbzNoteIn').value.trim(), cbNote=$('#cbNoteIn').value.trim();
  const cur=await getDoc(doc(db,'meta','donation')); const prev=cur.exists()? cur.data(): {};
  await setDoc(doc(db,'meta','donation'), { kbzQR:kbzQR||prev.kbzQR||'', cbQR:cbQR||prev.cbQR||'', kbzNote, cbNote });
  alert('Saved'); loadDonation();
}
loadDonation();

// events + calendar notes
window.addEvent = async()=>{
  if(!auth.currentUser) return alert('Admin only');
  const t=$('#evTitle').value.trim(), d=$('#evDate').value, desc=$('#evDesc').value.trim();
  if(!t||!d) return alert('Enter title & date');
  await addDoc(collection(db,'events'), { title:t, date:d, desc });
  $('#evTitle').value=''; $('#evDate').value=''; $('#evDesc').value=''; loadEvents();
};
async function getDayNote(iso){ const s=await getDoc(doc(db,'eventNotes', iso)); return s.exists()? (s.data().note||'') : ''; }
async function saveDayNote(iso, text){ if(!auth.currentUser) return alert('Admin only'); await setDoc(doc(db,'eventNotes', iso), { note:text, ts:Date.now() }); }
function dayISO(y,m,d){ return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
async function renderCalendar(all){
  const c=$('#cal'); c.innerHTML=''; const now=new Date(); const y=now.getFullYear(), m=now.getMonth();
  const first=new Date(y,m,1); const start=first.getDay(); const days=new Date(y,m+1,0).getDate();
  for(let i=0;i<start;i++){ c.appendChild(document.createElement('div')); }
  let admin=false; if(auth.currentUser){ const s=await getDoc(doc(db,'admins',auth.currentUser.uid)); admin=s.exists(); }
  for(let d=1; d<=days; d++){
    const iso=dayISO(y,m,d); const cell=document.createElement('div'); cell.className='day'; cell.innerHTML=`<div class="d">${d}</div>`;
    const todays=all.filter(x=>x.date===iso); todays.forEach(x=>{ const t=document.createElement('div'); t.className='tag'; t.textContent=x.title; cell.appendChild(t); });
    if(admin){ const ta=document.createElement('textarea'); ta.placeholder='မှတ်ချက်...'; ta.value=await getDayNote(iso); ta.addEventListener('change',()=>saveDayNote(iso,ta.value)); cell.appendChild(ta); }
    else{ const p=document.createElement('div'); p.className='note-view'; p.textContent=await getDayNote(iso); cell.appendChild(p); }
    c.appendChild(cell);
  }
}
async function loadEvents(){
  const snap=await getDocs(collection(db,'events')); const arr=[]; snap.forEach(d=>arr.push({id:d.id, ...d.data()}));
  const today=new Date().toISOString().slice(0,10);
  const upcoming=arr.filter(x=>x.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
  const host=$('#eventUpcoming'); host.innerHTML=''; if(!upcoming.length) host.innerHTML='<div class="empty">No upcoming events</div>';
  upcoming.forEach(x=>{ const el=document.createElement('div'); el.className='card'; el.innerHTML=`<div class="row"><strong>${x.title}</strong><div class="space"></div><span class="pill">${x.date}</span></div>${x.desc? `<div class="note mt">${x.desc}</div>`:''}`; host.appendChild(el); });
  renderCalendar(arr);
}
loadEvents();

// records (admin)
function refreshRecordGate(){ const can=!!auth.currentUser && isAdmin; document.querySelector('#records .wrap').style.opacity=can? '1':'0.6'; $('#recEmpty').textContent=can? 'Year ထည့်ပြီး Search':'Admin အတွက်သာ…'; }
window.saveRecord = async(ev)=>{
  ev.preventDefault(); if(!auth.currentUser) return alert('Admin only');
  const y=Number($('#rYear').value), name=$('#rName').value.trim(), age=Number($('#rAge').value||0);
  const nrc=$('#rNRC').value.trim(), edu=$('#rEdu').value.trim(), mother=$('#rMother').value.trim(), father=$('#rFather').value.trim();
  const role=$('#rRole').value.trim(), phone=$('#rPhone').value.trim(), email=$('#rEmail').value.trim();
  const photo=$('#rPhoto').files[0]||null; let url=''; if(photo){ const r=sref(st,`records/${y}-${Date.now()}-${photo.name}`); await uploadBytes(r,photo); url=await getDownloadURL(r); }
  await addDoc(collection(db,'records'), { y,name,age,nrc,edu,mother,father,role,phone,email,photo:url, ts:Date.now() });
  $('#recMsg').textContent='Saved'; setTimeout(()=>$('#recMsg').textContent='',1500);
};
window.searchRecords = async()=>{
  if(!auth.currentUser || !isAdmin) return alert('Admin only');
  const y=Number($('#recYear').value||0), qtext=($('#recQuery').value||'').toLowerCase().trim(); if(!y) return alert('Enter year');
  const host=$('#recGrid'); host.innerHTML=''; const snap=await getDocs(query(collection(db,'records'), where('y','==',y)));
  let n=0; snap.forEach(d=>{ const x=d.data(); const hay=[x.name,x.phone,x.email].map(v=>(v||'').toLowerCase()).join(' ');
    if(qtext && !hay.includes(qtext)) return; n++; const c=document.createElement('div'); c.className='card'; c.innerHTML=`<strong>${x.name||'-'}</strong><div class="note">Age ${x.age||'-'} • ${x.role||'-'}</div><div class="note">Phone ${x.phone||'-'} • Email ${x.email||'-'}</div>`; host.appendChild(c); });
  $('#recEmpty').style.display = n? 'none':'block';
};

// subscribers (optional)
window.signup = async(ev)=>{
  ev.preventDefault(); const email=$('#signupEmail').value.trim(); if(!email) return;
  await setDoc(doc(db,'subscribers', email.replace(/\W/g,'_')), { email, ts: Date.now() });
  $('#signupEmail').value=''; alert('Subscribed');
};

// seed demo
window.seedDemo = async()=>{
  if(!auth.currentUser) return alert('Admin only');
  const d=new Date();
  await addDoc(collection(db,'posts'), { title:'နမူနာ — HTML + ဓာတ်ပုံ', blocks:[{type:'text', allowHTML:true, text:'<h3>သင်တန်း</h3><p>မနက် ၅:၀၀ …</p>'},{type:'image', url:'https://picsum.photos/seed/monk/800/450'}], month:d.getMonth()+1, year:d.getFullYear(), createdAt: serverTimestamp() });
  await addDoc(collection(db,'records'), { y:2025, name:'U Sīla', age:32, role:'Discipline Master', phone:'09-987654321', email:'usila@example.com', ts:Date.now() });
  await addDoc(collection(db,'events'), { title:'Sabbath Day', date:new Date().toISOString().slice(0,10), desc:'မနက် ဓမ္မ' });
  alert('Sample data loaded'); loadLatest(); loadEvents();
};
