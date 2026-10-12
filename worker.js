const SCHEMA=["CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,picture TEXT,role TEXT DEFAULT 'user',disabled INTEGER DEFAULT 0,created_at INTEGER)", "CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER)", "CREATE TABLE IF NOT EXISTS folders(id TEXT PRIMARY KEY,user_id TEXT,name TEXT)", "CREATE TABLE IF NOT EXISTS docs(id TEXT PRIMARY KEY,user_id TEXT,folder_id TEXT,title TEXT,content TEXT DEFAULT '',trashed INTEGER DEFAULT 0,created_at INTEGER,updated_at INTEGER)", "CREATE INDEX IF NOT EXISTS i_docs ON docs(user_id,updated_at)", "CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT)", "INSERT OR IGNORE INTO settings VALUES('signups','1'),('announcement','')"];
const J=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json',...h}});
const id=()=>crypto.randomUUID();
const ck=(r,n)=>(r.headers.get('cookie')||'').split(/; */).map(c=>c.split('=')).find(c=>c[0]===n)?.[1];
const cookie=(n,v,age)=>`${n}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const pick=(b,keys)=>keys.filter(k=>k in b);
let ready;const init=db=>ready||(ready=db.batch(SCHEMA.map(q=>db.prepare(q))));
export default{async fetch(r,env){
 const u=new URL(r.url),db=env.DB,p=u.pathname.slice(4)||'/',m=r.method,now=Date.now();
 await init(db);
 const [a,x,y]=p.slice(1).split('/');
 if(p==='/auth/login'){const s=id();return new Response(null,{status:302,headers:{location:'https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:u.origin+'/api/auth/callback',response_type:'code',scope:'openid email profile',state:s,prompt:'select_account'}),'set-cookie':cookie('st',s,600)}})}
 if(p==='/auth/callback'){
  const code=u.searchParams.get('code');
  if(!code||u.searchParams.get('state')!==ck(r,'st'))return new Response('Invalid login state',{status:400});
  const t=await(await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:u.origin+'/api/auth/callback',grant_type:'authorization_code'})})).json();
  const g=await(await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:'Bearer '+t.access_token}})).json();
  if(!g.email||!g.email_verified)return new Response('Google sign-in failed',{status:401});
  const email=g.email.toLowerCase(),own=email===(env.OWNER_EMAIL||'').toLowerCase();
  let usr=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  if(!usr){
   const open=(await db.prepare("SELECT value FROM settings WHERE key='signups'").first())?.value==='1';
   if(!open&&!own)return new Response('Sign-ups are closed.',{status:403});
   usr={id:id()};await db.prepare('INSERT INTO users VALUES(?,?,?,?,?,0,?)').bind(usr.id,email,g.name,g.picture,own?'owner':'user',now).run();
  }else{
   if(usr.disabled)return new Response('Account disabled.',{status:403});
   await db.prepare('UPDATE users SET name=?,picture=?,role=? WHERE id=?').bind(g.name,g.picture,own?'owner':usr.role,usr.id).run();
  }
  const tok=id()+id();
  await db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(tok,usr.id,now+2592e6).run();
  const h=new Headers({location:'/'});h.append('set-cookie',cookie('sid',tok,2592000));h.append('set-cookie',cookie('st','',0));
  return new Response(null,{status:302,headers:h});
 }
 const sid=ck(r,'sid');
 const me=sid&&await db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.disabled=0').bind(sid,now).first();
 if(p==='/auth/logout'){if(sid)await db.prepare('DELETE FROM sessions WHERE token=?').bind(sid).run();return J({ok:1},200,{'set-cookie':cookie('sid','',0)})}
 if(p==='/me'){
  if(!me)return J(null);
  const an=(await db.prepare("SELECT value FROM settings WHERE key='announcement'").first())?.value||'';
  return J({id:me.id,email:me.email,name:me.name,picture:me.picture,role:me.role,announcement:an});
 }
 if(!me)return J({error:'Not signed in'},401);
 if(m!=='GET'&&r.headers.get('x-csrf')!=='1')return J({error:'Bad request'},403);
 const b=['POST','PATCH','PUT'].includes(m)?await r.json().catch(()=>({})):{};
 if(JSON.stringify(b).length>1.8e6)return J({error:'Document too large'},413);
 const all=async(q,...v)=>(await db.prepare(q).bind(...v).all()).results;
 const run=(q,...v)=>db.prepare(q).bind(...v).run();
 if(a==='docs'){
  if(!x){
   if(m==='GET')return J(await all('SELECT id,title,folder_id,trashed,updated_at FROM docs WHERE user_id=? AND trashed=? ORDER BY updated_at DESC',me.id,u.searchParams.get('trash')==='1'?1:0));
   if(m==='POST'){const d=id();await run('INSERT INTO docs(id,user_id,folder_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)',d,me.id,b.folder_id||null,'Untitled document',now,now);return J({id:d})}
  }else{
   const d=await db.prepare('SELECT * FROM docs WHERE id=? AND user_id=?').bind(x,me.id).first();
   if(!d)return J({error:'Not found'},404);
   if(m==='GET')return J(d);
   if(m==='PATCH'){
    const ks=pick(b,['title','content','folder_id','trashed']);
    if(ks.length)await run(`UPDATE docs SET ${ks.map(k=>k+'=?').join(',')},updated_at=? WHERE id=?`,...ks.map(k=>k==='trashed'?(b[k]?1:0):k==='folder_id'?(b[k]||null):String(b[k]??'').slice(0,k==='title'?200:2e6)),now,x);
    return J({ok:1});
   }
   if(m==='DELETE'){await run('DELETE FROM docs WHERE id=?',x);return J({ok:1})}
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
  if(x==='docs'&&y&&m==='DELETE'){await run('DELETE FROM docs WHERE id=?',y);return J({ok:1})}
  if(x==='settings'){
   if(m==='PUT'){if(!own)return J({error:'Owner only'},403);await run("REPLACE INTO settings VALUES('signups',?)",b.signups?'1':'0');await run("REPLACE INTO settings VALUES('announcement',?)",String(b.announcement||'').slice(0,300))}
   return J(Object.fromEntries((await all('SELECT key,value FROM settings')).map(s=>[s.key,s.value])));
  }
  if(x==='users'&&y){
   const t=await db.prepare('SELECT * FROM users WHERE id=?').bind(y).first();
   if(!t||t.role==='owner'||t.id===me.id)return J({error:'Not allowed'},403);
   if(m==='PATCH'){
    if('role' in b){if(!own||!['user','admin'].includes(b.role))return J({error:'Owner only'},403);await run('UPDATE users SET role=? WHERE id=?',b.role,y)}
    if('disabled' in b){if(t.role==='admin'&&!own)return J({error:'Owner only'},403);await run('UPDATE users SET disabled=? WHERE id=?',b.disabled?1:0,y);if(b.disabled)await run('DELETE FROM sessions WHERE user_id=?',y)}
    return J({ok:1});
   }
   if(m==='DELETE'){if(!own)return J({error:'Owner only'},403);for(const q of ['docs','folders','sessions'])await run(`DELETE FROM ${q} WHERE user_id=?`,y);await run('DELETE FROM users WHERE id=?',y);return J({ok:1})}
  }
 }
 return J({error:'Not found'},404);
}};
