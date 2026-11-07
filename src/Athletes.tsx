import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { AppScaffold } from './PublicPages';
import { rememberRegistration } from './lib/athlete';
import { modalities, teamSizes, type Modality, type Tournament } from './types';

import { normalizeAthleteCode, athleteReturn } from './lib/athleteAccounts';

export const failure=(e:unknown)=>(e as {message?:string})?.message||'Não foi possível concluir. Tente novamente.';
type Profile={id:string;public_code:string;display_name:string;city:string;is_public:boolean};
type Participation={registration_id:string;tournament_name:string;slug:string|null;category_name:string;modality:Modality;team_name:string;membership_status:string;registration_status:string;points:number|null;placement:number|null};
type Dashboard={profile:Profile|null;participations:Participation[]};
type RankingRow={public_code:string;display_name:string;city:string;modality:Modality;category_key:string;category_name:string;points:number;participations:number;titles:number;position:number};
const placement=(n:number|null)=>n?`${n}º lugar`:'Participação';
export function RankingRules(){return <details className="ranking-rules"><summary>Como funciona a pontuação</summary><p>Campeão: 100 · Vice: 70 · Terceiro: 50 · Quarto: 30 · Demais participantes: 10 pontos por atleta. Cada atleta recebe apenas os pontos da sua colocação.</p><p>Os pontos são acumulados por modalidade e categoria com o mesmo nome. São computados após a confirmação dos vínculos e dos resultados pela organização. Empates em pontos dividem a posição. Correções de placar exigem nova confirmação da organização. O ranking público mostra apenas perfis que autorizaram sua exibição e resultados publicados de torneios visíveis.</p></details>}

export function AthleteAccount({session}:{session:Session|null}){
 const [data,setData]=useState<Dashboard|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 const [name,setName]=useState(''),[city,setCity]=useState(''),[isPublic,setPublic]=useState(false);
 const returnTo=athleteReturn(new URLSearchParams(window.location.search).get('retorno'));
 async function load(){
  setLoading(true);setError('');
  try{const {data,error}=await supabase.rpc('get_athlete_dashboard');if(error)throw error;const result=data as Dashboard;setData(result);setName(result.profile?.display_name||'');setCity(result.profile?.city||'');setPublic(result.profile?.is_public||false)}catch(e){setError(failure(e))}finally{setLoading(false)}
 }
 useEffect(()=>{if(session)void load();else setLoading(false)},[session?.user.id]);
 async function save(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');setInfo('');
  try{const values={display_name:name.trim(),city:city.trim(),is_public:isPublic};
   const request=data?.profile?supabase.from('athlete_profiles').update(values).eq('id',session!.user.id):supabase.from('athlete_profiles').insert(values);
   const {error}=await request.select('id').single();if(error)throw error;await load();setInfo('Perfil salvo. Seu código identifica você em qualquer dupla ou equipe.');
  }catch(e){setError(failure(e))}finally{setBusy(false)}
 }
 async function respond(id:string,accept:boolean){
  setBusy(true);setError('');setInfo('');
  try{const {error}=await supabase.rpc('respond_athlete_invite',{p_registration_id:id,p_accept:accept});if(error)throw error;await load();setInfo(accept?'Participação confirmada. A organização ainda precisa aprovar a inscrição.':'Convite recusado. Informe a organização para corrigir a equipe.')}
  catch(e){setError(failure(e))}finally{setBusy(false)}
 }
 return <AppScaffold><div className="athlete-page"><section className="explore-heading"><div><span className="app-eyebrow">SEU JOGO, SUA HISTÓRIA</span><h1>Minha conta de atleta</h1><p>Participações e pontos salvos na sua conta, em qualquer aparelho.</p></div></section>
 {!session?<div className="card"><h2>Entre para construir seu histórico</h2><p>Crie uma conta ou use o mesmo acesso que já utiliza como organizador. Depois, complete seu perfil de atleta.</p><Link className="button" to="/login?perfil=atleta">Entrar ou criar conta de atleta</Link></div>:<>
 {loading&&<p role="status">Carregando seu perfil...</p>}{error&&<p role="alert" className="error">{error} <button className="text-button" onClick={()=>void load()}>Tentar novamente</button></p>}
 {!loading&&data&&<><section className="card"><h2>{data.profile?'Meu perfil':'Complete seu perfil'}</h2>{data.profile&&<div className="athlete-code"><span>Meu código de atleta</span><strong>{data.profile.public_code}</strong><small>Compartilhe este código com seu parceiro para ele selecionar seu perfil na inscrição.</small></div>}
 <form onSubmit={save}><label>Nome no perfil<input required minLength={2} maxLength={60} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label><label>Cidade (opcional)<input maxLength={100} value={city} onChange={e=>setCity(e.target.value)}/></label><label className="athlete-consent"><input type="checkbox" checked={isPublic} onChange={e=>setPublic(e.target.checked)}/>Autorizo exibir meu nome, cidade, histórico de resultados publicados e pontuação no ranking público.</label><p className="muted">Seu e-mail e telefone não aparecem no ranking. Você pode desativar a exibição pública e manter seu histórico na conta.</p><button disabled={busy}>{busy?'Salvando...':'Salvar perfil de atleta'}</button></form>{info&&<p role="status">{info}</p>}
 {data.profile&&returnTo!=='/atleta'&&<p><Link className="button" to={returnTo}>Voltar para a inscrição</Link></p>}</section>
 {data.profile&&<><section className="athlete-summary"><div><strong>{data.participations.filter(x=>x.membership_status==='confirmed'&&x.registration_status!=='rejected').length}</strong><span>participações vinculadas</span></div><div><strong>{data.participations.reduce((sum,x)=>sum+(x.points||0),0)}</strong><span>pontos no histórico · todas as categorias</span></div></section>
 <h2>Convites e participações</h2>{!data.participations.length&&<div className="card"><p>Seu histórico começa com a primeira inscrição vinculada ao seu código. Inscrições antigas feitas apenas com nomes não são vinculadas automaticamente.</p><Link to="/campeonatos">Encontrar torneios</Link></div>}
 {data.participations.map(p=><article className="card athlete-history" key={p.registration_id}><div><span className="app-eyebrow">{modalities[p.modality]} · {p.category_name}</span><h3>{p.tournament_name}</h3><p>{p.team_name}</p><p>{p.registration_status==='rejected'?'Inscrição rejeitada':p.membership_status==='pending'?'Convite aguardando sua confirmação':p.membership_status==='declined'?'Convite recusado':p.registration_status==='approved'?'Inscrição aprovada':'Aguardando aprovação da organização'}</p>{p.points!==null?<strong>{placement(p.placement)} · {p.points} pontos</strong>:<small>Pontos disponíveis após confirmação dos resultados pela organização.</small>}</div><div>{p.membership_status==='pending'&&p.registration_status!=='rejected'&&<><button disabled={busy} onClick={()=>void respond(p.registration_id,true)}>Confirmar minha participação</button><button className="secondary" disabled={busy} onClick={()=>void respond(p.registration_id,false)}>Recusar convite</button></>}{p.slug&&<p><Link to={`/t/${p.slug}`}>Ver torneio</Link></p>}</div></article>)}<RankingRules/></>}
 </>}
 </>}
 </div></AppScaffold>;
}

export function AthleteTeamEntry({session,tournament,categoryId,categoryName,modality,fee,drawn=false}:{session:Session|null;tournament:Tournament;categoryId:string|null;categoryName:string;modality:Modality;fee:number;drawn?:boolean}){
 const count=drawn?1:teamSizes[modality],navigate=useNavigate();
 const [profile,setProfile]=useState<Profile|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [codes,setCodes]=useState<string[]>(Array(count).fill('')),[verified,setVerified]=useState(''),[names,setNames]=useState<string[]>([]);
 const [team,setTeam]=useState(''),[email,setEmail]=useState(session?.user.email||''),[phone,setPhone]=useState('');
 const returnTo=`/t/${tournament.slug}?aba=inscricao${categoryId?`&categoria=${categoryId}`:''}`;
 useEffect(()=>{let active=true;if(!session){setLoading(false);return}supabase.rpc('get_athlete_dashboard').then(({data,error})=>{if(!active)return;if(error)setError(failure(error));else{const p=(data as Dashboard).profile;setProfile(p);if(p)setCodes([p.public_code,...Array(count-1).fill('')])}setLoading(false)});return()=>{active=false}},[session?.user.id,count]);
 async function verify(){
  setBusy(true);setError('');setVerified('');
  try{const normalized=codes.map(normalizeAthleteCode);if(normalized.some(c=>! /^[a-f0-9]{12}$/.test(c)))throw new Error('Informe os códigos de 12 caracteres de todos os atletas.');if(new Set(normalized).size!==count)throw new Error('Cada atleta deve aparecer uma única vez na equipe.');const results=await Promise.all(normalized.map(async code=>{const {data,error}=await supabase.rpc('lookup_athlete',{p_code:code});if(error)throw error;if(!data)throw new Error(`Atleta não encontrado para o código ${code}.`);return data.display_name as string}));setNames(results);setVerified(normalized.join(','))}catch(e){setNames([]);setError(failure(e))}finally{setBusy(false)}
 }
 async function submit(e:FormEvent){
  e.preventDefault();setError('');if(verified!==codes.map(normalizeAthleteCode).join(',')){setError('Confira os atletas antes de enviar a inscrição.');return}setBusy(true);
  try{const {data,error}=await supabase.rpc('register_athlete_team',{p_tournament_id:tournament.id,p_category_id:categoryId,p_team_name:drawn?profile!.display_name:team.trim(),p_captain_email:email.trim(),p_captain_phone:phone.trim(),p_athlete_codes:codes.map(normalizeAthleteCode)});if(error)throw error;if(!data)throw new Error('Não foi possível registrar a equipe.');rememberRegistration({id:data,tournament:tournament.name,category:categoryName});navigate(`/inscricao/${data}`)}catch(e){setError(failure(e))}finally{setBusy(false)}
 }
 if(!session)return <div className="card"><h3>Entre na sua conta de atleta</h3><p>O perfil mantém suas participações e pontos vinculados a você, mesmo quando troca de parceiro.</p><Link className="button" to={`/login?perfil=atleta&retorno=${encodeURIComponent(returnTo)}`}>Entrar ou criar conta para inscrever</Link></div>;
 if(loading)return <p role="status">Carregando perfil de atleta...</p>;
 if(!profile)return <div className="card"><p>Complete seu perfil de atleta para inscrever a equipe.</p>{error&&<p role="alert" className="error">{error}</p>}<Link className="button" to={`/atleta?retorno=${encodeURIComponent(returnTo)}`}>Criar meu perfil de atleta</Link></div>;
 return <form onSubmit={submit} className="athlete-entry"><h3>{drawn?"Inscreva-se com seu perfil de atleta":"Inscreva sua equipe com os perfis dos atletas"}</h3><p>Você está inscrito como {profile.display_name}. {drawn?"A organização formará as equipes posteriormente. Seu histórico individual ficará salvo; o ranking desta categoria depende da integração dos resultados das equipes sorteadas.":"Seus parceiros devem ter conta e compartilhar seus códigos. Cada parceiro receberá um convite nesta área do aplicativo para confirmar o vínculo."}</p>{fee>0&&<p className="notice">O pagamento é feito diretamente à organização. A inscrição depende da confirmação manual do recebimento e da aprovação da organização.</p>}{tournament.payment_instructions&&<p className="written-description">{tournament.payment_instructions}</p>}
 <fieldset disabled={busy}>{!drawn&&<label>Nome do atleta / dupla / equipe<input required minLength={2} maxLength={100} value={team} onChange={e=>setTeam(e.target.value)}/></label>}<div className="editor-grid"><label>E-mail do responsável<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label><label>WhatsApp do responsável<input required type="tel" minLength={8} maxLength={25} value={phone} onChange={e=>setPhone(e.target.value)}/></label></div><div className="editor-grid">{codes.map((code,i)=><label key={i}>{i===0?'Seu código de atleta':`Código do atleta ${i+1}`}<input required readOnly={i===0} maxLength={12} pattern="[a-fA-F0-9]{12}" value={code} onChange={e=>{setCodes(prev=>prev.map((v,j)=>i===j?e.target.value:v));setVerified('');setNames([])}}/>{names[i]&&<strong className="verified-athlete">{names[i]}</strong>}</label>)}</div><button type="button" className="secondary" onClick={()=>void verify()}>Conferir atletas da equipe</button><p className="muted">Os dados de contato ficam restritos à administração da inscrição. Consulte o regulamento antes de enviar.</p><button disabled={!verified||busy}>{busy?'Aguarde...':'Enviar inscrição com os atletas'}</button></fieldset>{error&&<p role="alert" className="error">{error}</p>}</form>;
}

export function AthleteRankings(){
 const [rows,setRows]=useState<RankingRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[modality,setModality]=useState(''),[category,setCategory]=useState(''),[query,setQuery]=useState('');
 useEffect(()=>{let active=true;supabase.rpc('get_athlete_rankings').then(({data,error})=>{if(!active)return;if(error)setError(failure(error));else setRows(data||[]);setLoading(false)});return()=>{active=false}},[]);
 const options=[...new Map(rows.filter(r=>!modality||r.modality===modality).map(r=>[r.category_key,r.category_name])).entries()];
 const filtered=rows.filter(r=>(!modality||r.modality===modality)&&(!category||r.category_key===category)&&r.display_name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
 const groups=[...new Set(filtered.map(r=>`${r.modality}|${r.category_key}`))];
 return <AppScaffold><section className="explore-heading"><div><span className="app-eyebrow">CADA TORNEIO CONTA</span><h1>Ranking dos atletas</h1><p>Pontos acumulados, histórias em quadra e novas conquistas.</p></div></section><div className="card"><div className="editor-grid"><label>Modalidade do ranking<select value={modality} onChange={e=>{setModality(e.target.value);setCategory('')}}><option value="">Todas as modalidades</option>{Object.entries(modalities).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label>Categoria do ranking<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todas as categorias</option>{options.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label></div><label>Buscar atleta<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nome no perfil"/></label></div>
 {loading&&<p role="status">Carregando ranking...</p>}{error&&<p role="alert" className="error">{error}</p>}{!loading&&!error&&!filtered.length&&<div className="app-empty"><h2>{rows.length?'Nenhum atleta com esses filtros':'O ranking começa na próxima conquista'}</h2><p>Os pontos aparecerão após a confirmação dos resultados pela organização, com os atletas vinculados às suas contas e a exibição pública autorizada.</p><Link className="button" to="/atleta">Acessar minha conta de atleta</Link></div>}
 {groups.map(group=>{const list=filtered.filter(r=>`${r.modality}|${r.category_key}`===group);return <section className="card" key={group}><h2>{modalities[list[0].modality]} · {list[0].category_name}</h2><div className="table-wrap"><table><thead><tr><th>Posição</th><th>Atleta</th><th>Pontos</th><th>Participações</th><th>Títulos</th></tr></thead><tbody>{list.map(r=><tr key={r.public_code}><td>{r.position}º</td><td><Link to={`/atletas/${r.public_code}`}>{r.display_name}</Link>{r.city&&<small className="athlete-city">{r.city}</small>}</td><td><strong>{r.points}</strong></td><td>{r.participations}</td><td>{r.titles}</td></tr>)}</tbody></table></div></section>})}<RankingRules/></AppScaffold>;
}

export function AthletePublicProfile(){
 const {code}=useParams();const [data,setData]=useState<{public_code:string;display_name:string;city:string;history:(Participation&{confirmed_at:string})[]}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;setLoading(true);setData(null);setError('');supabase.rpc('get_athlete_public_profile',{p_code:code}).then(({data,error})=>{if(!active)return;if(error)setError(failure(error));else setData(data);setLoading(false)});return()=>{active=false}},[code]);
 return <AppScaffold><Link to="/ranking">← Ranking dos atletas</Link>{loading?<p role="status">Carregando perfil...</p>:error?<p role="alert">{error}</p>:!data?<div className="app-empty"><h1>Perfil indisponível</h1><p>Este perfil não está disponível para consulta pública.</p></div>:<div className="athlete-page"><section className="explore-heading"><div><span className="app-eyebrow">PERFIL DO ATLETA</span><h1>{data.display_name}</h1><p>{data.city||'VoloxPlay'} · Código {data.public_code}</p></div></section><h2>Histórico de resultados publicados</h2>{!data.history.length&&<p>Este atleta ainda não possui pontuações publicadas.</p>}{data.history.map((h,i)=><article className="card" key={i}><h3><Link to={`/t/${h.slug}`}>{h.tournament_name}</Link></h3><p>{modalities[h.modality]} · {h.category_name} · {h.team_name}</p><strong>{placement(h.placement)} · {h.points} pontos</strong></article>)}<RankingRules/></div>}</AppScaffold>;
}

export function AthleteRankingPublication({categoryId}:{categoryId:string}){
 const [record,setRecord]=useState<{confirmed_at:string;invalidated_at:string|null}|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){setLoading(true);setError('');const {data,error}=await supabase.from('athlete_ranking_publications').select('confirmed_at,invalidated_at').eq('category_id',categoryId).maybeSingle();if(error)setError(failure(error));else setRecord(data);setLoading(false)}
 useEffect(()=>{void load();const handler=(e:Event)=>{if((e as CustomEvent).detail===categoryId)void load()};window.addEventListener("volox-scores-updated",handler);return()=>window.removeEventListener("volox-scores-updated",handler)},[categoryId]);
 async function confirm(){if(!window.confirm('Conferiu todos os resultados e os vínculos dos atletas? Confirmar os pontos desta categoria no ranking?'))return;setBusy(true);setError('');try{const {error}=await supabase.rpc('confirm_athlete_ranking',{p_category_id:categoryId});if(error)throw error;await load()}catch(e){setError(failure(e))}finally{setBusy(false)}}
 return <section className="card"><h3>Ranking individual dos atletas</h3><p>Após finalizar a competição, confirme os pontos. Todos os atletas das equipes sorteadas precisam ter conta e ter confirmado sua participação. Inscrições antigas feitas somente com nomes não recebem pontos automaticamente.</p>{loading?<p>Consultando pontuação...</p>:<p role="status">{record&&!record.invalidated_at?'Pontos confirmados. Para aparecerem no ranking público, publique os resultados e o torneio.':record?'Os placares foram alterados. Confira os resultados e confirme os pontos novamente.':'Pontos ainda não confirmados para esta categoria.'}</p>}<button disabled={busy||loading} onClick={()=>void confirm()}>{busy?'Confirmando...':record&&!record.invalidated_at?'Conferir e reconfirmar pontos':'Confirmar pontos do ranking'}</button>{error&&<p role="alert" className="error">{error}</p>}<RankingRules/></section>;
}

export function AthleteRosterStatus({registrationId}:{registrationId:string}){
 const [rows,setRows]=useState<{slot:number;status:string}[]|null>(null),[error,setError]=useState('');
 async function load(){setError('');const {data,error}=await supabase.from('registration_athletes').select('slot,status').eq('registration_id',registrationId).order('slot');if(error)setError(failure(error));else setRows(data||[])}
 useEffect(()=>{void load()},[registrationId]);
 return <div className="athlete-roster-status">{error?<small role="alert">{error}</small>:rows===null?<small>Consultando vínculos...</small>:!rows.length?<small>Inscrição sem perfis vinculados.</small>:rows.map(r=><small key={r.slot}>Atleta {r.slot}: {r.status==='confirmed'?'confirmado':r.status==='declined'?'convite recusado':'aguardando confirmação'}</small>)}{rows&&rows.length>0&&<button type="button" className="text-button" onClick={()=>void load()}>Atualizar vínculos</button>}</div>;
}
