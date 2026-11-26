import {randomBytes,randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import argon2 from 'argon2';
import {db,tx} from './db.js';
import {migrate} from './migrate.js';
async function main(){
 const [cmd,emailArg,nameArg]=process.argv.slice(2);
 if(cmd==='migrate') return migrate();
 if(cmd==='demo'){
  await db.query(`insert into institutions values
   ('horizonte','Instituto Horizonte','Unidade Central','Ribeirão Preto / SP','IH','Atendimento institucional.','Recepção · Segunda a sexta, 8h às 18h.'),
   ('movimento','Centro Movimento','Unidade Jardim','Ribeirão Preto / SP','CM','Achados e perdidos da recepção.','Recepção · Segunda a sábado, 7h às 20h.')
   on conflict do nothing`);
  if(emailArg==='--contas'){
   for(const [name,email,role,institution] of [
    ['Ana Silva','ana@achei.example','user',null],['Bia Costa','bia@achei.example','user',null],
    ['Paula Lima','paula@achei.example','staff','horizonte'],['Rui Dias','rui@achei.example','staff','movimento']
   ] as const){
    const pass=randomBytes(18).toString('base64url');
    const result=await db.query('insert into accounts(id,name,email,password,role,institution_id,must_change) values($1,$2,$3,$4,$5,$6,$7) on conflict(email) do nothing',[randomUUID(),name,email,await argon2.hash(pass),role,institution,role==='staff']);
    console.log(result.rowCount?`${email} · senha inicial: ${pass}`:`${email} · conta já existente; senha preservada`);
   }
  }else console.log('Instituições fictícias prontas. Crie funcionários no painel administrativo ou use demo --contas.');
  return;
 }
 if(!['admin','reset-password'].includes(cmd)||!emailArg?.includes('@'))throw Error('Use: manage migrate | demo | admin EMAIL [NOME] | reset-password EMAIL');
 const rl=createInterface({input:process.stdin,output:process.stdout,terminal:false});
 console.log('Digite uma senha com pelo menos 12 caracteres (entrada visível):');
 let password='';for await(const line of rl){password=line;break;}rl.close();
 if(password.length<12||password.length>128)throw Error('Senha inválida.');
 const hash=await argon2.hash(password);const email=emailArg.trim().toLowerCase();
 await tx(async c=>{
  if(cmd==='admin')await c.query("insert into accounts(id,name,email,password,role) values($1,$2,$3,$4,'admin')",[randomUUID(),nameArg||'Administrador',email,hash]);
  else{
   const r=await c.query('update accounts set password=$1,must_change=true where email=$2 returning id',[hash,email]);if(!r.rowCount)throw Error('Conta não encontrada.');
   await c.query('delete from sessions where account_id=$1',[r.rows[0].id]);
  }
 });
 console.log('Conta configurada.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.end());
