import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Embedded from 'embedded-postgres';
const dir=await mkdtemp(join(tmpdir(),'achei-pg-'));
const pg=new Embedded({databaseDir:join(dir,'db'),port:55437,user:'postgres',password:'localtest',autoRehydrateSymlinks:true,postgresFlags:['-c','unix_socket_directories=','-c','listen_addresses=127.0.0.1']});
const env={...process.env,DATABASE_URL:'postgres://postgres:localtest@127.0.0.1:55437/postgres',PORT:'58080',APP_ORIGIN:'http://127.0.0.1:58080',BIND_HOST:'127.0.0.1'};
const manage=(args,input)=>execFileSync(process.execPath,['dist/manage.js',...args],{env,input,stdio:['pipe','inherit','inherit']});
let app;
async function start(overrides={}){
 app=spawn(process.execPath,['dist/main.js'],{env:{...env,...overrides},stdio:'inherit'});
 for(let i=0;i<100;i++){try{if((await fetch(env.APP_ORIGIN+'/api/ready')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
 throw Error('Servidor indisponível.');
}
async function stop(){if(app?.exitCode===null){app.kill();await once(app,'exit');}}
const client=()=>{
 let cookie='';
 return async(path,method='GET',data,status=200,origin=env.APP_ORIGIN)=>{
  const r=await fetch(env.APP_ORIGIN+'/api'+path,{method,headers:{origin,cookie,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});
  const sc=r.headers.get('set-cookie');if(sc)cookie=sc.split(';')[0];
  const result=await r.json();
  if(status!==null)assert.equal(r.status,status,JSON.stringify(result));
  return status===null?r.status:result;
 };
};
try{
 await pg.initialise();await pg.start();
 // Simula o ambiente do Render e verifica que o servidor migra um banco vazio antes de ficar pronto.
 await start({RENDER:'true',APP_ORIGIN:'',RENDER_EXTERNAL_URL:'https://achei-test.onrender.com',DATABASE_URL_UNPOOLED:env.DATABASE_URL});
 assert.deepEqual(await (await fetch(env.APP_ORIGIN+'/api/ready')).json(),{ok:true});
 const sameOrigin=await fetch(env.APP_ORIGIN+'/api/auth/login',{method:'POST',headers:{origin:'https://achei-test.onrender.com','Content-Type':'application/json'},body:'{}'});
 assert.equal(sameOrigin.status,400);
 const otherOrigin=await fetch(env.APP_ORIGIN+'/api/auth/login',{method:'POST',headers:{origin:'https://other.example.test','Content-Type':'application/json'},body:'{}'});
 assert.equal(otherOrigin.status,403);
 const info=await (await fetch(env.APP_ORIGIN+'/')).text();assert.match(info,/<html/);
 await stop();
 manage(['migrate']);manage(['migrate']);manage(['demo','--contas']);manage(['demo','--contas']);
 const pass='fixture-password-user',temp='fixture-temporary-staff',staffpass='fixture-new-password';
 manage(['admin','admin@example.test'],pass+'\n');
 await start();
 const admin=client(),u=client(),v=client(),a=client(),b=client(),guest=client();
 const login=(api,email,password=pass)=>api('/auth/login','POST',{email,password});
 await login(admin,'admin@example.test');
 await admin('/admin/instituicoes','POST',{name:'Campus de teste',unit:'Norte',city:'Ribeirão Preto',description:'',hours:'9h às 17h'});
 const staffIds={};
 for(const [i,institutionId,api] of [['a','horizonte',a],['b','movimento',b]]){
  const email=i+'@example.test';staffIds[i]=(await admin('/admin/funcionarios','POST',{name:'Atendente '+i,email,institutionId,password:temp})).id;
  assert.equal((await login(api,email,temp)).mustChange,true);
  await api('/institucional/achados','POST',{},403);
  await api('/auth/senha','POST',{current:temp,password:staffpass});
 }
 for(const [id,api] of [['ana',u],['bia',v]]){
  await api('/auth/cadastro','POST',{name:id,email:id+'@example.test',password:pass},201);await login(api,id+'@example.test');
 }
 await guest('/auth/cadastro','POST',{},403,'http://other.example.test');
 const loss={id:'P-1',institutionId:'horizonte',category:'Guarda-chuvas',startDate:'2026-11-10',endDate:'2026-11-12',location:'Biblioteca',description:'Meu guarda-chuva'};
 await u('/minhas-perdas','POST',{...loss,endDate:'2026-11-09'},400);
 await u('/minhas-perdas','POST',loss);assert.equal((await u('/visao')).notices.length,0);
 await v('/minhas-perdas/P-1','PATCH',{active:false},404);
 const item={id:'A-1',category:loss.category,summary:'Guarda-chuva',foundDate:'2026-11-19',location:'Biblioteca',description:'Guarda-chuva dobrável',evidence:'Fita amarela no cabo',storage:'Armário restrito'};
 await a('/institucional/achados','POST',item);
 await a('/institucional/achados','POST',{...item,id:'A-2',foundDate:'2026-11-20'});
 await a('/institucional/achados','POST',{...item,edit:true});
 assert.equal((await u('/visao')).notices.length,1);
 const pub=await guest('/instituicoes/horizonte/achados?from=2026-11-19&to=2026-11-19&status=available');
 assert.equal(pub.length,1);assert(!('evidence' in pub[0]));
 const clean=async api=>{const r=JSON.stringify(await api('/visao'));assert(!r.includes(item.evidence));assert(!r.includes(item.storage));};
 for(const api of [guest,u,v,b,admin])await clean(api);
 await b('/institucional/achados','POST',{...item,edit:true},404);
 const claim=(api,id,extra={})=>api('/minhas-solicitacoes','POST',{id,itemId:'A-1',description:'Fita amarela',...extra});
 await claim(u,'S-1',{lossId:'P-1'});await claim(v,'S-2');
 const decision=(api,id,action,extra={},status=200)=>api('/institucional/solicitacoes/'+id,'POST',{action,...extra},status);
 await decision(b,'S-1','approve',{},404);
 assert.equal((await u('/achados/A-1')).description,item.description);
 await guest('/achados/A-1','GET',undefined,401);
 const results=await Promise.all([decision(a,'S-1','approve',{},null),decision(a,'S-2','approve',{},null)]);
 assert.deepEqual([...results].sort(),[200,409]);
 const approved=results[0]===200?'S-1':'S-2';
 await decision(a,approved,'cancel',{response:'Remarcar atendimento'});
 if(approved==='S-1')await claim(u,'S-3',{lossId:'P-1'});
 const last=approved==='S-1'?'S-3':'S-1';
 await decision(a,last,'approve');await decision(a,last,'complete',{},409);await decision(a,last,'complete',{confirmed:true});
 await decision(a,last,'complete',{confirmed:true},409);
 await stop();await pg.stop();await pg.start();await start();
 const s=await u('/visao');assert.equal(s.claims.find(c=>c.id===last).status,'completed');assert.equal(s.items.find(i=>i.id==='A-1').status,'returned');assert(!s.losses[0].active);assert(s.history.some(h=>h.label.includes('Entrega física')));
 await admin('/admin/funcionarios/'+staffIds.b,'PATCH',{enabled:false});
 await b('/institucional/achados','POST',item,401);
 await a('/institucional/achados','POST',{...item,id:'A-3',foundDate:'2026-11-18'});
 assert.equal((await u('/visao')).notices.length,1);
 await u('/minhas-perdas/P-1','PATCH',{active:true});
 assert.equal((await u('/visao')).notices.length,2);
 await v('/minhas-solicitacoes','POST',{id:'S-4',itemId:'A-3',description:'Outro guarda-chuva'});
 await decision(a,'S-4','reject',{response:'A descrição não coincide.'});
 assert.equal((await v('/visao')).claims.find(c=>c.id==='S-4').status,'rejected');
 await v('/auth/logout','POST');
 await v('/minhas-perdas','POST',loss,401);
 if(process.env.ACHEI_BROWSER_TEST)execFileSync(process.env.CODEX_PRIMARY_RUNTIME_PYTHON||'python3',['tests/browser.py'],{env,stdio:'inherit'});
 console.log('Integração PostgreSQL: autenticação, privacidade, concorrência, matching, devolução e reinício aprovados.');
}finally{await stop();await pg.stop().catch(()=>{});await rm(dir,{recursive:true,force:true});}
