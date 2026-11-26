import Fastify,{type FastifyRequest} from 'fastify';
import cookie from '@fastify/cookie';
import limit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import argon2 from 'argon2';
import {resolve} from 'node:path';
import {db,tx} from './db.js';
import {migrate} from './migrate.js';
import type {PoolClient} from 'pg';
const onRender=process.env.RENDER==='true';
const configuredOrigin=process.env.APP_ORIGIN?.trim() || (onRender ? process.env.RENDER_EXTERNAL_URL : undefined);
if(onRender&&(!configuredOrigin||!process.env.DATABASE_URL?.trim()))throw Error('Configure APP_ORIGIN e DATABASE_URL no Render.');
const originUrl=new URL(configuredOrigin||'http://localhost:8080');
if(onRender&&originUrl.protocol!=='https:')throw Error('APP_ORIGIN no Render deve usar HTTPS.');
const origin=originUrl.origin;
const app=Fastify({bodyLimit:16384,trustProxy:onRender?(_address,hop)=>hop===0:false});
const hash=(t:string)=>createHash('sha256').update(t).digest('hex');
const err=(statusCode:number,message:string):never=>{throw Object.assign(new Error(message),{statusCode});};
const clean=(v:unknown,min=1,max=500)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max?v.trim():err(400,'Confira os campos informados.');
const password=(v:unknown)=>typeof v==='string'&&v.length>=12&&v.length<=128?v:err(400,'A senha deve ter entre 12 e 128 caracteres.');
const email=(v:unknown)=>{const e=clean(v,3,254).toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:err(400,'Informe um e-mail válido.');};
const date=(v:unknown)=>{const s=clean(v,10,10),d=new Date(s+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?s:err(400,'Informe uma data válida.');};
const category=(v:unknown)=>['Recipientes','Mochilas e bolsas','Chaves','Eletrônicos','Roupas','Guarda-chuvas','Outros'].includes(String(v))?String(v):err(400,'Categoria inválida.');
function body(r:FastifyRequest){return (r.body||{}) as Record<string,unknown>;}
function param(r:FastifyRequest){return clean((r.params as {id:string}).id,1,80);}
const camel=(r:Record<string,unknown>)=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k.replace(/_([a-z])/g,(_,x)=>x.toUpperCase()),v]));
type Account={id:string;name:string;role:'user'|'staff'|'admin';institution_id:string|null;must_change:boolean;password:string};
async function account(r:FastifyRequest,role?:Account['role'],allowChange=false){
 const a:Account|undefined=r.cookies.achei?(await db.query('select a.* from accounts a join sessions s on s.account_id=a.id where s.token=$1 and s.expires>now() and a.enabled',[hash(r.cookies.achei)])).rows[0]:undefined;
 if(role&&!a)err(401,'Entre para continuar.');
 if(role&&a?.role!==role)err(403,'Ação indisponível para esta conta.');
 if(role&&a?.must_change&&!allowChange)err(403,'Troque sua senha para continuar.');
 return a;
}
async function requireRole(r:FastifyRequest,role:Account['role']){return (await account(r,role))!;}
function profile(a:Account){return {id:a.id,name:a.name,role:a.role,institutionId:a.institution_id,initials:a.name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase(),mustChange:a.must_change};}
await app.register(cookie);
await app.register(limit,{global:false});
app.addHook('onRequest',async(r,reply)=>{
 reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','same-origin').header('X-Frame-Options','DENY');
 if(r.url.startsWith('/api/'))reply.header('Cache-Control','no-store');
 if(!['GET','HEAD','OPTIONS'].includes(r.method)&&r.headers.origin!==origin)err(403,'Origem não autorizada.');
});
app.setErrorHandler((e,_r,reply)=>{
 const x=e as Error & {statusCode?:number;code?:string};
 const s=x.code==='23505'?409:x.code==='23503'?400:x.statusCode||500;
 if(s>=500)console.error(x.code||x.name);
 reply.status(s).send({message:s>=500?'Não foi possível concluir a operação.':x.code==='23505'?'O registro já existe ou foi alterado.':x.code==='23503'?'Registro relacionado inválido.':x.message});
});
app.get('/api/health',async()=>({ok:true}));
app.get('/api/ready',async(_r,reply)=>{try{await db.query('select 1 from migrations limit 1');return {ok:true};}catch{return reply.code(503).send({ok:false});}});
const authCfg={config:{rateLimit:{max:12,timeWindow:'1 minute'}}};
app.post('/api/auth/cadastro',authCfg,async(r,reply)=>{
 const b=body(r);await db.query("insert into accounts(id,name,email,password,role) values($1,$2,$3,$4,'user')",[randomUUID(),clean(b.name,2,100),email(b.email),await argon2.hash(password(b.password))]);return reply.code(201).send({ok:true});
});
const cookieOpts={path:'/',httpOnly:true,sameSite:'lax' as const,secure:origin.startsWith('https:')};
app.post('/api/auth/login',authCfg,async(r,reply)=>{
 const b=body(r),e=email(b.email),pass=password(b.password);
 const a=(await db.query('select * from accounts where email=$1 and enabled',[e])).rows[0];
 if(!a||!await argon2.verify(a.password,pass))err(401,'E-mail ou senha incorretos.');
 const token=randomBytes(32).toString('base64url');
 await tx(async c=>{
  await c.query('delete from sessions where expires<=now() or token=$1',[hash(r.cookies.achei||'')]);
  await c.query("insert into sessions values($1,$2,now()+interval '8 hours')",[hash(token),a.id]);
 });
 return reply.setCookie('achei',token,{...cookieOpts,maxAge:28800}).send(profile(a));
});
app.get('/api/auth/sessao',async r=>{const a=await account(r);return a?profile(a):null;});
app.post('/api/auth/logout',async(r,reply)=>{await db.query('delete from sessions where token=$1',[hash(r.cookies.achei||'')]);return reply.clearCookie('achei',cookieOpts).send({ok:true});});
app.post('/api/auth/senha',authCfg,async r=>{
 const a=await account(r);if(!a)return err(401,'Entre para continuar.');
 const b=body(r);if(!await argon2.verify(a.password,password(b.current)))err(400,'Senha atual incorreta.');
 const next=password(b.password);if(next===b.current)err(400,'Escolha uma senha diferente da atual.');
 const digest=await argon2.hash(next);
 await tx(async c=>{await c.query('update accounts set password=$1,must_change=false where id=$2',[digest,a.id]);await c.query('delete from sessions where account_id=$1 and token<>$2',[a.id,hash(r.cookies.achei!)]);});
 return {ok:true};
});
const itemPublic='id,institution_id,category,summary,found_date,location,status';
app.get('/api/instituicoes',async()=> (await db.query('select * from institutions order by name,id')).rows);
app.get('/api/instituicoes/:id/achados',async r=>{
 const q=r.query as Record<string,unknown>;const from=q.from?date(q.from):null,to=q.to?date(q.to):null;
 if(from&&to&&from>to)err(400,'Confira o período da busca.');
 const state=q.status?clean(q.status):null;if(state&&!['available','returning','returned'].includes(state))err(400,'Situação inválida.');
 const offset=Math.min(100000,Math.max(0,Number(q.offset)||0));if(!Number.isInteger(offset))err(400,'Página inválida.');
 return (await db.query(`select ${itemPublic} from items where institution_id=$1 and ($2::text is null or category=$2)
 and ($3::date is null or found_date>=$3) and ($4::date is null or found_date<=$4) and ($5::text is null or status=$5)
 order by found_date desc,id limit 50 offset $6`,[param(r),q.category?category(q.category):null,from,to,state,offset])).rows.map(camel);
});
app.get('/api/achados/:id',async r=>{
 await requireRole(r,'user');
 const {rows}=await db.query(`select ${itemPublic},description from items where id=$1`,[param(r)]);
 return rows[0]?camel(rows[0]):err(404,'Objeto não encontrado.');
});
app.get('/api/visao',async r=>{
 const a=await account(r);const staff=a?.role==='staff'&&!a.must_change,user=a?.role==='user'&&!a.must_change;
 const inst=staff?a!.institution_id:null,uid=user?a!.id:null;
 const [institutions,items,losses,claims,notices,history,people]=await Promise.all([
  db.query('select * from institutions order by name,id'),
  db.query(`select ${itemPublic},case when $2::boolean or institution_id=$1 then description else '' end as description,
  case when institution_id=$1 then evidence else '' end as evidence,case when institution_id=$1 then storage else '' end as storage
  from items order by found_date desc,id`,[inst,!!user]),
  db.query('select * from losses where user_id=$1 order by id',[uid]),
  db.query('select c.* from claims c join items i on i.id=c.item_id where c.user_id=$1 or i.institution_id=$2 order by c.created_at desc,c.id',[uid,inst]),
  db.query('select * from notices where user_id=$1 order by created_at desc,id',[uid]),
  db.query(`select h.id,h.item_id,h.claim_id,case when i.institution_id=$2 then a.name when a.id=$1 then a.name else 'Recepção' end as actor,h.label,h.at
  from history h join items i on i.id=h.item_id join accounts a on a.id=h.actor_id left join claims c on c.id=h.claim_id
  where c.user_id=$1 or i.institution_id=$2 order by h.at desc,h.id desc`,[uid,inst]),
  db.query("select distinct a.id,a.name,a.role from accounts a join claims c on c.user_id=a.id join items i on i.id=c.item_id where i.institution_id=$1",[inst])
 ]);
 return {profileId:a?.id||null,profiles:[...(a?[profile(a)]:[]),...people.rows],institutions:institutions.rows,items:items.rows.map(camel),losses:losses.rows.map(camel),claims:claims.rows.map(camel),notices:notices.rows.map(camel),history:history.rows.map(camel)};
});
async function audit(c:PoolClient,a:Account,item:string,label:string,claim?:string){
 await c.query('insert into history(item_id,claim_id,actor_id,label) values($1,$2,$3,$4)',[item,claim||null,a.id,label]);
}
async function rescan(c:PoolClient,inst:string,cat:string){
 await c.query(`insert into notices(id,user_id,loss_id,item_id)
 select gen_random_uuid()::text,l.user_id,l.id,i.id from losses l join items i using(institution_id,category)
 where l.active and i.status='available' and l.institution_id=$1 and l.category=$2 and i.found_date between l.start_date and l.end_date+7
 on conflict(loss_id,item_id) do nothing`,[inst,cat]);
}
const lockMatching=(c:PoolClient)=>c.query('select pg_advisory_xact_lock(71235)');
app.post('/api/institucional/achados',async r=>{
 const a=await requireRole(r,'staff'),b=body(r),id=clean(b.id,1,80),cat=category(b.category);
 const vals=[id,a.institution_id,cat,clean(b.summary,1,100),date(b.foundDate),clean(b.location,1,100),clean(b.description),clean(b.evidence),clean(b.storage,1,100)];
 return tx(async c=>{
  await lockMatching(c);
  const old=(await c.query('select institution_id from items where id=$1 for update',[id])).rows[0];
  if(old&&old.institution_id!==a.institution_id)err(404,'Objeto não encontrado.');
  if(Boolean(old)!==(b.edit===true))err(old?409:404,old?'Identificador em uso.':'Objeto não encontrado.');
  await c.query(`insert into items(id,institution_id,category,summary,found_date,location,description,evidence,storage) values($1,$2,$3,$4,$5,$6,$7,$8,$9)
  on conflict(id) do update set category=excluded.category,summary=excluded.summary,found_date=excluded.found_date,location=excluded.location,description=excluded.description,evidence=excluded.evidence,storage=excluded.storage`,vals);
  await audit(c,a,id,old?'Dados do objeto atualizados.':'Objeto cadastrado como disponível.');
  await rescan(c,a.institution_id!,cat);return {id};
 });
});
app.post('/api/minhas-perdas',async r=>{
 const a=await requireRole(r,'user'),b=body(r),id=clean(b.id,1,80),inst=clean(b.institutionId,1,80),cat=category(b.category),start=date(b.startDate),end=date(b.endDate);
 if(start>end)err(400,'A data final não pode anteceder a inicial.');
 return tx(async c=>{
  await lockMatching(c);
  const old=(await c.query('select user_id from losses where id=$1 for update',[id])).rows[0];
  if(old&&old.user_id!==a.id)err(404,'Busca não encontrada.');
  if(Boolean(old)!==(b.edit===true))err(old?409:404,old?'Identificador em uso.':'Busca não encontrada.');
  await c.query(`insert into losses values($1,$2,$3,$4,$5,$6,$7,$8,true) on conflict(id) do update
  set institution_id=excluded.institution_id,category=excluded.category,start_date=excluded.start_date,end_date=excluded.end_date,location=excluded.location,description=excluded.description`,[id,a.id,inst,cat,start,end,clean(b.location,0,100),clean(b.description,0)]);
  await rescan(c,inst,cat);return {id};
 });
});
app.patch('/api/minhas-perdas/:id',async r=>{
 const a=await requireRole(r,'user'),id=param(r),active=body(r).active;if(typeof active!=='boolean')err(400,'Informe a situação da busca.');
 return tx(async c=>{
  await lockMatching(c);
  const l=(await c.query('update losses set active=$3 where id=$1 and user_id=$2 returning institution_id,category',[id,a.id,active])).rows[0];
  if(!l)err(404,'Busca não encontrada.');
  if(active)await rescan(c,l.institution_id,l.category);return {id};
 });
});
app.patch('/api/meus-avisos/:id',async r=>{
 const a=await requireRole(r,'user');if(!(await db.query('update notices set read=true where id=$1 and user_id=$2',[param(r),a.id])).rowCount)err(404,'Aviso não encontrado.');return {ok:true};
});
app.post('/api/minhas-solicitacoes',async r=>{
 const a=await requireRole(r,'user'),b=body(r),id=clean(b.id,1,80),item=clean(b.itemId,1,80),loss=b.lossId?clean(b.lossId,1,80):null,description=clean(b.description);
 return tx(async c=>{
  const i=(await c.query('select status from items where id=$1 for update',[item])).rows[0];if(i?.status!=='available')err(409,'Objeto indisponível para retirada.');
  if(loss&&!(await c.query(`select 1 from losses l join items i using(institution_id,category)
  where l.id=$1 and l.user_id=$2 and i.id=$3 and l.active and i.found_date between l.start_date and l.end_date+7 for update of l`,[loss,a.id,item])).rowCount)err(400,'A busca vinculada não corresponde a este objeto.');
  await c.query('insert into claims(id,user_id,item_id,loss_id,description) values($1,$2,$3,$4,$5)',[id,a.id,item,loss,description]);await audit(c,a,item,'Solicitação enviada para análise.',id);return {id};
 });
});
app.post('/api/institucional/solicitacoes/:id',async r=>{
 const a=await requireRole(r,'staff'),id=param(r),b=body(r),action=clean(b.action),message=clean(b.response??'',0);
 return tx(async c=>{
  await lockMatching(c);
  const i=(await c.query('select i.* from items i join claims cl on cl.item_id=i.id where cl.id=$1 and i.institution_id=$2 for update of i',[id,a.institution_id])).rows[0];if(!i)err(404,'Solicitação não encontrada.');
  const cl=(await c.query('select * from claims where id=$1 for update',[id])).rows[0];
  let result=cl.status,status=i.status,response=message,label='';
  if(action==='respond'&&['pending','approved'].includes(cl.status)&&message)label='Orientação da recepção atualizada.';
  else if(action==='approve'&&cl.status==='pending'&&i.status==='available'){result='approved';status='returning';response||='Propriedade conferida. Compareça à recepção no horário de atendimento.';label='Propriedade validada. Aguardando retirada.';}
  else if(action==='reject'&&cl.status==='pending'&&message){result='rejected';label='Propriedade não confirmada: '+message;}
  else if(action==='cancel'&&cl.status==='approved'&&i.status==='returning'&&message){result='cancelled';status='available';label='Devolução cancelada: '+message;}
  else if(action==='complete'&&cl.status==='approved'&&i.status==='returning'&&b.confirmed===true){
   result='completed';status='returned';response||='Entrega realizada e registrada pela instituição.';label='Entrega física registrada. Objeto devolvido.';
   if(cl.loss_id)await c.query('update losses set active=false where id=$1',[cl.loss_id]);
   const others=await c.query("update claims set status='cancelled',response='Solicitação encerrada: objeto já devolvido.',updated_at=now() where item_id=$1 and status='pending' returning id",[i.id]);
   for(const row of others.rows)await audit(c,a,i.id,'Pedido encerrado por devolução do objeto.',row.id);
  }else err(409,'A ação não é válida para o estado atual. Confira a confirmação ou o motivo.');
  await c.query('update claims set status=$2,response=$3,updated_at=now() where id=$1',[id,result,response]);
  if(status!==i.status)await c.query('update items set status=$2 where id=$1',[i.id,status]);
  if(action==='cancel')await rescan(c,i.institution_id,i.category);
  await audit(c,a,i.id,label,id);return {id};
 });
});
app.get('/api/admin/funcionarios',async r=>{await requireRole(r,'admin');return (await db.query("select id,name,email,institution_id,enabled,must_change from accounts where role='staff' order by name,id")).rows.map(camel);});
app.post('/api/admin/instituicoes',async r=>{
 const a=await requireRole(r,'admin'),b=body(r),id=randomUUID(),name=clean(b.name,2,100);
 await tx(async c=>{
  await c.query('insert into institutions values($1,$2,$3,$4,$5,$6,$7)',[id,name,clean(b.unit,1,100),clean(b.city,1,100),name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(),clean(b.description,0),clean(b.hours,1,150)]);
  await c.query("insert into admin_history(actor_id,target_id,action) values($1,$2,'Instituição cadastrada')",[a.id,id]);
 });return {id};
});
app.post('/api/admin/funcionarios',async r=>{
 const a=await requireRole(r,'admin'),b=body(r),id=randomUUID();
 const digest=await argon2.hash(password(b.password));
 await tx(async c=>{
  await c.query("insert into accounts(id,name,email,password,role,institution_id,must_change) values($1,$2,$3,$4,'staff',$5,true)",[id,clean(b.name,2,100),email(b.email),digest,clean(b.institutionId,1,80)]);
  await c.query("insert into admin_history(actor_id,target_id,action) values($1,$2,'Funcionário vinculado')",[a.id,id]);
 });return {id};
});
app.patch('/api/admin/funcionarios/:id',async r=>{
 const a=await requireRole(r,'admin'),b=body(r),id=param(r);
 await tx(async c=>{
  if(b.enabled===false){if(!(await c.query("update accounts set enabled=false where id=$1 and role='staff'",[id])).rowCount)err(404,'Funcionário não encontrado.');}
  else if(b.institutionId){if(!(await c.query("update accounts set institution_id=$2 where id=$1 and role='staff' and enabled",[id,clean(b.institutionId,1,80)])).rowCount)err(404,'Funcionário não encontrado.');}
  else err(400,'Informe a alteração desejada.');
  await c.query('delete from sessions where account_id=$1',[id]);
  await c.query('insert into admin_history(actor_id,target_id,action) values($1,$2,$3)',[a.id,id,b.enabled===false?'Funcionário desativado':'Vínculo alterado']);
 });return {id};
});
await app.register(staticFiles,{root:resolve('frontend/dist')});
app.setNotFoundHandler((r,reply)=>r.url.startsWith('/api/')||r.method!=='GET'||resolve(r.url.split('?')[0]).split('/').pop()?.includes('.')?reply.code(404).send({message:'Página não encontrada.'}):reply.sendFile('index.html'));
if(onRender){
 try { await migrate(); }
 catch(error) {
  const code=(error as {code?:string}).code ?? 'erro de configuração';
  console.error('Migração falhou:',code);
  await db.end();
  process.exit(1);
 }
}
await app.listen({port:Number(process.env.PORT||8080),host:process.env.BIND_HOST||(onRender?'0.0.0.0':'127.0.0.1')});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void app.close().then(()=>db.end());});
