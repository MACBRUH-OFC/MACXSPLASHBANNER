(function(){

function generateDynamicHash(region) {
    const timeToken = Math.floor(Date.now() / 60000); 
    const hourlyMix = new Date().getUTCHours();
    const dynamicSalt = `salt_${region}_mix_${hourlyMix}`;
    const rawString = `${region}_${dynamicSalt}_${timeToken}`;
    
    let hash = 5381;
    for (let i = 0; i < rawString.length; i++) {
        hash = (hash * 33) ^ rawString.charCodeAt(i);
    }
    const finalHash = Math.abs(hash).toString(36);
    
    return {
        _id: finalHash,
        _token: btoa(region + ":" + timeToken).replace(/=/g, '')
    };
}

const API = "/api/fetch-region";

const REGIONS=[
  {code:"ind",name:"India"},
  {code:"br",name:"Brazil"},
  {code:"na",name:"North America"},
  {code:"sac",name:"South America"},
  {code:"mea",name:"Middle East"},
  {code:"vn",name:"Vietnam"},
  {code:"bd",name:"Bangladesh"},
  {code:"pk",name:"Pakistan"},
  {code:"sg",name:"Singapore"},
  {code:"id",name:"Indonesia"},
  {code:"cis",name:"Russia"},
  {code:"th",name:"Thailand"},
  {code:"tw",name:"Taiwan"},
  {code:"eu",name:"Europe"}
];

const TZ={
  ind:"Asia/Kolkata",
  br:"America/Sao_Paulo",
  na:"America/New_York",
  sac:"America/Santiago",
  mea:"Asia/Riyadh",
  vn:"Asia/Ho_Chi_Minh",
  bd:"Asia/Dhaka",
  pk:"Asia/Karachi",
  sg:"Asia/Singapore",
  id:"Asia/Jakarta",
  cis:"Europe/Moscow",
  th:"Asia/Bangkok",
  tw:"Asia/Taipei",
  eu:"Europe/Berlin"
};

const cache=new Map();

function preloadAll(){
  REGIONS.forEach(region=>{
    const params = generateDynamicHash(region.code);
    fetch(`${API}?_id=${params._id}&_token=${params._token}`)
    .then(r=>r.json())
    .then(data=>{
      cache.set(region.code,{
        events:(data.events||[]).sort(sorter),
        announcements:(data.announcements||[]).sort(sorter)
      });
    })
    .catch(()=>{});
  });
}

function priority(ts){
  const now=new Date();
  const date=new Date(Number(ts)*1000);
  const diff=Math.ceil((date-now)/(1000*60*60*24));
  if(diff===1)return 1;
  if(diff>1)return 2;
  return 3;
}

function sorter(a,b){
  const pa=priority(a.start_time);
  const pb=priority(b.start_time);
  if(pa!==pb)return pa-pb;
  return(a.start_time||0)-(b.start_time||0);
}

function tag(ts){
  const now=new Date();
  const date=new Date(Number(ts)*1000);
  const diff=Math.ceil((date-now)/(1000*60*60*24));
  if(diff===1){ return {text:"TONIGHT",class:"tonight"}; }
  if(diff>1){ return {text:"UPCOMING",class:"upcoming"}; }
  return {text:"LIVE",class:"live"};
}

function escapeHTML(str){
  if(!str)return'';
  return str
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function format(ts,region){
  const date=new Date(Number(ts)*1000);
  const tz=TZ[region]||"UTC";
  const d=date.toLocaleString('en-GB',{timeZone:tz,day:'2-digit',month:'short'});
  const t=date.toLocaleString('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit'});
  return`${d} • ${t}`;
}

function imageType(url){
  if(!url)return'landscape';
  const lower=url.toLowerCase();
  if(lower.includes('336x580')||lower.includes('notice')||lower.includes('vertical')){ return'portrait'; }
  if(lower.includes('square')){ return'square'; }
  return'landscape';
}

function titleParser(title){
  if(!title){ return {main:'Untitled',sub:''}; }
  if(title.includes(' - ')){
    const parts=title.split(' - ');
    return {main:parts[0],sub:parts.slice(1).join(' • ')};
  }
  if(title.includes('*')){
    const parts=title.split('*');
    return {main:parts[0],sub:parts.slice(1).join(' ')};
  }
  return {main:title,sub:''};
}

function cleanDescription(text){
  if(!text)return'';
  let cleaned=text;
  cleaned=cleaned.replace(/\[b\]/g,'');
  cleaned=cleaned.replace(/\[\/b\]/g,'');
  cleaned=cleaned.replace(/\[url=.*?\]/g,'');
  cleaned=cleaned.replace(/\[\/url\]/g,'');
  cleaned=cleaned.replace(/\[[A-Z0-9]+\]/g,'');
  const paragraphs=cleaned.split(/\n\s*\n/).filter(v=>v.trim()!=='');
  return paragraphs.map(p=>`<p>${escapeHTML(p.trim())}</p>`).join('');
}

window.toggleDescription=function(btn){
  const target=document.getElementById(btn.dataset.target);
  target.classList.toggle('collapsed');
  btn.innerText=target.classList.contains('collapsed')?'SHOW MORE':'SHOW LESS';
};

window.copyImage=function(link,el){
  navigator.clipboard.writeText(window.location.origin + link);
  el.innerHTML=`<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;
  setTimeout(()=>{
    el.innerHTML=`<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  },1000);
};

function renderImage(url){
  if(!url||url.trim()===''){ return`<div class="error-box">IMAGE LOAD FAILED</div>`; }
  return`<img src="${escapeHTML(url)}" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=&quot;error-box&quot;>IMAGE LOAD FAILED</div>';">`;
}

function convertToProxyUrl(originalUrl, region, isRedirect = false) {
  if (!originalUrl) return '';
  try {
    const urlObj = new URL(originalUrl);
    const filename = urlObj.pathname.split('/').pop() || 'file';
    const typeMark = isRedirect ? 'r_' : 'i_';
    return `/assets/${region}/${typeMark}${filename}?file=${encodeURIComponent(originalUrl)}`;
  } catch (e) {
    return originalUrl;
  }
}

function card(item,region,isAnnouncement=false,index=0) {
  const proxiedImage = convertToProxyUrl(item.image, region, false);
  const proxiedRedirect = convertToProxyUrl(item.redirect_url || item.social_url, region, true);

  const type=imageType(item.image||'');
  const t=tag(item.start_time);
  const title=titleParser(item.title||'');
  const hasDesc=isAnnouncement&&item.description&&item.description.trim()!=='';
  const showExpand=hasDesc&&item.description.length>420;
  const descId=`desc_${region}_${index}_${Math.random().toString(36).substring(2,7)}`;

  return `
  <div class="card">
    <div class="media">
      <div class="image-box ${type}">${renderImage(proxiedImage)}</div>
    </div>
    <div class="content">
      <div class="action-row">
        ${proxiedRedirect?`<a href="${escapeHTML(proxiedRedirect)}" target="_blank" class="action-btn"><svg viewBox="0 0 24 24"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg></a>`:''}
        <button class="action-btn" onclick="copyImage('${escapeHTML(proxiedImage)}',this)">
          <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
      <div class="tags">
        <div class="tag ${t.class}">${t.text}</div>
        <div class="tag region-tag">${region.toUpperCase()}</div>
      </div>
      <div class="title">${escapeHTML(title.main)}</div>
      ${title.sub?`<div class="subtitle">${escapeHTML(title.sub)}</div>`:''}
      <div class="info-box">
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>
        <div class="time">${format(item.start_time,region)}</div>
      </div>
      ${hasDesc?`
      <div class="description-wrap">
        <div class="description ${showExpand?'collapsed':''}" id="${descId}">${cleanDescription(item.description||'')}</div>
        ${showExpand?`<div class="expand-btn" data-target="${descId}" onclick="toggleDescription(this)">SHOW MORE</div>`:''}
      </div>`:''}
    </div>
  </div>`;
}

async function loadRegion(region){
  document.getElementById("selectedRegion").innerText=region.toUpperCase();
  document.getElementById("app").innerHTML=`<div class="loading-wrap"><div class="loader"></div></div>`;
  let data;

  if(cache.has(region)){
    data=cache.get(region);
  }else{
    try {
      const params = generateDynamicHash(region);
      const res = await fetch(`${API}?_id=${params._id}&_token=${params._token}`);
      const json = await res.json();
      data={
        events:(json.events||[]).sort(sorter),
        announcements:(json.announcements||[]).sort(sorter)
      };
      cache.set(region,data);
    }catch{
      data={events:[],announcements:[]};
    }
  }

  document.getElementById("app").innerHTML=`
  <div class="section-head"><h2>Events</h2><div class="count">${data.events.length}</div></div>
  <div class="grid">${data.events.map((v,i)=>card(v,region,false,i)).join('')}</div>
  <div class="section-head"><h2>Announcements</h2><div class="count">${data.announcements.length}</div></div>
  <div class="grid">${data.announcements.map((v,i)=>card(v,region,true,i)).join('')}</div>`;
}

function init(){
  const container=document.getElementById("regions");
  REGIONS.forEach(region=>{
    const btn=document.createElement("button");
    btn.className='region-btn';
    btn.innerHTML=`<div class="region-code">${region.code.toUpperCase()}</div><div class="region-name">${region.name}</div>`;
    btn.onclick=()=>{
      document.querySelectorAll('.region-btn').forEach(v=>{v.classList.remove('active');});
      btn.classList.add('active');
      loadRegion(region.code);
    };
    container.appendChild(btn);
  });
  preloadAll();
}

init();

const topBtn=document.getElementById('scrollTop');
window.addEventListener('scroll',()=>{
  if(window.scrollY>450){ topBtn.classList.add('show'); }else{ topBtn.classList.remove('show'); }
});

topBtn.onclick=()=>{ window.scrollTo({top:0,behavior:'smooth'}); };

let lastScroll=0;
const header=document.getElementById('header');
window.addEventListener('scroll',()=>{
  const current=window.pageYOffset;
  if(current>120&&current>lastScroll){ header.classList.add('hide'); }else{ header.classList.remove('hide'); }
  lastScroll=current;
});

})();