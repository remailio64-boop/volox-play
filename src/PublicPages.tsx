import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Trophy, Heart, Ticket, BookOpen, ChevronRight, Search, MapPin, CalendarDays, SlidersHorizontal, ArrowUpRight, X, Volleyball } from "lucide-react";
import { isBeachTennis, scoringDescription } from "./lib/scoring";
import { supabase } from "./lib/supabase";
import { modalities, teamSizes, type Modality, type Tournament } from "./types";
import { eventState, eventDates, eventPlace, readFavorites, writeFavorites, readRegistrations, type SavedRegistration } from "./lib/athlete";

const money=(cents:number)=>(cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const searchable=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
type OpenCategory={id:string;name:string;modality:Modality;fee_cents:number;status:string;capacity:number};
type OpenTournament=Pick<Tournament,"id"|"name"|"slug"|"modality"|"category"|"fee_cents"|"status"|"event_start_date"|"event_end_date"|"registration_deadline"|"city"|"state_code"|"venue_name"|"description">&{tournament_categories:OpenCategory[]};

function publicState(t:OpenTournament){
 const state=eventState(t);const accepting=state.accepting&&(!t.tournament_categories?.length||t.tournament_categories.some(c=>c.status==="open"));
 return {...state,accepting,label:state.phase==="upcoming"&&!accepting?"Inscrições encerradas":state.label};
}

export function PageMetadata(){
 const {pathname}=useLocation();
 useEffect(()=>{
  const title=pathname==="/regras"?"Regras da competição | Volox Play":pathname==="/favoritos"?"Meus favoritos | Volox Play":pathname==="/minhas-inscricoes"?"Minhas inscrições | Volox Play":pathname==="/campeonatos"?"Torneios e inscrições | Volox Play":"Volox Play | Torneios de vôlei e Beach Tennis";
  const description=pathname==="/regras"?"Consulte as regras de inscrição, formatos de disputa e critérios de desempate dos campeonatos no Volox Play.":"Encontre torneios de vôlei e Beach Tennis no Volox Play. Escolha sua categoria, consulte o regulamento e inscreva sua equipe.";
  document.title=title;
  document.querySelector('meta[name="description"]')?.setAttribute("content",description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content",title);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content",description);
  const privatePage=["/login","/painel","/minhas-inscricoes","/favoritos"].includes(pathname)||pathname.startsWith("/inscricao/");
  document.querySelector('meta[name="robots"]')?.setAttribute("content",privatePage?"noindex, nofollow":"index, follow");
  const canonical=`https://volox-play.vercel.app${pathname==="/"?"/":pathname}`;
  document.querySelector('link[rel="canonical"]')?.setAttribute("href",canonical);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content",canonical);
 },[pathname]);
 return null;
}

const appLinks=[{to:"/campeonatos",label:"Torneios",icon:Trophy},{to:"/favoritos",label:"Favoritos",icon:Heart},{to:"/minhas-inscricoes",label:"Minhas inscrições",icon:Ticket},{to:"/regras",label:"Regulamentos",icon:BookOpen}];
export function AppScaffold({children}:{children:ReactNode}){
 const {pathname}=useLocation();
 return <div className="app-layout"><aside className="app-sidebar"><div className="sidebar-label">VAMOS JOGAR?</div><nav aria-label="Navegação do aplicativo">{appLinks.map(({to,label,icon:Icon})=><NavLink key={to} to={to} className={({isActive})=>`sidebar-link ${isActive||(to==="/campeonatos"&&pathname==="/")?"selected":""}`}><Icon size={19}/>{label}</NavLink>)}</nav><div className="sidebar-organize"><Volleyball size={30}/><strong>Sua arena. Seu torneio.</strong><p>Organize categorias, inscrições, chaves e resultados.</p><Link to="/login">Área do organizador <ArrowUpRight size={15}/></Link></div><p className="sidebar-caption">VOLOX PLAY<br/>O jogo começa aqui.</p></aside><main className="app-content">{children}</main><nav className="mobile-app-nav" aria-label="Navegação no celular">{appLinks.map(({to,label,icon:Icon})=><NavLink key={to} to={to} className={({isActive})=>isActive||(to==="/campeonatos"&&pathname==="/")?"selected":""}><Icon size={21}/><span>{label==="Minhas inscrições"?"Inscrições":label==="Regulamentos"?"Regras":label}</span></NavLink>)}</nav></div>;
}

export function PublicHome({favoritesOnly=false}:{favoritesOnly?:boolean}){
 const [tournaments,setTournaments]=useState<OpenTournament[]>([]);
 const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const [query,setQuery]=useState("");const [modality,setModality]=useState("");const [city,setCity]=useState("");const [status,setStatus]=useState("all");const [attempt,setAttempt]=useState(0);
 const [favorites,setFavorites]=useState(readFavorites);const [storageError,setStorageError]=useState("");const [showFilters,setShowFilters]=useState(false);
 useEffect(()=>{const update=()=>setFavorites(readFavorites());window.addEventListener("storage",update);window.addEventListener("volox-favorites",update);return()=>{window.removeEventListener("storage",update);window.removeEventListener("volox-favorites",update)}},[]);
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError("");
  supabase.from("tournaments").select("id,name,slug,modality,category,fee_cents,status,event_start_date,event_end_date,registration_deadline,city,state_code,venue_name,description,tournament_categories(id,name,modality,fee_cents,status,capacity)")
   .eq("status","open").order("created_at",{ascending:false}).then(({data,error})=>{
    if(cancelled)return;
    if(error)setError("Não foi possível carregar os torneios. Tente novamente.");
    else setTournaments((data||[]) as OpenTournament[]);
    setLoading(false);
   });
  return()=>{cancelled=true};
 },[attempt]);
 function favorite(id:string){try{writeFavorites(favorites.includes(id)?favorites.filter(item=>item!==id):[...favorites,id]);setStorageError("")}catch{setStorageError("Não foi possível salvar os favoritos neste navegador.")}}
 const cities=[...new Set(tournaments.map(t=>t.city).filter((city):city is string=>!!city))].sort();
 const visible=tournaments.filter(t=>{
  const cats=(t.tournament_categories||[]);const state=publicState(t);
  if(favoritesOnly&&!favorites.includes(t.id))return false;
  const matchesModality=!modality||(cats.length?cats.some(c=>c.modality===modality):t.modality===modality);
  const matchesStatus=status==="all"||status==="open"&&state.accepting||status===state.phase;
  return matchesModality&&matchesStatus&&(!city||t.city===city)&&searchable([t.name,t.category,t.city,t.venue_name,...cats.map(c=>c.name)].join(" ")).includes(searchable(query.trim()));
 });
 const openCount=tournaments.filter(t=>publicState(t).accepting).length;
 function clear(){setQuery("");setModality("");setCity("");setStatus("all")}
 return <AppScaffold>
  <section className="explore-heading"><div><div className="app-eyebrow"><span/> {favoritesOnly?"SEUS TORNEIOS SALVOS":"ENTRE EM QUADRA"}</div><h1>{favoritesOnly?"Meus favoritos":"Encontre seu próximo torneio."}</h1><p>{favoritesOnly?"As competições que você quer acompanhar, reunidas aqui.":"Escolha a competição, encontre sua categoria e venha jogar."}</p></div><div className="heading-sport"><Volleyball size={68} strokeWidth={1}/></div></section>
  {!favoritesOnly&&<div className="explore-stats"><span><strong>{tournaments.length}</strong> torneio{tournaments.length===1?"":"s"} na plataforma</span><span><span className="live-dot"/><strong>{openCount}</strong> com inscrições abertas</span><span className="stats-note">Vôlei · Beach Tennis · Simples · Duplas</span></div>}
  <section aria-label="Buscar torneios" className="app-search"><div className="search-field"><Search size={20}/><input aria-label="Buscar torneio, categoria ou cidade" type="search" placeholder="Buscar torneio, categoria ou cidade" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" className="icon-button" aria-label="Limpar busca" onClick={()=>setQuery("")}><X size={17}/></button>}</div><button className={`filter-toggle ${showFilters?"active":""}`} onClick={()=>setShowFilters(!showFilters)} aria-expanded={showFilters}><SlidersHorizontal size={18}/> Filtros{(modality||city)&&<span className="filter-count">{Number(!!modality)+Number(!!city)}</span>}</button></section>
  {showFilters&&<div className="app-filters"><label>Modalidade<select value={modality} onChange={e=>setModality(e.target.value)}><option value="">Todas as modalidades</option>{Object.entries(modalities).map(([key,name])=><option value={key} key={key}>{name}</option>)}</select></label><label>Cidade<select value={city} onChange={e=>setCity(e.target.value)}><option value="">Todas as cidades</option>{cities.map(name=><option key={name}>{name}</option>)}</select></label><button className="text-button" onClick={clear}>Limpar filtros</button></div>}
  <div className="competition-toolbar"><div className="status-tabs" role="group" aria-label="Situação dos torneios">{[["all","Todos"],["open","Inscrições abertas"],["running","Em andamento"],["ended","Finalizados"]].map(([value,label])=><button key={value} className={status===value?"active":""} aria-pressed={status===value} onClick={()=>setStatus(value)}>{label}</button>)}</div><span className="result-count">{loading?"Buscando...":`${visible.length} resultado${visible.length===1?"":"s"}`}</span></div>
  {favoritesOnly&&<p className="device-note">Favoritos salvos neste aparelho, sem precisar de conta.</p>}
  {storageError&&<p className="notice" role="alert">{storageError}</p>}
  {loading&&<div className="app-loading" role="status"><span className="loading-ring"/> Carregando torneios...</div>}
  {error&&<div className="card" role="alert"><p>{error}</p><button onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</button></div>}
  {!loading&&!error&&<><div className="event-grid">{visible.map((t,i)=>{
   const cats=(t.tournament_categories||[]);const state=publicState(t);const fees=cats.length?cats.map(c=>c.fee_cents):[t.fee_cents];const min=Math.min(...fees);const max=Math.max(...fees);const saved=favorites.includes(t.id);
   return <article className="event-card" key={t.id}><Link className={`event-art event-art-${i%3}`} to={`/t/${t.slug}`} tabIndex={-1} aria-hidden="true"><div className="art-court"/><Volleyball className="art-ball" size={102} strokeWidth={1}/><span>VOLOX<br/><strong>PLAY</strong></span></Link><button className={`favorite-button ${saved?"saved":""}`} aria-pressed={saved} aria-label={`${saved?"Remover dos":"Adicionar aos"} favoritos: ${t.name}`} onClick={()=>favorite(t.id)}><Heart size={19} fill={saved?"currentColor":"none"}/></button><div className="event-card-body"><span className={`event-status ${state.accepting?"open":""}`}>{state.accepting&&<span className="live-dot"/>}{state.label}</span><h2><Link to={`/t/${t.slug}`}>{t.name}</Link></h2><p className="event-meta"><CalendarDays size={15}/>{eventDates(t)}</p><p className="event-meta"><MapPin size={15}/>{eventPlace(t)}</p><div className="event-categories">{cats.slice(0,3).map(c=><span key={c.id}>{c.name}</span>)}{cats.length>3&&<span>+{cats.length-3}</span>}{!cats.length&&<span>{modalities[t.modality]}</span>}</div><div className="event-card-footer"><div><small>{max===0?"Inscrição":"A partir de"}</small><strong>{max===0?"Gratuita":money(min)}</strong><small>por equipe</small></div><Link className="event-cta" to={`/t/${t.slug}${state.accepting?"?aba=categorias":""}`}>{state.accepting?"Inscreva-se":"Ver torneio"}<ChevronRight size={17}/></Link></div></div></article>;
  })}</div>{!visible.length&&<div className="app-empty"><div className="empty-icon">{favoritesOnly?<Heart size={31}/>:<Trophy size={31}/>}</div><h2>{favoritesOnly&&!query&&!modality&&!city&&status==="all"?"Seus favoritos vão aparecer aqui":query||modality||city||status!=="all"?"Nenhum torneio com esses filtros":"A próxima disputa está chegando."}</h2><p>{favoritesOnly?"Toque no coração de um torneio para salvá-lo e acompanhar depois.":query||modality||city||status!=="all"?"Experimente outra busca ou escolha uma modalidade diferente.":"Assim que as inscrições forem abertas, os torneios estarão disponíveis aqui para você escolher e se inscrever."}</p>{favoritesOnly?<Link className="button" to="/campeonatos">Explorar torneios <ArrowUpRight size={16}/></Link>:(query||modality||city||status!=="all")?<button className="secondary" onClick={clear}>Limpar filtros</button>:<Link className="text-button" to="/login">Sou organizador: criar meu torneio <ArrowUpRight size={16}/></Link>}</div>}</>}
  <section className="how-to-strip"><div><span className="step-dot">1</span><span>Escolha seu torneio</span></div><ChevronRight size={15}/><div><span className="step-dot">2</span><span>Encontre sua categoria</span></div><ChevronRight size={15}/><div><span className="step-dot">3</span><span>Inscreva sua equipe</span></div></section>
 </AppScaffold>;
}

export function MyRegistrations(){
 const [saved]=useState(readRegistrations);const [results,setResults]=useState<Record<string,{team_name?:string;tournament_name?:string;status?:string;payment_status?:string}|null>>({});const [loading,setLoading]=useState(true);
 useEffect(()=>{let cancelled=false;Promise.all(saved.map(async r=>{const {data,error}=await supabase.rpc("get_registration_status",{p_id:r.id});return [r.id,error?null:data] as const})).then(entries=>{if(!cancelled){setResults(Object.fromEntries(entries));setLoading(false)}});return()=>{cancelled=true}},[saved]);
 return <AppScaffold><section className="explore-heading"><div><div className="app-eyebrow"><span/> MEU JOGO</div><h1>Minhas inscrições</h1><p>Consulte a situação das equipes inscritas por este aparelho.</p></div><Ticket className="heading-icon" size={55}/></section><p className="device-note">Ao concluir uma inscrição ou abrir seu link de acompanhamento, ela fica salva neste navegador. As inscrições não são sincronizadas entre aparelhos.</p>{loading&&<p role="status">Consultando inscrições...</p>}{!loading&&!saved.length&&<div className="app-empty"><div className="empty-icon"><Ticket size={32}/></div><h2>Sua próxima competição começa aqui.</h2><p>Encontre um torneio e inscreva sua equipe. Depois, acompanhe tudo nesta área.</p><Link className="button" to="/campeonatos">Explorar torneios <ChevronRight size={17}/></Link></div>}<div className="registration-list">{saved.map((r:SavedRegistration)=>{const data=results[r.id];return <article className="card registration-item" key={r.id}><div><span className="event-status">{data?.status==="approved"?"Inscrição aprovada":data?.status==="rejected"?"Inscrição rejeitada":data?.status==="pending"?"Aguardando aprovação":loading?"Consultando...":"Consulte o acompanhamento"}</span><h2>{data?.tournament_name||r.tournament}</h2>{data?.team_name&&<p>{data.team_name}</p>}{r.category&&<p className="muted">{r.category}</p>}</div><Link className="event-cta" to={`/inscricao/${r.id}`}>Acompanhar <ChevronRight size={17}/></Link></article>})}</div></AppScaffold>;
}
export function CompetitionRules({text="",modality,bestOf,general=false}:{text?:string;modality?:Modality;bestOf?:number|null;general?:boolean}){
 return <section className="competition-rules" aria-labelledby="competition-rules-heading"><h2 id="competition-rules-heading">Regras da competição</h2>
  <h3>Inscrição e participação</h3><p>{modality?`${modalities[modality]}: ${teamSizes[modality]} ${teamSizes[modality]===1?"atleta titular":"atletas titulares"} por equipe. `:"A quantidade de atletas titulares depende da modalidade escolhida. "}A inscrição é feita na página do campeonato, sem conta de atleta. A participação depende da aprovação da organização e, quando houver cobrança, da confirmação do pagamento.</p>
  <h3>Formato e pontuação</h3><p>{isBeachTennis(modality)?"Formato disponível no aplicativo: ":bestOf===3||bestOf===5?`Nesta categoria, os jogos são em melhor de ${bestOf} sets. `:"O organizador define o formato de sets da categoria antes do primeiro placar. "}{scoringDescription(modality)}</p>{general&&<p>{scoringDescription("beach_tennis_duplas")}</p>}
  <h3>Classificação e desempate</h3><ol><li>Maior número de vitórias.</li><li>Maior saldo de sets: sets ganhos menos sets perdidos.</li><li>Maior saldo de {isBeachTennis(modality)?"games: games ganhos menos games perdidos":"pontos: pontos marcados menos pontos sofridos"}.</li><li>Confronto direto entre as equipes que permanecem empatadas.</li></ol>{general&&<p>No Beach Tennis, o saldo de games substitui o saldo de pontos.</p>}<p>Se o empate persistir ou faltarem placares para aplicar os critérios, as semifinais ficam bloqueadas até a organização resolver a classificação. No formato de duas chaves, classificam-se as duas primeiras equipes de cada uma: 1ª A × 2ª B e 1ª B × 2ª A.</p>
  <h3>Regulamento específico do campeonato</h3>{general?<p>Confira as condições publicadas pelo organizador na página do campeonato escolhido, incluindo local, horários, premiação e participação.</p>:text.trim()?<div className="written-rules">{text}</div>:<p className="muted">O organizador ainda não publicou regras complementares. Horários, local, premiação, tolerância de atraso, W.O. e demais condições devem ser confirmados com a organização antes da inscrição.</p>}
 </section>;
}

export function RulesPage(){
 return <AppScaffold><div className="rules-page"><Link className="back-link" to="/campeonatos">← Encontrar campeonatos</Link><span className="eyebrow">Antes de entrar em quadra</span><h1>Regras no Volox Play</h1><p>Estas são as regras de funcionamento disponíveis no aplicativo. Consulte também o regulamento específico na página do campeonato escolhido.</p><div className="card"><CompetitionRules general/></div><Link className="button" to="/campeonatos">Escolher campeonato</Link></div></AppScaffold>;
}


export function RulesEditor({tournament,organizerId,onSaved}:{tournament:Tournament;organizerId:string;onSaved:()=>void}){
 const fields=(t:Tournament)=>({competition_rules:t.competition_rules||"",description:t.description||"",event_start_date:t.event_start_date||"",event_end_date:t.event_end_date||"",registration_deadline:t.registration_deadline||"",venue_name:t.venue_name||"",city:t.city||"",state_code:t.state_code||""});
 const [form,setForm]=useState(()=>fields(tournament));const [busy,setBusy]=useState(false);const [info,setInfo]=useState("");const [error,setError]=useState("");
 useEffect(()=>{setForm(fields(tournament))},[tournament]);
 function update(key:keyof typeof form,value:string){setForm(prev=>({...prev,[key]:value}));setInfo("")}
 async function save(e:FormEvent){
  e.preventDefault();setBusy(true);setInfo("");setError("");
  try{
   if(form.event_start_date&&form.event_end_date&&form.event_end_date<form.event_start_date)throw new Error("O término não pode ser anterior ao início.");
   const payload={...form,competition_rules:form.competition_rules.trim(),description:form.description.trim(),city:form.city.trim(),venue_name:form.venue_name.trim(),state_code:form.state_code.trim().toUpperCase(),event_start_date:form.event_start_date||null,event_end_date:form.event_end_date||null,registration_deadline:form.registration_deadline||null};
   const {data,error}=await supabase.from("tournaments").update(payload).eq("id",tournament.id).eq("organizer_id",organizerId).select("id").single();
   if(error||!data)throw error||new Error("Não foi possível salvar os dados.");
   setInfo("Informações e regulamento salvos. Os dados aparecem na página pública quando o torneio estiver aberto.");onSaved();
  }catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar os dados.")}finally{setBusy(false)}
 }
 return <section className="card"><h3>Informações e regulamento do torneio</h3><p>Preencha os dados que os atletas verão na página da competição.</p><form onSubmit={save}><label>Apresentação do torneio<textarea rows={3} maxLength={2000} value={form.description} onChange={e=>update("description",e.target.value)} placeholder="Conte aos atletas sobre a competição..."/></label><div className="editor-grid"><label>Data de início<input type="date" value={form.event_start_date} onChange={e=>update("event_start_date",e.target.value)}/></label><label>Data de término<input type="date" min={form.event_start_date||undefined} value={form.event_end_date} onChange={e=>update("event_end_date",e.target.value)}/></label><label>Inscrições até<input type="date" value={form.registration_deadline} onChange={e=>update("registration_deadline",e.target.value)}/></label><label>Arena / local<input maxLength={160} value={form.venue_name} onChange={e=>update("venue_name",e.target.value)}/></label><label>Cidade<input maxLength={100} value={form.city} onChange={e=>update("city",e.target.value)}/></label><label>UF<input maxLength={2} pattern="[A-Za-z]{2}|^$" value={form.state_code} onChange={e=>update("state_code",e.target.value.toUpperCase())} placeholder="SP"/></label></div><p className="muted">O prazo encerra às 23h59 da data informada, no horário de Brasília. Após o último dia de jogos, novas inscrições também ficam bloqueadas.</p><label>Regulamento específico<textarea rows={10} maxLength={10000} value={form.competition_rules} onChange={e=>update("competition_rules",e.target.value)} placeholder="Horários, níveis, premiação, tolerância de atraso, W.O., substituições e demais condições..."/></label><p className="muted">O texto será público. Não inclua dados privados de atletas.</p><button disabled={busy}>{busy?"Salvando...":"Salvar informações e regulamento"}</button>{info&&<p role="status">{info}</p>}{error&&<p className="error" role="alert">{error}</p>}</form></section>;
}
