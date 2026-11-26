import type { FoundItem, Loss, State, Command } from '../types';
import { createInitialState } from '../data/initial';
export const itemLabels = { available: 'Disponível', returning: 'Em devolução', returned: 'Devolvido' };
export const claimLabels = { pending: 'Em análise', approved: 'Aguardando retirada', rejected: 'Não confirmada', cancelled: 'Cancelada', completed: 'Concluída' };
export function dateLabel(value: string) { return value ? value.slice(0, 10).split('-').reverse().join('/') : '—'; }
export function dateTime(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
export function normalize(s: string) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
export function validDate(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10) === s; }
export function addDays(s: string, days: number) { const d = new Date(s+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export function matches(loss: Loss, item: FoundItem) { return item.status === 'available' && loss.institutionId === item.institutionId && loss.category === item.category && validDate(loss.startDate) && validDate(loss.endDate) && item.foundDate >= loss.startDate && item.foundDate <= addDays(loss.endDate, 7); }
export function candidates(loss: Loss, items: FoundItem[]) { return items.filter(i=>matches(loss,i)).sort((a,b)=>Number(!!normalize(loss.location) && normalize(loss.location)===normalize(b.location))-Number(!!normalize(loss.location) && normalize(loss.location)===normalize(a.location)) || b.foundDate.localeCompare(a.foundDate)); }
function ensure(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function notify(s: State, now: string) {
 for (const l of s.losses.filter(l=>l.active)) for (const i of candidates(l,s.items)) {
  const id = `match:${l.id}:${i.id}`;
  if (!s.notices.some(n=>n.lossId===l.id && n.itemId===i.id)) s.notices.unshift({ id, userId:l.userId, lossId:l.id, itemId:i.id, read:false, createdAt:now });
 }
}
export function reducer(state: State, command: Command): State {
 if (command.type==='reset') return createInitialState();
 const s: State = structuredClone(state);
 const profile=s.profiles.find(p=>p.id===s.profileId);
 const staffFor=(institutionId: string)=>ensure(profile?.role==='staff' && profile.institutionId===institutionId,'Este perfil não pode operar os registros desta instituição.');
 const user=()=>ensure(profile?.role==='user','Selecione um perfil de usuário para continuar.');
 const history=(itemId:string,label:string,at:string,claimId?:string)=>s.history.unshift({id:`event:${s.history.length}:${at}`,itemId,claimId,label,actor:profile?.name||'Visitante',at});
 switch(command.type){
  case 'profile': ensure(command.profileId===null||s.profiles.some(p=>p.id===command.profileId),'Perfil inexistente.');s.profileId=command.profileId;break;
  case 'saveItem': {
   staffFor(command.item.institutionId);
   const i=command.item;
   ensure([i.summary,i.location,i.description,i.evidence,i.storage].every(v=>v.trim()),'Preencha todos os campos do objeto.');
   ensure(validDate(i.foundDate),'Informe uma data de encontro válida.');
   const old=s.items.find(o=>o.id===i.id);if(old)staffFor(old.institutionId);
   ensure(!old||old.institutionId===i.institutionId,'Não é possível mudar a instituição do objeto.');
   const next={...i,status:old?.status||'available'} as FoundItem;
   if(old)s.items=s.items.map(o=>o.id===i.id?next:o);else s.items.unshift(next);
   history(i.id,old?'Dados do objeto atualizados.':'Objeto cadastrado como disponível.',command.now);notify(s,command.now);break;
  }
  case 'saveLoss': {
   user(); const l=command.loss;ensure(l.userId===profile!.id,'Esta perda pertence a outro perfil.');
   const old=s.losses.find(o=>o.id===l.id);ensure(!old||old.userId===profile!.id,'Esta perda pertence a outro perfil.');
   ensure(s.institutions.some(i=>i.id===l.institutionId),'Selecione uma instituição válida.');
   ensure(validDate(l.startDate)&&validDate(l.endDate)&&l.startDate<=l.endDate,'Informe um período válido: a data final não pode anteceder a inicial.');
   if(old)s.losses=s.losses.map(o=>o.id===l.id?l:o);else s.losses.unshift(l);
   notify(s,command.now);break;
  }
  case 'toggleLoss': {user();const l=s.losses.find(l=>l.id===command.id);ensure(l?.userId===profile!.id,'Busca não encontrada para este perfil.');l.active=!l.active;notify(s,command.now);break;}
  case 'readNotice': {user();const n=s.notices.find(n=>n.id===command.id);ensure(n?.userId===profile!.id,'Aviso não encontrado.');n.read=true;break;}
  case 'claim': {
   user(); const cl=command.claim;const i=s.items.find(i=>i.id===cl.itemId);
   ensure(i?.status==='available','Este objeto não está disponível para novas solicitações.');
   ensure(cl.userId===profile!.id,'O solicitante deve ser o usuário selecionado.');
   ensure(cl.description.trim(),'Descreva uma característica do objeto antes de enviar.');
   ensure(!s.claims.some(c=>c.itemId===i.id&&c.userId===profile!.id&&['pending','approved'].includes(c.status)),'Você já tem uma solicitação ativa para este objeto.');
   if(cl.lossId){const l=s.losses.find(l=>l.id===cl.lossId);ensure(l?.userId===profile!.id&&matches(l,i),'A busca vinculada não corresponde a este objeto.');}
   ensure(!s.claims.some(c=>c.id===cl.id),'Identificador de solicitação já utilizado.');
   s.claims.unshift({...cl,status:'pending',response:'',createdAt:command.now,updatedAt:command.now});history(i.id,'Solicitação enviada para análise.',command.now,cl.id);break;
  }
  case 'decision': {
   const cl=s.claims.find(c=>c.id===command.id);ensure(cl,'Solicitação não encontrada.');
   const i=s.items.find(i=>i.id===cl.itemId);ensure(i,'Objeto não encontrado.');staffFor(i.institutionId);
   const response=command.response.trim();
   if(command.decision==='respond'){ensure(cl.status==='pending'||cl.status==='approved','Esta solicitação já foi encerrada.');ensure(response,'Escreva a resposta para o solicitante.');cl.response=response;history(i.id,'Resposta institucional enviada.',command.now,cl.id);}
   if(command.decision==='approve'){
    ensure(cl.status==='pending'&&i.status==='available','O objeto não está disponível ou a solicitação não está em análise.');
    ensure(!s.claims.some(c=>c.itemId===i.id&&c.status==='approved'),'Já existe uma devolução em andamento para este objeto.');
    cl.status='approved';cl.response=response||'Propriedade conferida. Compareça à recepção no horário de atendimento.';i.status='returning';history(i.id,'Propriedade validada. Aguardando retirada.',command.now,cl.id);
   }
   if(command.decision==='reject'){ensure(cl.status==='pending','Somente solicitações em análise podem ser recusadas.');ensure(response,'Informe o motivo da não confirmação.');cl.status='rejected';cl.response=response;history(i.id,'Propriedade não confirmada: '+response,command.now,cl.id);}
   if(command.decision==='cancel'){ensure(cl.status==='approved'&&i.status==='returning','Não há devolução aprovada para cancelar.');ensure(response,'Informe o motivo do cancelamento.');cl.status='cancelled';cl.response=response;i.status='available';history(i.id,'Devolução cancelada: '+response,command.now,cl.id);notify(s,command.now);}
   if(command.decision==='complete'){
    ensure(cl.status==='approved'&&i.status==='returning','A entrega exige uma devolução aprovada.');cl.status='completed';cl.response=response||'Entrega realizada e registrada pela instituição.';i.status='returned';
    if(cl.lossId){const l=s.losses.find(l=>l.id===cl.lossId);if(l)l.active=false;}
    for(const other of s.claims.filter(c=>c.id!==cl.id&&c.itemId===i.id&&c.status==='pending')){other.status='cancelled';other.response='Solicitação encerrada: objeto devolvido após validação de outra solicitação.';other.updatedAt=command.now;history(i.id,'Outra solicitação encerrada por indisponibilidade.',command.now,other.id);}
    history(i.id,'Entrega registrada. Objeto devolvido.',command.now,cl.id);
   }
   cl.updatedAt=command.now;break;
  }
 }
 return s;
}
