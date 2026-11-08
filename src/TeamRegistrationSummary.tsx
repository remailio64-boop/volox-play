import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { inviteShareText } from './lib/inviteSharing';

type Summary={team_name:string;tournament_name:string;category_name:string;status:string;payment_status:string;members:{name:string;status:string;is_me:boolean}[]};
export function TeamRegistrationSummary({registrationId,userId,onRefresh}:{registrationId:string;userId?:string;onRefresh?:()=>void}){
 const [data,setData]=useState<Summary|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;setData(null);setError('');setLoading(true);
  if(!userId){setLoading(false);return}
  supabase.rpc('get_team_registration_summary',{p_registration_id:registrationId}).then(({data,error})=>{
   if(!active)return;if(error)setError('Não foi possível carregar a equipe.');else setData(data);setLoading(false);
  });return()=>{active=false};
 },[registrationId,userId,attempt]);
 if(!userId)return <section className="card"><h2>Integrantes da equipe</h2><p>Entre na conta de um integrante ou do responsável para consultar as confirmações.</p><Link className="button" to="/login?perfil=atleta">Entrar na minha conta</Link></section>;
 const pending=data?.members.filter(m=>m.status==='pending'&&!m.is_me).length||0;
 const confirmed=data?.members.filter(m=>m.status==='confirmed').length||0;
 const share=data?`https://wa.me/?text=${encodeURIComponent(inviteShareText(window.location.origin,data.team_name,data.tournament_name))}`:'';
 return <section className="card"><h2>Resumo da equipe</h2>{loading?<p role="status">Consultando integrantes...</p>:error?<p role="alert">{error}</p>:!data?<p>Os integrantes ficam disponíveis apenas para atletas vinculados à inscrição e para a organização.</p>:<><p><strong>{data.category_name}</strong>{data.members.length>0&&<> · {confirmed} de {data.members.length} {data.members.length===1?'atleta confirmado':'atletas confirmados'}</>}</p>{data.status==='rejected'&&<p className="notice">Esta inscrição foi rejeitada. Os convites não estão mais disponíveis.</p>}{!data.members.length?<p>Esta inscrição antiga foi feita sem perfis vinculados. Consulte os integrantes com a organização.</p>:<ul className="team-member-summary">{data.members.map((m,i)=><li key={i}><strong>{m.name}{m.is_me?' (você)':''}</strong><span className={`member-status member-${m.status}`}>{m.status==='confirmed'?'Confirmou':m.status==='declined'?'Recusou':data.status==='rejected'?'Convite encerrado':'Falta confirmar'}</span></li>)}</ul>}
 <p>Pagamento da inscrição: <strong>{data.payment_status==='not_required'?'Não exigido':data.payment_status==='paid'?'Confirmado pela organização':'Aguardando confirmação da organização'}</strong>.</p>
 {pending>0&&data.status!=='rejected'&&<div className="invite-share"><h3>Avise seus parceiros</h3><p>{pending} {pending===1?'pessoa ainda precisa':'pessoas ainda precisam'} confirmar. O convite está em <strong>Atleta → Convites e participações</strong>.</p><a className="button" href={share} target="_blank" rel="noopener noreferrer">Avisar parceiros pelo WhatsApp</a><p className="muted">Abre uma mensagem pronta. Você escolhe os destinatários e envia. O link leva à conta de atleta e não compartilha o link privado desta inscrição.</p></div>}
 {data.members.some(m=>m.is_me&&m.status==='pending')&&data.status!=='rejected'&&<p><Link className="button" to="/atleta">Conferir e responder meu convite</Link></p>}
 </>}<button type="button" className="text-button" disabled={loading} onClick={()=>{setAttempt(n=>n+1);onRefresh?.()}}>Atualizar confirmações</button></section>;
}
