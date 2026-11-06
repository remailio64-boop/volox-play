import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { modalities, teamSizes, type Modality, type Tournament } from "./types";

const money=(cents:number)=>(cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const searchable=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
type OpenCategory={id:string;name:string;modality:Modality;fee_cents:number;status:string};
type OpenTournament=Pick<Tournament,"id"|"name"|"slug"|"modality"|"category"|"fee_cents">&{tournament_categories:OpenCategory[]};

export function PageMetadata(){
 const {pathname}=useLocation();
 useEffect(()=>{
  const title=pathname==="/regras"?"Regras da competição | Volox Play":pathname==="/campeonatos"?"Campeonatos e inscrições | Volox Play":"Volox Play | Campeonatos de vôlei e beach vôlei";
  const description=pathname==="/regras"?"Consulte as regras de inscrição, formatos de disputa e critérios de desempate dos campeonatos no Volox Play.":"Encontre campeonatos de vôlei e beach vôlei no Volox Play. Consulte categorias, regulamentos e valores e faça sua inscrição online.";
  document.title=title;
  document.querySelector('meta[name="description"]')?.setAttribute("content",description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content",title);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content",description);
  const privatePage=pathname==="/login"||pathname==="/painel"||pathname.startsWith("/inscricao/");
  document.querySelector('meta[name="robots"]')?.setAttribute("content",privatePage?"noindex, nofollow":"index, follow");
  const canonical=`https://volox-play.vercel.app${pathname==="/"?"/":pathname}`;
  document.querySelector('link[rel="canonical"]')?.setAttribute("href",canonical);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content",canonical);
 },[pathname]);
 return null;
}

export function PublicHome(){
 const [tournaments,setTournaments]=useState<OpenTournament[]>([]);
 const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const [query,setQuery]=useState("");const [modality,setModality]=useState("");const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError("");
  supabase.from("tournaments").select("id,name,slug,modality,category,fee_cents,tournament_categories(id,name,modality,fee_cents,status)")
   .eq("status","open").order("created_at",{ascending:false}).then(({data,error})=>{
    if(cancelled)return;
    if(error)setError("Não foi possível carregar os campeonatos. Tente novamente.");
    else setTournaments((data||[]) as OpenTournament[]);
    setLoading(false);
   });
  return()=>{cancelled=true};
 },[attempt]);
 const visible=tournaments.filter(t=>{
  const cats=(t.tournament_categories||[]).filter(c=>c.status==="open");
  if(t.tournament_categories?.length&&!cats.length)return false;
  const matchesModality=!modality||(cats.length?cats.some(c=>c.modality===modality):t.modality===modality);
  return matchesModality&&searchable([t.name,t.category,...cats.map(c=>c.name)].join(" ")).includes(searchable(query.trim()));
 });
 return <>
  <main className="hero public-hero"><span className="eyebrow">Vôlei de quadra • Duplas • Quartetos</span><h1>Seu próximo campeonato começa aqui.</h1><p>Encontre competições no Volox Play, consulte o regulamento e inscreva sua equipe. Tudo em um só lugar.</p><a className="button" href="#campeonatos">Encontrar campeonato</a><Link className="hero-organizer" to="/login">Quero organizar um torneio →</Link><p className="muted">Para atletas: inscrição direta, sem precisar criar conta.</p></main>
  <section id="campeonatos" className="public-section" aria-labelledby="championship-heading">
   <span className="eyebrow">Escolha sua competição</span><h2 id="championship-heading">Campeonatos com inscrições abertas</h2><p className="muted">Procure o campeonato, escolha sua categoria e veja as regras antes de se inscrever.</p>
   <div className="directory-filters"><label>Buscar campeonato ou categoria<input type="search" placeholder="Nome do campeonato ou categoria" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Modalidade<select value={modality} onChange={e=>setModality(e.target.value)}><option value="">Todas as modalidades</option>{Object.entries(modalities).map(([key,name])=><option value={key} key={key}>{name}</option>)}</select></label></div>
   {loading&&<p role="status">Carregando campeonatos...</p>}
   {error&&<div className="notice" role="alert"><p>{error}</p><button onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</button></div>}
   {!loading&&!error&&<><p className="muted" role="status">{visible.length} campeonato{visible.length===1?"":"s"} encontrado{visible.length===1?"":"s"}</p><div className="tournament-grid">{visible.map(t=>{
    const cats=(t.tournament_categories||[]).filter(c=>c.status==="open");
    const fees=cats.length?cats.map(c=>c.fee_cents):[t.fee_cents];
    const min=Math.min(...fees);const max=Math.max(...fees);
    return <article className="card tournament-card" key={t.id}><span className="status-badge">Inscrições abertas</span><h3>{t.name}</h3><div className="category-tags">{cats.length?cats.map(c=><span key={c.id}>{c.name} · {modalities[c.modality]}</span>):<span>{t.category} · {modalities[t.modality]}</span>}</div><p className="entry-price">{max===0?"Inscrição gratuita":min===max?money(min):`De ${money(min)} a ${money(max)}`}<small> por equipe</small></p><Link className="button" to={`/t/${t.slug}`}>Ver regras e fazer inscrição →</Link></article>;
   })}</div>{!visible.length&&<div className="card empty-directory"><h3>{query||modality?"Nenhum campeonato com esses filtros":"Novos campeonatos em breve"}</h3><p>{query||modality?"Experimente outro nome ou modalidade.":"Os campeonatos aparecem aqui quando o organizador abre as inscrições."}</p>{(query||modality)&&<button className="secondary" onClick={()=>{setQuery("");setModality("")}}>Limpar busca</button>}</div>}</>}
   <div className="directory-help"><div><h3>Como participar</h3><p>Escolha o campeonato e a categoria, confira o regulamento e preencha os dados da sua equipe. Guarde o link de acompanhamento que aparece ao concluir a inscrição.</p></div><Link to="/regras">Entenda as regras da competição →</Link></div>
  </section>
  <footer className="public-footer"><strong>Volox Play</strong><span>Vôlei de quadra e beach vôlei.</span><Link to="/regras">Regras da competição</Link><Link to="/login">Área do organizador</Link></footer>
 </>;
}

export function CompetitionRules({text="",modality,bestOf}:{text?:string;modality?:Modality;bestOf?:number|null}){
 return <section className="competition-rules" aria-labelledby="competition-rules-heading"><h2 id="competition-rules-heading">Regras da competição</h2>
  <h3>Inscrição e participação</h3><p>{modality?`${modalities[modality]}: ${teamSizes[modality]} atletas titulares por equipe. `:"A quantidade de atletas titulares depende da modalidade escolhida. "}A inscrição é feita nesta página, sem conta de atleta. A participação depende da aprovação da organização e, quando houver cobrança, da confirmação do pagamento.</p>
  <h3>Formato e pontuação</h3><p>{bestOf===3||bestOf===5?`Nesta categoria, os jogos são em melhor de ${bestOf} sets. `:"O organizador define o formato de sets da categoria antes do primeiro placar. "}No sistema, os sets de quadra vão a 25 pontos e os de areia a 21; o último set decisivo vai a 15. É necessária uma diferença de 2 pontos para encerrar o set.</p>
  <h3>Classificação e desempate</h3><ol><li>Maior número de vitórias.</li><li>Maior saldo de sets: sets ganhos menos sets perdidos.</li><li>Maior saldo de pontos: pontos marcados menos pontos sofridos.</li><li>Confronto direto entre as equipes que permanecem empatadas.</li></ol><p>Se o empate persistir ou faltarem placares para aplicar os critérios, as semifinais ficam bloqueadas até a organização resolver a classificação. No formato de duas chaves, classificam-se as duas primeiras equipes de cada uma: 1ª A × 2ª B e 1ª B × 2ª A.</p>
  <h3>Regulamento específico do campeonato</h3>{text.trim()?<div className="written-rules">{text}</div>:<p className="muted">O organizador ainda não publicou regras complementares. Horários, local, premiação, tolerância de atraso, W.O. e demais condições devem ser confirmados com a organização antes da inscrição.</p>}
 </section>;
}

export function RulesPage(){
 return <main className="narrow rules-page"><Link className="back-link" to="/campeonatos">← Encontrar campeonatos</Link><span className="eyebrow">Antes de entrar em quadra</span><h1>Regras no Volox Play</h1><p>Estas são as regras de funcionamento disponíveis no aplicativo. Consulte também o regulamento específico na página do campeonato escolhido.</p><div className="card"><CompetitionRules/></div><Link className="button" to="/campeonatos">Escolher campeonato</Link></main>;
}

export function RulesEditor({tournament,organizerId,onSaved}:{tournament:Tournament;organizerId:string;onSaved:()=>void}){
 const [text,setText]=useState(tournament.competition_rules||"");const [busy,setBusy]=useState(false);const [info,setInfo]=useState("");const [error,setError]=useState("");
 useEffect(()=>{setText(tournament.competition_rules||"");setInfo("");setError("")},[tournament.id,tournament.competition_rules]);
 async function save(e:FormEvent){
  e.preventDefault();setBusy(true);setInfo("");setError("");
  try{
   const {data,error}=await supabase.from("tournaments").update({competition_rules:text.trim()}).eq("id",tournament.id).eq("organizer_id",organizerId).select("id").single();
   if(error||!data)throw error||new Error("Não foi possível salvar o regulamento.");
   setInfo("Regulamento salvo e disponível na página pública do campeonato.");onSaved();
  }catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar o regulamento.")}finally{setBusy(false)}
 }
 return <section className="card"><h3>Regulamento do campeonato</h3><p>Publique local, datas, horários, níveis, premiação, tolerância de atraso, W.O., substituições e outras condições. Os critérios automáticos de classificação e a pontuação também aparecem para os atletas.</p><form onSubmit={save}><label>Regras específicas<textarea rows={10} maxLength={10000} value={text} onChange={e=>{setText(e.target.value);setInfo("")}} placeholder="Digite aqui o regulamento deste campeonato..."/></label><p className="muted">O texto será público. Não inclua dados privados de atletas.</p><button disabled={busy}>{busy?"Salvando...":"Publicar regulamento"}</button>{info&&<p role="status">{info}</p>}{error&&<p className="error" role="alert">{error}</p>}</form></section>;
}
