import HTML from './index.html';
const SCHEMA=[
"CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,picture TEXT,role TEXT DEFAULT 'user',disabled INTEGER DEFAULT 0,created_at INTEGER)",
"CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER)",
"CREATE TABLE IF NOT EXISTS folders(id TEXT PRIMARY KEY,user_id TEXT,name TEXT)",
"CREATE TABLE IF NOT EXISTS docs(id TEXT PRIMARY KEY,user_id TEXT,folder_id TEXT,title TEXT,content TEXT DEFAULT '',trashed INTEGER DEFAULT 0,created_at INTEGER,updated_at INTEGER)",
"CREATE INDEX IF NOT EXISTS i_docs ON docs(user_id,updated_at)",
"CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT)",
"INSERT OR IGNORE INTO settings VALUES('signups','1'),('announcement','')",
"CREATE TABLE IF NOT EXISTS shares(doc_id TEXT,email TEXT,role TEXT,PRIMARY KEY(doc_id,email))",
"CREATE INDEX IF NOT EXISTS i_sh ON shares(email)",
"CREATE TABLE IF NOT EXISTS linkacc(doc_id TEXT PRIMARY KEY,level TEXT)",
"CREATE TABLE IF NOT EXISTS stars(user_id TEXT,doc_id TEXT,PRIMARY KEY(user_id,doc_id))",
"CREATE TABLE IF NOT EXISTS recents(user_id TEXT,doc_id TEXT,ts INTEGER,PRIMARY KEY(user_id,doc_id))",
"CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY,doc_id TEXT,user_id TEXT,user_name TEXT,title TEXT,content TEXT,name TEXT,created_at INTEGER,updated_at INTEGER)",
"CREATE INDEX IF NOT EXISTS i_ver ON versions(doc_id,updated_at)",
"CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY,doc_id TEXT,parent_id TEXT,user_id TEXT,user_name TEXT,user_pic TEXT,body TEXT,quote TEXT,resolved INTEGER DEFAULT 0,created_at INTEGER,upd INTEGER)",
"CREATE INDEX IF NOT EXISTS i_com ON comments(doc_id)",
"CREATE TABLE IF NOT EXISTS presence(doc_id TEXT,user_id TEXT,name TEXT,pic TEXT,ts INTEGER,PRIMARY KEY(doc_id,user_id))"];
const SLOGAN='Write together. In concord.';
const RK={viewer:1,commenter:2,editor:3,owner:4};
const J=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json',...h}});
const id=()=>crypto.randomUUID();
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ck=(r,n)=>(r.headers.get('cookie')||'').split(/; */).map(c=>c.split('=')).find(c=>c[0]===n)?.[1];
const cookie=(n,v,age)=>`${n}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const real=v=>v&&v!=='CHANGE_ME';
const UA={'user-agent':'ConcordDocs (https://docs.concordstudios.lol, 2.0)'};
const CSP="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src * data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const page=(head='')=>new Response(head?HTML.replace('</head>',head+'</head>'):HTML,{headers:{'content-type':'text/html;charset=utf-8','x-content-type-options':'nosniff','cache-control':'no-cache','content-security-policy':CSP,'referrer-policy':'strict-origin-when-cross-origin'}});
const meta=(o,t,d)=>`<meta property="og:site_name" content="Concord Docs"><meta property="og:type" content="article"><meta property="og:title" content="${e(t)}"><meta property="og:description" content="${e(d)}"><meta property="og:image" content="${o}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(t)}"><meta name="twitter:description" content="${e(d)}"><meta name="twitter:image" content="${o}/og.png">`;
let ready;const init=db=>ready||(ready=db.batch(SCHEMA.map(q=>db.prepare(q))).catch(x=>{ready=null;throw x}));

async function access(db,docId,me){
 const d=await db.prepare('SELECT * FROM docs WHERE id=?').bind(docId).first();
 if(!d)return{};
 let role=null;
 if(me&&d.user_id===me.id)role='owner';
 else{
  const s=me&&await db.prepare('SELECT role FROM shares WHERE doc_id=? AND email=?').bind(docId,String(me.email).toLowerCase()).first();
  const l=await db.prepare('SELECT level FROM linkacc WHERE doc_id=?').bind(docId).first();
  role=[s?.role,l?.level].filter(Boolean).sort((a,b)=>RK[b]-RK[a])[0]||null;
  if(d.trashed)role=null;
 }
 return{d,role};
}
async function signin(db,env,key,name,pic,own,nx){
 const now=Date.now();
 let usr=await db.prepare('SELECT * FROM users WHERE email=?').bind(key).first();
 if(!usr){
  const open=(await db.prepare("SELECT value FROM settings WHERE key='signups'").first())?.value==='1';
  if(!open&&!own)return new Response('Sign-ups are closed.',{status:403});
  usr={id:id()};await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,0,?)').bind(usr.id,key,name,pic,own?'owner':'user',now).run();
 }else{
  if(usr.disabled)return new Response('Account disabled.',{status:403});
  await db.prepare('UPDATE users SET name=?,picture=?,role=? WHERE id=?').bind(name,pic,own?'owner':usr.role,usr.id).run();
 }
 const tok=id()+id();
 await db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(tok,usr.id,now+2592e6).run();
 const h=new Headers({location:nx&&/^\/[^\/\\]/.test(nx)||nx==='/'?nx:'/'});
 h.append('set-cookie',cookie('sid',tok,2592000));h.append('set-cookie',cookie('st','',0));h.append('set-cookie',cookie('nx','',0));
 return new Response(null,{status:302,headers:h});
}
const strip=h=>String(h||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim().slice(0,220);

export default{async fetch(r,env){
 const u=new URL(r.url),db=env.DB,m=r.method,now=Date.now();
 if(u.pathname.startsWith('/d/')&&m==='GET'){
  await init(db);const did=u.pathname.slice(3).split('/')[0];
  const l=await db.prepare('SELECT d.title,u.name FROM docs d JOIN linkacc a ON a.doc_id=d.id JOIN users u ON u.id=d.user_id WHERE d.id=? AND d.trashed=0').bind(did).first();
  const t=l?`${l.title} \u2014 Concord Docs`:'Shared document \u2014 Concord Docs';
  return page(meta(u.origin,t,l?`${l.name} shared a document with you. ${SLOGAN}`:`Sign in to view this document. ${SLOGAN}`));
 }
 if(!u.pathname.startsWith('/api/'))return page(meta(u.origin,'Concord Docs',SLOGAN));
 await init(db);
 const p=u.pathname.slice(4)||'/';
 const did=real(env.DISCORD_CLIENT_ID);
 if(p==='/config')return J({discord:!!did,slogan:SLOGAN});
 if(p==='/auth/login'){
  const s=id(),nx=u.searchParams.get('next')||'/';
  if(!did)return new Response('Discord sign-in is not configured.',{status:503});
  const h=new Headers({location:'https://discord.com/oauth2/authorize?'+new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,redirect_uri:u.origin+'/api/auth/callback',response_type:'code',scope:'identify',state:s,prompt:'none'})});
  h.append('set-cookie',cookie('st',s,600));h.append('set-cookie',cookie('nx',encodeURIComponent(nx),600));
  return new Response(null,{status:302,headers:h});
 }
 if(p==='/auth/callback'){
  const code=u.searchParams.get('code'),nx=decodeURIComponent(ck(r,'nx')||'/');
  if(!code||u.searchParams.get('state')!==ck(r,'st'))return new Response('Invalid login state. Go back and try again.',{status:400});
  const t=await(await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...UA},body:new URLSearchParams({code,client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,redirect_uri:u.origin+'/api/auth/callback',grant_type:'authorization_code'})})).json();
  if(!t.access_token)return new Response('Discord error: '+(t.error_description||t.error||'unknown'),{status:400});
  const g=await(await fetch('https://discord.com/api/users/@me',{headers:{authorization:'Bearer '+t.access_token,...UA}})).json();
  if(!g.id)return new Response('Discord sign-in failed',{status:401});
  const d=String(g.id);
  return signin(db,env,d,g.global_name||g.username||'User',g.avatar?`https://cdn.discordapp.com/avatars/${d}/${g.avatar}.png?size=64`:`https://cdn.discordapp.com/embed/avatars/${Number((BigInt(d)>>22n)%6n)}.png`,d===String(env.OWNER_DISCORD_ID||'').trim(),nx);
 }
 const sid=ck(r,'sid');
 const me=sid&&await db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.disabled=0').bind(sid,now).first()||null;
 if(p==='/auth/logout'){if(sid)await db.prepare('DELETE FROM sessions WHERE token=?').bind(sid).run();return J({ok:1},200,{'set-cookie':cookie('sid','',0)})}
 if(p==='/me'){
  if(!me)return J(null);
  const an=(await db.prepare("SELECT value FROM settings WHERE key='announcement'").first())?.value||'';
  return J({id:me.id,email:me.email,name:me.name,picture:me.picture,role:me.role,announcement:an});
 }
 if(m!=='GET'&&r.headers.get('x-csrf')!=='1')return J({error:'Bad request'},403);
 const [a,x,y,z]=p.slice(1).split('/');
 const anonOk=a==='docs'&&x&&((m==='GET'&&!y)||(m==='POST'&&y==='sync'));
 if(!me&&!anonOk)return J({error:'Not signed in'},401);
 const b=['POST','PATCH','PUT'].includes(m)?await r.json().catch(()=>({})):{};
 if(JSON.stringify(b).length>1.8e6)return J({error:'Document too large'},413);
 const all=async(q,...v)=>(await db.prepare(q).bind(...v).all()).results;
 const run=(q,...v)=>db.prepare(q).bind(...v).run();
 const first=(q,...v)=>db.prepare(q).bind(...v).first();

 if(a==='docs'){
  if(!x){
   if(m==='GET'){
    const view=u.searchParams.get('view')||'home',q=(u.searchParams.get('q')||'').slice(0,100),fo=u.searchParams.get('folder'),trash=view==='trash'?1:0;
    let w=`d.trashed=? AND `+(trash?'d.user_id=?':'(d.user_id=? OR EXISTS(SELECT 1 FROM shares s WHERE s.doc_id=d.id AND s.email=?) OR (r.ts IS NOT NULL AND EXISTS(SELECT 1 FROM linkacc k WHERE k.doc_id=d.id)))'),
     args=[trash,me.id];if(!trash)args.push(me.email.toLowerCase());
    let ord='d.updated_at DESC';
    if(view==='mine')w+=' AND d.user_id=?',args.push(me.id);
    if(view==='shared')w+=' AND d.user_id!=?',args.push(me.id);
    if(view==='starred')w+=' AND EXISTS(SELECT 1 FROM stars t WHERE t.user_id=? AND t.doc_id=d.id)',args.push(me.id);
    if(view==='recent'||view==='home')w+=' AND r.ts IS NOT NULL',ord='r.ts DESC';
    if(fo)w+=' AND d.folder_id=? AND d.user_id=?',args.push(fo,me.id);
    if(q)w+=' AND (d.title LIKE ? OR d.content LIKE ?)',args.push(`%${q}%`,`%${q}%`);
    const rows=await all(`SELECT d.id,d.title,d.folder_id,d.updated_at,d.user_id=? AS mine,substr(d.content,1,1500) c,u.name owner,(SELECT 1 FROM stars t WHERE t.user_id=? AND t.doc_id=d.id) starred,r.ts opened FROM docs d JOIN users u ON u.id=d.user_id LEFT JOIN recents r ON r.user_id=? AND r.doc_id=d.id WHERE ${w} ORDER BY ${ord} LIMIT 100`,me.id,me.id,me.id,...args);
    return J(rows.map(({c,...o})=>({...o,snip:strip(c)})));
   }
   if(m==='POST'){const d=id();await run('INSERT INTO docs(id,user_id,folder_id,title,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',d,me.id,b.folder_id||null,String(b.title||'Untitled document').slice(0,200),String(b.content||'').slice(0,2e6),now,now);await run('INSERT OR REPLACE INTO recents VALUES(?,?,?)',me.id,d,now);return J({id:d})}
  }else{
   const {d,role}=await access(db,x,me);
   if(!d||(!role&&me&&!d))return J({error:'Not found'},404);
   if(!role)return me?J({error:'You do not have access to this document'},403):J({error:'Not signed in'},401);
   const can=k=>RK[role]>=RK[k];
   if(!y){
    if(m==='GET'){
     if(me)await run('INSERT OR REPLACE INTO recents VALUES(?,?,?)',me.id,x,now);
     const ow=await first('SELECT name,picture,email FROM users WHERE id=?',d.user_id);
     const link=(await first('SELECT level FROM linkacc WHERE doc_id=?',x))?.level||'off';
     const shares=can('editor')?await all('SELECT sh.email,sh.role,u.name,u.picture FROM shares sh LEFT JOIN users u ON u.email=sh.email WHERE sh.doc_id=?',x):[];
     const st=me&&await first('SELECT 1 v FROM stars WHERE user_id=? AND doc_id=?',me.id,x);
     return J({id:d.id,title:d.title,content:d.content,updated_at:d.updated_at,folder_id:d.folder_id,role,link,owner:ow,shares,starred:!!st});
    }
    if(m==='PATCH'){
     const up=[],v=[];
     if(('title' in b||'content' in b)&&!can('editor'))return J({error:'Read-only'},403);
     if(('folder_id' in b||'trashed' in b)&&role!=='owner')return J({error:'Owner only'},403);
     if('title' in b)up.push('title=?'),v.push(String(b.title||'Untitled document').slice(0,200));
     if('content' in b)up.push('content=?'),v.push(String(b.content??'').slice(0,2e6));
     if('folder_id' in b)up.push('folder_id=?'),v.push(b.folder_id||null);
     if('trashed' in b)up.push('trashed=?'),v.push(b.trashed?1:0);
     if(up.length){
      await run(`UPDATE docs SET ${up.join(',')},updated_at=? WHERE id=?`,...v,now,x);
      if('content' in b){
       const last=await first('SELECT id,user_id,updated_at,name FROM versions WHERE doc_id=? ORDER BY updated_at DESC LIMIT 1',x),t=String('title' in b?b.title:d.title).slice(0,200);
       if(last&&last.user_id===me.id&&!last.name&&now-last.updated_at<6e5&&b.content!==undefined)await run('UPDATE versions SET content=?,title=?,updated_at=? WHERE id=?',String(b.content).slice(0,2e6),t,now,last.id);
       else{await run('INSERT INTO versions VALUES(?,?,?,?,?,?,NULL,?,?)',id(),x,me.id,me.name,t,String(b.content).slice(0,2e6),now,now);
        await run("DELETE FROM versions WHERE doc_id=? AND name IS NULL AND id NOT IN (SELECT id FROM versions WHERE doc_id=? AND name IS NULL ORDER BY updated_at DESC LIMIT 60)",x,x)}
      }
     }
     return J({ok:1,updated_at:now});
    }
    if(m==='DELETE'){if(role!=='owner')return J({error:'Owner only'},403);for(const t of['comments','versions','shares','linkacc','stars','recents','presence'])await run(`DELETE FROM ${t} WHERE doc_id=?`,x);await run('DELETE FROM docs WHERE id=?',x);return J({ok:1})}
   }
   if(y==='sync'&&m==='POST'){
    let pr=[];
    if(me){await run('INSERT OR REPLACE INTO presence VALUES(?,?,?,?,?)',x,me.id,me.name,me.picture,now);pr=await all('SELECT user_id id,name,pic FROM presence WHERE doc_id=? AND ts>? AND user_id!=?',x,now-12000,me.id)}
    const cc=await first('SELECT COUNT(*) n,COALESCE(MAX(upd),0) t FROM comments WHERE doc_id=?',x),cv=cc.n+':'+cc.t,o={updated_at:d.updated_at,title:d.title,role,presence:pr,cv};
    if(d.updated_at>(+b.since||0))o.content=d.content;
    if(cv!==b.cv)o.comments=await all('SELECT id,parent_id,user_id,user_name,user_pic,body,quote,resolved,created_at FROM comments WHERE doc_id=? ORDER BY created_at',x);
    return J(o);
   }
   if(y==='star'&&m==='POST'){if(b.on)await run('INSERT OR IGNORE INTO stars VALUES(?,?)',me.id,x);else await run('DELETE FROM stars WHERE user_id=? AND doc_id=?',me.id,x);return J({ok:1})}
   if(y==='copy'&&m==='POST'){const n=id();await run('INSERT INTO docs(id,user_id,title,content,created_at,updated_at) VALUES(?,?,?,?,?,?)',n,me.id,('Copy of '+d.title).slice(0,200),d.content,now,now);await run('INSERT OR REPLACE INTO recents VALUES(?,?,?)',me.id,n,now);return J({id:n})}
   if(y==='shares'&&m==='PUT'){
    if(role!=='owner')return J({error:'Owner only'},403);
    const inp=String(b.email||'').trim().replace(/^@/,'').toLowerCase();
    if(!inp)return J({error:'Enter a Discord user ID or name'},400);
    let em=inp;
    if(!/^\d{15,25}$/.test(inp)){
     const f=await all('SELECT email FROM users WHERE lower(name)=?',inp);
     if(!f.length)return J({error:'No signed-in user with that name. Use their Discord user ID instead.'},404);
     if(f.length>1)return J({error:'Several users share that name. Use their Discord user ID.'},400);
     em=f[0].email;
    }
    if(em===String((await first('SELECT email FROM users WHERE id=?',d.user_id)).email))return J({error:'That is the owner'},400);
    if(b.role&&RK[b.role]&&b.role!=='owner')await run('INSERT OR REPLACE INTO shares VALUES(?,?,?)',x,em,b.role);else await run('DELETE FROM shares WHERE doc_id=? AND email=?',x,em);
    return J({ok:1});
   }
   if(y==='link'&&m==='PUT'){
    if(role!=='owner')return J({error:'Owner only'},403);
    if(RK[b.level]&&b.level!=='owner')await run('INSERT OR REPLACE INTO linkacc VALUES(?,?)',x,b.level);else await run('DELETE FROM linkacc WHERE doc_id=?',x);
    return J({ok:1});
   }
   if(y==='comments'){
    if(m==='GET')return J(await all('SELECT id,parent_id,user_id,user_name,user_pic,body,quote,resolved,created_at FROM comments WHERE doc_id=? ORDER BY created_at',x));
    if(!me||!can('commenter'))return J({error:'You cannot comment'},403);
    if(m==='POST'){const body=String(b.body||'').trim().slice(0,2000);if(!body)return J({error:'Empty comment'},400);const c=id();await run('INSERT INTO comments VALUES(?,?,?,?,?,?,?,?,0,?,?)',c,x,b.parent_id||null,me.id,me.name,me.picture,body,String(b.quote||'').slice(0,300),now,now);return J({id:c})}
    const c=z&&await first('SELECT * FROM comments WHERE id=? AND doc_id=?',z,x);if(!c)return J({error:'Not found'},404);
    if(m==='PATCH'){
     if('resolved' in b)await run('UPDATE comments SET resolved=?,upd=? WHERE id=? OR parent_id=?',b.resolved?1:0,now,z,z);
     if('body' in b){if(c.user_id!==me.id)return J({error:'Not your comment'},403);await run('UPDATE comments SET body=?,upd=? WHERE id=?',String(b.body).slice(0,2000),now,z)}
     return J({ok:1});
    }
    if(m==='DELETE'){if(c.user_id!==me.id&&role!=='owner')return J({error:'Not allowed'},403);await run('DELETE FROM comments WHERE id=? OR parent_id=?',z,z);return J({ok:1})}
   }
   if(y==='versions'){
    if(!can('editor'))return J({error:'Editors only'},403);
    if(!z&&m==='GET')return J(await all('SELECT id,user_name,title,name,created_at,updated_at FROM versions WHERE doc_id=? ORDER BY updated_at DESC LIMIT 100',x));
    if(!z&&m==='POST'){await run('INSERT INTO versions VALUES(?,?,?,?,?,?,?,?,?)',id(),x,me.id,me.name,d.title,d.content,String(b.name||'Named version').slice(0,80),now,now);return J({ok:1})}
    const v=await first('SELECT * FROM versions WHERE id=? AND doc_id=?',z,x);if(!v)return J({error:'Not found'},404);
    if(m==='GET'&&!u.pathname.endsWith('/restore'))return J(v);
    if(m==='POST'&&p.endsWith('/restore')){
     await run('INSERT INTO versions VALUES(?,?,?,?,?,?,?,?,?)',id(),x,me.id,me.name,d.title,d.content,'Before restore',now,now);
     await run('UPDATE docs SET content=?,title=?,updated_at=? WHERE id=?',v.content,v.title,now+1,x);return J({ok:1});
    }
   }
  }
 }
 if(a==='folders'){
  if(!x){
   if(m==='GET')return J(await all('SELECT id,name FROM folders WHERE user_id=? ORDER BY name',me.id));
   if(m==='POST'){const f=id();await run('INSERT INTO folders VALUES(?,?,?)',f,me.id,String(b.name||'Folder').slice(0,80));return J({id:f})}
  }else{
   if(m==='PATCH'){await run('UPDATE folders SET name=? WHERE id=? AND user_id=?',String(b.name||'Folder').slice(0,80),x,me.id);return J({ok:1})}
   if(m==='DELETE'){await run('UPDATE docs SET folder_id=NULL WHERE folder_id=? AND user_id=?',x,me.id);await run('DELETE FROM folders WHERE id=? AND user_id=?',x,me.id);return J({ok:1})}
  }
 }
 if(a==='admin'){
  if(!['owner','admin'].includes(me.role))return J({error:'Forbidden'},403);
  const own=me.role==='owner';
  if(x==='users'&&!y&&m==='GET')return J(await all('SELECT id,email,name,picture,role,disabled,created_at FROM users ORDER BY created_at'));
  if(x==='docs'&&!y&&m==='GET')return J(await all('SELECT d.id,d.title,d.updated_at,u.email FROM docs d JOIN users u ON u.id=d.user_id ORDER BY d.updated_at DESC LIMIT 500'));
  if(x==='docs'&&y&&m==='DELETE'){for(const t of['comments','versions','shares','linkacc','stars','recents','presence'])await run(`DELETE FROM ${t} WHERE doc_id=?`,y);await run('DELETE FROM docs WHERE id=?',y);return J({ok:1})}
  if(x==='settings'){
   if(m==='PUT'){if(!own)return J({error:'Owner only'},403);await run("REPLACE INTO settings VALUES('signups',?)",b.signups?'1':'0');await run("REPLACE INTO settings VALUES('announcement',?)",String(b.announcement||'').slice(0,300))}
   return J(Object.fromEntries((await all('SELECT key,value FROM settings')).map(s=>[s.key,s.value])));
  }
  if(x==='users'&&y){
   const t=await first('SELECT * FROM users WHERE id=?',y);
   if(!t||t.role==='owner'||t.id===me.id)return J({error:'Not allowed'},403);
   if(m==='PATCH'){
    if('role' in b){if(!own||!['user','admin'].includes(b.role))return J({error:'Owner only'},403);await run('UPDATE users SET role=? WHERE id=?',b.role,y)}
    if('disabled' in b){if(t.role==='admin'&&!own)return J({error:'Owner only'},403);await run('UPDATE users SET disabled=? WHERE id=?',b.disabled?1:0,y);if(b.disabled)await run('DELETE FROM sessions WHERE user_id=?',y)}
    return J({ok:1});
   }
   if(m==='DELETE'){if(!own)return J({error:'Owner only'},403);for(const q of['docs','folders','sessions','stars','recents'])await run(`DELETE FROM ${q} WHERE user_id=?`,y);await run('DELETE FROM users WHERE id=?',y);return J({ok:1})}
  }
 }
 return J({error:'Not found'},404);
}};
