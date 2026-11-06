import type { Tournament } from '../types';
export const FAVORITES_KEY='volox-favorite-tournaments';
const REGISTRATIONS_KEY='volox-my-registrations';
export type SavedRegistration={id:string;tournament:string;category?:string;savedAt:string};
export function readFavorites():string[]{
 try{const data=JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]');return Array.isArray(data)?data.filter((id:unknown)=>typeof id==='string'&&id.length<=100):[]}catch{return []}
}
export function writeFavorites(ids:string[]){localStorage.setItem(FAVORITES_KEY,JSON.stringify([...new Set(ids)]));window.dispatchEvent(new Event('volox-favorites'))}
export function readRegistrations():SavedRegistration[]{
 try{const data=JSON.parse(localStorage.getItem(REGISTRATIONS_KEY)||'[]');return Array.isArray(data)?data.filter((r:SavedRegistration)=>typeof r?.id==='string'&&/^[0-9a-f-]{36}$/i.test(r.id)&&typeof r.tournament==='string').slice(0,30):[]}catch{return []}
}
export function rememberRegistration(record:Omit<SavedRegistration,'savedAt'>):boolean{
 try{const previous=readRegistrations();const found=previous.find(r=>r.id===record.id);localStorage.setItem(REGISTRATIONS_KEY,JSON.stringify([{...found,...record,savedAt:new Date().toISOString()},...previous.filter(r=>r.id!==record.id)].slice(0,30)));return true}catch{return false}
}
export function brazilDate(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 return ['year','month','day'].map(key=>parts.find(p=>p.type===key)!.value).join('-');
}
export function eventState(t:Pick<Tournament,'event_start_date'|'event_end_date'|'registration_deadline'> & {status?:string},today=brazilDate()){
 const ended=!!t.event_end_date&&today>t.event_end_date;
 const running=!ended&&!!t.event_start_date&&today>=t.event_start_date;
 const accepting=(!t.status||t.status==='open')&&!ended&&(!t.registration_deadline||today<=t.registration_deadline);
 return {phase:ended?'ended':running?'running':'upcoming',accepting,label:ended?'Finalizado':running?'Em andamento':accepting?'Inscrições abertas':'Inscrições encerradas'};
}
export function formatDate(date?:string|null){return date?new Date(`${date}T12:00:00-03:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Sao_Paulo'}):'A confirmar'}
export function eventDates(t:Pick<Tournament,'event_start_date'|'event_end_date'>){return t.event_start_date?`${formatDate(t.event_start_date)}${t.event_end_date&&t.event_end_date!==t.event_start_date?` a ${formatDate(t.event_end_date)}`:''}`:'Data a confirmar'}
export function eventPlace(t:Pick<Tournament,'venue_name'|'city'|'state_code'>){return [t.venue_name,[t.city,t.state_code].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')||'Local a confirmar'}
