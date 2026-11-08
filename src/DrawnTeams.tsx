import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from './lib/supabase';
type DrawnTeam={team_number:number;team_name:string;is_own_team:boolean;members:{name:string;public_code:string|null}[]};
export function DrawnTeamsPanel({categoryId,onCount}:{categoryId:string;onCount?:(count:number)=>void}){
 const [teams,setTeams]=useState<DrawnTeam[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function load(){
  setLoading(true);setError('');
  const {data,error}=await supabase.rpc('get_drawn_teams',{p_category_id:categoryId});
  if(error)setError(error.message);else{setTeams(data||[]);onCount?.((data||[]).length)}setLoading(false);
 }
 useEffect(()=>{void load();const handler=(e:Event)=>{if((e as CustomEvent).detail===categoryId)void load()};window.addEventListener('volox-teams-updated',handler);return()=>window.removeEventListener('volox-teams-updated',handler)},[categoryId]);
 return <section className="drawn-teams-panel"><h3>Equipes sorteadas</h3>{loading?<p role="status">Consultando equipes...</p>:error?<p role="alert" className="error">{error} <button type="button" className="text-button" onClick={()=>void load()}>Tentar novamente</button></p>:!teams.length?<p className="muted">As equipes aparecerão aqui após o sorteio da organização.</p>:<><div className="drawn-teams-grid">{teams.map(t=><article className={`card drawn-team${t.is_own_team?' my-drawn-team':''}`} key={t.team_number}>{t.is_own_team&&<span className="event-status open">Minha equipe</span>}<h4>{t.team_name}</h4><ol>{t.members.map((m,i)=><li key={i}>{m.public_code?<Link to={`/atletas/${m.public_code}`}>{m.name}</Link>:m.name}</li>)}</ol></article>)}</div><p className="muted">Você vê os integrantes da sua equipe quando está conectado. Para o público, os nomes respeitam a opção de exibição de cada perfil.</p></>}</section>;
}
