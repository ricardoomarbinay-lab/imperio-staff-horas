const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let state={users:[],hours:{},dates:[],accessRole:null,me:null,ranks:{},rates:{}};
let modal={userId:null,date:null,status:"normal"};

function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function minutesToText(m){m=Number(m)||0;return `${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`}
function parseLocalMinutes(s){const m=String(s).trim().match(/^(\d+):(\d{1,2})$/);if(!m)return null;return Number(m[1])*60+Number(m[2])}
function money(n){return new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n)}
function category(rank){return state.ranks.HIGH.includes(rank)?"HIGH":state.ranks.MID.includes(rank)?"MID":"LOW"}
function dateLabel(iso){const d=new Date(iso+"T12:00:00Z");return new Intl.DateTimeFormat("es-AR",{weekday:"short",day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(d).replace(".","")}
function updateClock(){const now=new Date();const fmt=new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"});$("#todayLabel").textContent=fmt.format(now);$("#clock").textContent=new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(now)}
setInterval(updateClock,1000);updateClock();

async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{"content-type":"application/json",...(opts.headers||{})}});if(r.status===401){location.reload();throw Error("AUTH")}const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.message||j.error||"Error");return j}

async function init(){
 try{const me=await fetch("/api/me");if(!me.ok)throw 0;const j=await me.json();state.accessRole=j.accessRole;state.me=j.user;$("#login").classList.add("hidden");$("#app").classList.remove("hidden");$("#welcomeName").textContent=j.user.name;$("#meName").textContent=j.user.name;$("#pageRole").textContent=j.accessRole;$("#meRole").textContent=j.accessRole;
 if(j.accessRole==="OWNER")$("#ownerNav").classList.remove("hidden");
 const b=await api("/api/bootstrap");Object.assign(state,b);render();setInterval(async()=>{try{const x=await api("/api/bootstrap");Object.assign(state,x);render()}catch{}},15000);
 }catch{ $("#login").classList.remove("hidden");$("#app").classList.add("hidden");if(new URLSearchParams(location.search).get("denied"))$("#denied").classList.remove("hidden");}
}
function render(){
 renderWeek();renderTable();if(state.accessRole==="OWNER")renderUsers();renderRanks();
 const totals=totalsForWeek();$("#totalHours").textContent=minutesToText(totals.minutes);$("#totalPay").textContent=money(totals.pay);
}
function renderWeek(){
 $("#weekStrip").innerHTML=state.dates.map((d,i)=>`<div class="day"><b>${["Sáb","Dom","Lun","Mar","Mié","Jue","Vie"][i]}</b><small>${d.slice(8,10)}/${d.slice(5,7)}</small></div>`).join("");
}
function usersFiltered(){const q=($("#search")?.value||"").toLowerCase();return state.users.filter(u=>`${u.name} ${u.email} ${u.staffRank}`.toLowerCase().includes(q))}
function entry(u,d){return state.hours[u.id]?.[d]||{minutes:0,status:"normal"}}
function userTotal(u){return state.dates.reduce((a,d)=>a+(entry(u,d).minutes||0),0)}
function userPay(u){return userTotal(u)/60*rate(u)}
function rate(u){return state.rates[category(u.staffRank)]||0}
function totalsForWeek(){return state.users.reduce((a,u)=>{a.minutes+=userTotal(u);a.pay+=userPay(u);return a},{minutes:0,pay:0})}
function renderTable(){
 const groups=[["HIGH","HIGH STAFF"],["MID","MID STAFF"],["LOW","LOW STAFF"]], users=usersFiltered();
 let html="";
 for(const [cat,label] of groups){
  const arr=users.filter(u=>category(u.staffRank)===cat);
  html+=`<tr class="category-row ${cat.toLowerCase()}"><td colspan="11">♛ ${label}<span style="float:right">${money(state.rates[cat])} / hora</span></td></tr>`;
  for(const u of arr){
   html+=`<tr draggable="true" data-id="${u.id}"><td class="usercell"><b>${esc(u.name)}</b><small>${esc(u.email)}</small></td><td><button class="rank ${cat.toLowerCase()}" data-rank-user="${u.id}">${esc(u.staffRank)}</button></td>`;
   for(const d of state.dates){const e=entry(u,d);html+=`<td><button class="hour ${e.status}" data-hour="${u.id}|${d}">${minutesToText(e.minutes)}</button></td>`}
   html+=`<td><b>${minutesToText(userTotal(u))}</b></td><td><b>${money(userPay(u))}</b></td></tr>`;
  }
 }
 $("#staffTable").innerHTML=html||`<tr><td colspan="11">No hay staff.</td></tr>`;
 $$("#staffTable [data-hour]").forEach(b=>b.onclick=()=>openHour(b.dataset.hour));
 $$("#staffTable [data-rank-user]").forEach(b=>b.onclick=()=>changeRank(b.dataset.rankUser));
 $$("#staffTable tr[draggable]").forEach(row=>{row.ondragstart=e=>e.dataTransfer.setData("text/plain",row.dataset.id);row.ondragover=e=>e.preventDefault();row.ondrop=e=>{e.preventDefault();moveUser(e.dataTransfer.getData("text/plain"),row.dataset.id)}})
}
async function changeRank(id){
 if(state.accessRole==="VIEWER")return;
 const u=state.users.find(x=>x.id===id);const cat=category(u.staffRank);
 const options=state.ranks[cat].map(r=>`${r}`).join(" / ");
 const r=prompt(`Elegí un rango de ${cat}: ${options}`,u.staffRank);if(!r||!state.ranks[cat].includes(r)||r===u.staffRank)return;
 try{const x=await api(`/api/users/${id}`,{method:"PATCH",body:JSON.stringify({staffRank:r})});u.staffRank=x.user.staffRank;render()}catch(e){alert(e.message)}
}
async function moveUser(id,targetId){
 if(state.accessRole!=="OWNER")return;
 const u=state.users.find(x=>x.id===id), t=state.users.find(x=>x.id===targetId);if(!u||!t)return;
 const cat=category(t.staffRank);const r=state.ranks[cat][0];
 if(!confirm(`Mover ${u.name} a ${cat} (${r})?`))return;
 try{const x=await api(`/api/users/${id}`,{method:"PATCH",body:JSON.stringify({staffRank:r})});u.staffRank=x.user.staffRank;render()}catch(e){alert(e.message)}
}
function openHour(key){
 if(state.accessRole==="VIEWER")return;
 const [uid,date]=key.split("|"),u=state.users.find(x=>x.id===uid),e=entry(u,date);
 modal={userId:uid,date,status:e.status};$("#modalTitle").textContent=`${u.name} — ${dateLabel(date)}`;$("#timeInput").value=minutesToText(e.minutes);$("#hourModal").classList.remove("hidden");
}
$("#closeModal").onclick=()=>$("#hourModal").classList.add("hidden");
$$(".modal-status button").forEach(b=>b.onclick=()=>{modal.status=b.dataset.status;$$(".modal-status button").forEach(x=>x.style.outline="");b.style.outline="2px solid #fff"});
$("#saveHour").onclick=async()=>{const t=$("#timeInput").value,m=parseLocalMinutes(t);if(m===null||m<0||m>599999){alert("Formato inválido. Ejemplo: 1:30 o 1:67.");return}try{await api(`/api/hours/${modal.userId}/${modal.date}`,{method:"PATCH",body:JSON.stringify({time:t,status:modal.status})});$("#hourModal").classList.add("hidden");const x=await api("/api/bootstrap");Object.assign(state,x);render()}catch(e){alert(e.message)}};

$("#search").oninput=renderTable;
$$(".nav").forEach(b=>b.onclick=()=>showView(b.dataset.view));
function showView(v){
 $$(".view").forEach(x=>x.classList.add("hidden"));if(v==="owner")$("#ownerView").classList.remove("hidden");else if(v==="logs"){$("#logsView").classList.remove("hidden");loadLogs()}else $("#hoursView").classList.remove("hidden");
 $$(".nav").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
}
function renderRanks(){const s=$("#newRank");if(s)s.innerHTML=[...state.ranks.HIGH,...state.ranks.MID,...state.ranks.LOW].map(r=>`<option>${r}</option>`).join("")}
$("#addUser").onclick=async()=>{const email=$("#newEmail").value,name=$("#newName").value,accessRole=$("#newAccess").value,staffRank=$("#newRank").value;if(!email)return;try{await api("/api/users",{method:"POST",body:JSON.stringify({email,name,accessRole,staffRank})});$("#newEmail").value="";$("#newName").value="";const x=await api("/api/bootstrap");Object.assign(state,x);render();alert("Usuario agregado. Ya puede iniciar sesión con ese Gmail.")}catch(e){alert(e.message)}};
function renderUsers(){if(!$("#userAdminList"))return;$("#userAdminList").innerHTML=state.users.map(u=>`<div class="admin-user"><div class="meta"><b>${esc(u.name)}</b><small>${esc(u.email)} · Staff ${esc(u.staffRank)}</small></div><select data-access="${u.id}"><option ${u.accessRole==="EDITOR"?"selected":""}>EDITOR</option><option ${u.accessRole==="VIEWER"?"selected":""}>VIEWER</option></select><button class="mini-actions danger" data-del="${u.id}">Eliminar</button></div>`).join("");$$("[data-access]").forEach(s=>s.onchange=async()=>{try{await api(`/api/users/${s.dataset.access}`,{method:"PATCH",body:JSON.stringify({accessRole:s.value})});const x=await api("/api/bootstrap");Object.assign(state,x);render()}catch(e){alert(e.message)}});$$("[data-del]").forEach(b=>b.onclick=async()=>{if(!confirm("¿Eliminar este acceso?"))return;try{await api(`/api/users/${b.dataset.del}`,{method:"DELETE"});const x=await api("/api/bootstrap");Object.assign(state,x);render()}catch(e){alert(e.message)}})}
async function loadLogs(){try{const x=await api("/api/logs");$("#logs").innerHTML=x.logs.map(l=>`<div class="admin-user"><div><b>${esc(l.action)}</b><small>${esc(l.actorEmail)} · ${new Date(l.at).toLocaleString("es-AR")}</small></div></div>`).join("")}catch(e){$("#logs").textContent=e.message}}
$("#logout").onclick=async()=>{await fetch("/auth/logout",{method:"POST"});location.reload()};
init();
