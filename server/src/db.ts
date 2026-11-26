import pg from 'pg';
import type { PoolClient } from 'pg';
pg.types.setTypeParser(1082,v=>v);
export const db=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000,max:5});
db.on('error', (error: Error & {code?:string}) => console.error('Conexão ociosa encerrada:', error.code ?? error.name));
export async function tx<T>(fn:(c:PoolClient)=>Promise<T>,pool=db){
 const c=await pool.connect();
 try{await c.query('begin');const result=await fn(c);await c.query('commit');return result;}
 catch(e){await c.query('rollback');throw e;} finally{c.release();}
}
