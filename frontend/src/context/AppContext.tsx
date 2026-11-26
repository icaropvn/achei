import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import type {Command,State} from '../types';
export async function api<T=unknown>(path:string,method='GET',data?:unknown):Promise<T>{
 const res=await fetch('/api'+path,{method,headers:data===undefined?undefined:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 const obj=await res.json();
 if(!res.ok)throw Object.assign(new Error(obj.message||'Não foi possível concluir.'),{status:res.status});
 return obj as T;
}
type Store={state:State;run:(command:Command,success?:string)=>Promise<boolean>;toast:{text:string;error:boolean}|null;clearToast:()=>void;refresh:()=>Promise<void>;busy:boolean};
const Context=createContext<Store|null>(null);
export function AppProvider({children}:{children:ReactNode}){
 const [state,setState]=useState<State|null>(null),[toast,setToast]=useState<Store['toast']>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const lock=useRef(false),seq=useRef(0);
 async function refresh(){const n=++seq.current;const result=await api<State>('/visao');if(n===seq.current)setState(result);}
 useEffect(()=>{void refresh().catch(()=>setFailed(true));const refocus=()=>{if(!lock.current)void refresh().catch(()=>{});};window.addEventListener('focus',refocus);const timer=window.setInterval(()=>{if(!document.hidden)refocus();},15000);return()=>{clearInterval(timer);window.removeEventListener('focus',refocus);};},[]);
 async function run(c:Command,success?:string){
  if(lock.current||!state)return false;lock.current=true;setBusy(true);
  try{
   switch(c.type){
    case 'saveItem':await api('/institucional/achados','POST',{...c.item,edit:state.items.some(i=>i.id===c.item.id)});break;
    case 'saveLoss':await api('/minhas-perdas','POST',{...c.loss,edit:state.losses.some(l=>l.id===c.loss.id)});break;
    case 'toggleLoss':await api('/minhas-perdas/'+c.id,'PATCH',{active:!state.losses.find(x=>x.id===c.id)?.active});break;
    case 'readNotice':await api('/meus-avisos/'+c.id,'PATCH');break;
    case 'claim':await api('/minhas-solicitacoes','POST',c.claim);break;
    case 'decision':await api('/institucional/solicitacoes/'+c.id,'POST',{action:c.decision,response:c.response,confirmed:c.confirmed});break;
    default:return false;
   }
   await refresh();setToast(success?{text:success,error:false}:null);return true;
  }catch(e){await refresh().catch(()=>{});setToast({text:e instanceof Error?e.message:'Não foi possível concluir.',error:true});return false;}
  finally{lock.current=false;setBusy(false);}
 }
 if(!state)return <main className="site-shell"><p role="status">{failed?'Não foi possível conectar ao Achei!.':'Carregando Achei!…'}</p>{failed&&<button className="btn" onClick={()=>location.reload()}>Tentar novamente</button>}</main>;
 return <Context.Provider value={{state,run,toast,clearToast:()=>setToast(null),refresh,busy}}>{children}</Context.Provider>;
}
export function useApp(){const c=useContext(Context);if(!c)throw Error('Provider ausente');return c;}
export function useProfile(){const {state}=useApp();return state.profiles.find(p=>p.id===state.profileId);}
export const now=()=>new Date().toISOString();
export const newId=(prefix:string)=>prefix+'-'+Array.from(crypto.getRandomValues(new Uint8Array(10)),x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
