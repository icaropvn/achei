import {useEffect,useState,type FormEvent} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {api,useApp,useProfile} from '../context/AppContext';
import {Field,PageTitle} from '../components/UI';
function useJob(){
 const [busy,setBusy]=useState(false),[message,msg]=useState(''),[failed,fail]=useState(false);
 async function go(e:FormEvent<HTMLFormElement>,fn:(d:Record<string,FormDataEntryValue>)=>Promise<void>){
  e.preventDefault();if(busy)return;
  setBusy(true);msg('');fail(false);try{await fn(Object.fromEntries(new FormData(e.currentTarget)));}
  catch(error){fail(true);msg(error instanceof Error?error.message:'Tente novamente.');}finally{setBusy(false);}
 }
 return {go,busy,msg,notice:message&&<p className={failed?'error-text':'notice'} role={failed?'alert':'status'}>{message}</p>};
}
export function Account({mode}:{mode:'login'|'cadastro'|'senha'}){
 const nav=useNavigate(),[params]=useSearchParams(),{refresh}=useApp(),p=useProfile(),job=useJob();
 const next=params.get('next')||'';const safe=/^\/(?![\/\\])/.test(next)&&!/^\/(entrar|cadastro|conta)([/?#]|$)/.test(next)?next:'';
 if(mode==='senha'&&!p)return <Link className="btn" to="/entrar">Entrar</Link>;
 return <><PageTitle title={mode==='login'?'Entrar':mode==='cadastro'?'Criar conta':'Trocar senha'} description={p?.mustChange&&mode==='senha'?'Escolha uma nova senha antes de continuar.':undefined}/>
 <form className="panel form-panel account-form" onSubmit={e=>void job.go(e,async d=>{
  if(mode==='cadastro')await api('/auth/cadastro','POST',d);
  if(mode==='senha')await api('/auth/senha','POST',d);
  else await api('/auth/login','POST',{email:d.email,password:d.password});
  await refresh();nav(mode==='senha'?'/':safe||'/',{replace:true});
 })}>
 {mode==='cadastro'&&<Field label="Nome"><input name="name" required minLength={2} maxLength={100} autoComplete="name"/></Field>}
 {mode!=='senha'?<Field label="E-mail"><input type="email" name="email" required maxLength={254} autoComplete="username"/></Field>:<Field label="Senha atual"><input type="password" name="current" required autoComplete="current-password"/></Field>}
 <Field label={mode==='senha'?'Nova senha':'Senha'} hint={mode==='login'?undefined:'Use pelo menos 12 caracteres.'}><input type="password" name="password" required minLength={12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'}/></Field>
 {job.notice}<button className="btn" disabled={job.busy}>{job.busy?'Aguarde…':mode==='login'?'Entrar':mode==='cadastro'?'Criar conta':'Salvar senha'}</button>
 {mode==='login'&&<Link className="text-link" to={'/cadastro'+(safe?'?next='+encodeURIComponent(safe):'')}>Ainda não tenho conta</Link>}
 </form></>;
}
type Staff={id:string;name:string;email:string;institutionId:string;enabled:boolean};
export function Admin(){
 const {state,refresh}=useApp(),[people,setPeople]=useState<Staff[]>([]),job=useJob(),[loadError,setLoadError]=useState('');
 const load=async()=>setPeople(await api<Staff[]>('/admin/funcionarios'));
 useEffect(()=>{void load().catch(e=>setLoadError(e.message));},[]);
 const opts=state.institutions.map(i=><option value={i.id} key={i.id}>{i.name}</option>);
 return <><PageTitle title="Administração" description="Cadastre instituições e gerencie o vínculo dos funcionários."/>{job.notice}{loadError&&<p role="alert">{loadError}</p>}
 <div className="comparison-grid"><form className="panel form-panel account-form" onSubmit={e=>{const f=e.currentTarget;void job.go(e,async d=>{await api('/admin/instituicoes','POST',d);await refresh();f.reset();job.msg('Instituição cadastrada.');});}}>
 <h2>Nova instituição</h2>{[['name','Nome'],['unit','Unidade'],['city','Cidade'],['description','Descrição pública'],['hours','Horário de atendimento']].map(([n,label])=><Field key={n} label={label}><input name={n} required={n!=='description'} maxLength={n==='description'?500:n==='hours'?150:100}/></Field>)}<button className="btn" disabled={job.busy}>Cadastrar instituição</button></form>
 <form className="panel form-panel account-form" onSubmit={e=>{const f=e.currentTarget;void job.go(e,async d=>{await api('/admin/funcionarios','POST',d);await load();f.reset();job.msg('Funcionário cadastrado.');});}}>
 <h2>Novo funcionário</h2><Field label="Nome"><input name="name" required minLength={2} maxLength={100}/></Field><Field label="E-mail"><input type="email" name="email" required/></Field><Field label="Instituição"><select name="institutionId" required>{opts}</select></Field><Field label="Senha inicial" hint="A pessoa deverá trocá-la ao entrar."><input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password"/></Field><button className="btn" disabled={job.busy||!opts.length}>Cadastrar funcionário</button></form></div>
 <h2>Funcionários</h2>{people.map(person=><form className="panel form-panel" key={person.id} onSubmit={e=>void job.go(e,async d=>{await api('/admin/funcionarios/'+person.id,'PATCH',d.action==='disable'?{enabled:false}:d);await load();job.msg('Acesso atualizado.');})}><h3>{person.name}</h3><p>{person.email} · {person.enabled?'Ativo':'Desativado'}</p><Field label="Instituição"><select name="institutionId" defaultValue={person.institutionId} disabled={!person.enabled}>{opts}</select></Field>{person.enabled&&<div className="page-actions"><button name="action" value="link" className="btn secondary" disabled={job.busy}>Salvar vínculo</button><button type="button" className="btn danger-outline" disabled={job.busy} onClick={async()=>{if(window.confirm('Desativar o acesso deste funcionário?')){try{await api('/admin/funcionarios/'+person.id,'PATCH',{enabled:false});await load();job.msg('Acesso desativado.');}catch(e){setLoadError(e instanceof Error?e.message:'Tente novamente.');}}}}>Desativar</button></div>}</form>)}
 </>;
}
