import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { CalendarDays, MapPin, Heart, ChevronRight, Users, Trophy, ArrowLeft, Volleyball, Clock } from "lucide-react";
import { eventState, eventDates, eventPlace, formatDate, readFavorites, writeFavorites, rememberRegistration } from "./lib/athlete";
import { isBeachTennis, validSetScore, formatLabel, scoringDescription } from "./lib/scoring";
import { rankGroup } from "./lib/ranking";
import { CompetitionRules, PublicHome, RulesPage, RulesEditor, PageMetadata, AppScaffold, MyRegistrations } from "./PublicPages";
import { modalities, teamSizes, type Modality, type Registration, type Tournament } from "./types";
import { authMessage } from "./lib/authMessages";
import { TournamentPublication } from "./TournamentPublication";
import type { Session } from "@supabase/supabase-js";

const message = (e:unknown) => e instanceof Error ? e.message : "Ocorreu um erro";
const money = (cents:number) => (cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
function App(){
 const [session,setSession]=useState<Session|null>(null); const [ready,setReady]=useState(false);
 const [recovering,setRecovering]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get("type")==="recovery" || sessionStorage.getItem("volox-password-recovery")==="1");
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)}); const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{setSession(s);if(event==="PASSWORD_RECOVERY"){sessionStorage.setItem("volox-password-recovery","1");setRecovering(true)}});return ()=>subscription.unsubscribe()},[]);
 if(!ready) return <main>Carregando...</main>;
 if(recovering) return <ResetPassword session={session} onDone={()=>{sessionStorage.removeItem("volox-password-recovery");setRecovering(false)}}/>;
 return <><PageMetadata/><header><Link to="/" className="brand" aria-label="VoloxPlay"><span className="volox-logo-window" aria-hidden="true"><img src="/brand/volox-dark.jpeg" alt="" width="1170" height="647"/></span><span className="brand-play" aria-hidden="true">Play</span></Link><nav><Link to="/campeonatos">Campeonatos</Link><Link to="/regras">Regras</Link>{session?<><Link to="/painel">Meu painel</Link><button className="ghost" onClick={()=>supabase.auth.signOut()}>Sair</button></>:<Link to="/login">Organizador</Link>}</nav></header><Routes><Route path="/" element={<PublicHome/>}/><Route path="/campeonatos" element={<PublicHome/>}/><Route path="/favoritos" element={<PublicHome favoritesOnly/>}/><Route path="/minhas-inscricoes" element={<MyRegistrations/>}/><Route path="/regras" element={<RulesPage/>}/><Route path="/login" element={session?<Navigate to="/painel"/>:<Login/>}/><Route path="/painel" element={session?<Dashboard userId={session.user.id}/>:<Navigate to="/login"/>}/><Route path="/t/:slug" element={<PublicTournament/>}/><Route path="/inscricao/:id" element={<RegistrationStatus/>}/><Route path="*" element={<main>Página não encontrada. <Link to="/">Voltar</Link></main>}/></Routes></>;
}
function Login(){
 const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [mode,setMode]=useState<"login"|"signup"|"reset">("login");const [busy,setBusy]=useState(false);const [info,setInfo]=useState("");
 function changeMode(next:typeof mode){setMode(next);setInfo("");setPassword("")}
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setInfo("");
  try{
   if(mode==="reset"){
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin});
    if(error)throw error;
    setInfo("Se houver uma conta com esse e-mail, você receberá um link para criar uma nova senha. Confira também a pasta de spam.");
   }else{
    const {error}=mode==="signup"?await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:`${window.location.origin}/login`}}):await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error)throw error;
    if(mode==="signup")setInfo("Solicitação de cadastro enviada. Se for necessária a confirmação do e-mail, confira sua caixa de entrada e a pasta de spam antes de entrar.");
   }
  }catch(e){setInfo(authMessage(e))}finally{setBusy(false)}
 }
 async function resendConfirmation(){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setInfo("Informe um e-mail válido no campo acima.");return}
  setBusy(true);setInfo("");
  try{
   const {error}=await supabase.auth.resend({type:"signup",email:email.trim(),options:{emailRedirectTo:`${window.location.origin}/login`}});
   if(error)throw error;
   setInfo("Se houver um cadastro aguardando confirmação, um novo e-mail será enviado. Confira também a pasta de spam.");
  }catch(e){setInfo(authMessage(e))}finally{setBusy(false)}
 }
 return <main className="narrow"><h1>{mode==="login"?"Acesso do organizador":mode==="signup"?"Criar conta":"Recuperar senha"}</h1><form onSubmit={submit} className="card"><label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>{mode!=="reset"&&<label>Senha<input type="password" autoComplete={mode==="signup"?"new-password":"current-password"} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)}/></label>}<button disabled={busy}>{busy?"Aguarde...":mode==="login"?"Entrar":mode==="signup"?"Criar conta":"Enviar link de recuperação"}</button>{info&&<p role="status">{info}</p>}</form>{mode==="login"&&<button className="linklike" disabled={busy} onClick={()=>changeMode("reset")}>Esqueci minha senha</button>}{mode!=="reset"&&<button type="button" className="linklike" disabled={busy} onClick={()=>void resendConfirmation()}>Reenviar confirmação de e-mail</button>}<button className="linklike" disabled={busy} onClick={()=>changeMode(mode==="login"?"signup":"login")}>{mode==="login"?"Ainda não tenho conta":"Voltar para entrar"}</button></main>
}
function ResetPassword({session,onDone}:{session:Session|null;onDone:()=>void}){
 const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [busy,setBusy]=useState(false);const [info,setInfo]=useState("");
 const navigate=useNavigate();
 async function submit(e:FormEvent){
  e.preventDefault();setInfo("");
  if(password!==confirm){setInfo("As senhas não coincidem.");return}
  setBusy(true);
  try{
   const {error}=await supabase.auth.updateUser({password});
   if(error)throw error;
   navigate("/painel",{replace:true});onDone();
  }catch(e){setInfo(message(e))}finally{setBusy(false)}
 }
 if(!session)return <main className="narrow"><h1>Recuperar senha</h1><p>O link expirou ou é inválido. Solicite um novo link na tela de acesso.</p><button onClick={()=>{navigate("/login",{replace:true});onDone()}}>Voltar para entrar</button></main>;
 return <main className="narrow"><h1>Criar nova senha</h1><form onSubmit={submit} className="card"><label>Nova senha<input type="password" autoComplete="new-password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirme a nova senha<input type="password" autoComplete="new-password" minLength={6} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button disabled={busy}>{busy?"Salvando...":"Salvar nova senha"}</button>{info&&<p role="status">{info}</p>}</form></main>
}
function Dashboard({userId}:{userId:string}){
 type Cat={name:string;modality:Modality;fee:string;capacity:string};
 const [list,setList]=useState<Tournament[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
const [drawCategories,setDrawCategories]=useState<{id:string;name:string}[]>([]);
const [drawCategoryId,setDrawCategoryId]=useState("");
 const [drawLoading,setDrawLoading]=useState(false);
 const [drawResult,setDrawResult]=useState("");
 type DrawGroup={group_name:string;teams:string[]};
 const [drawGroups,setDrawGroups]=useState<DrawGroup[]>([]);
 const [drawReadLoading,setDrawReadLoading]=useState(false);
 const [drawReadError,setDrawReadError]=useState("");
 async function carregarChaves(categoryId:string) {
  setDrawGroups([]);
  setDrawReadError("");
  if (!categoryId) return;
  setDrawReadLoading(true);
  try {
   const {data,error}=await supabase.rpc("consultar_chaves",{p_category_id:categoryId});
   if(error) throw error;
   if(!Array.isArray(data)) throw Error("Resposta inesperada ao consultar as chaves.");
   setDrawGroups(data as DrawGroup[]);
  } catch(err) {
   setDrawReadError("Não foi possível consultar as chaves: "+message(err));
  } finally {
   setDrawReadLoading(false);
  }
 }

 const [regs,setRegs]=useState<Registration[]>([]);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [name,setName]=useState("Copa Vôlei Assis");
 const [cats,setCats]=useState<Cat[]>([{name:"Dupla Masculina",modality:"areia_2x2",fee:"120",capacity:"16"}]);
 const [pix,setPix]=useState<{payment_row_id:string;qr_code:string|null;qr_code_base64:string|null}|null>(null);
 const [paymentStatus,setPaymentStatus]=useState("");
 const [freeOrganizer,setFreeOrganizer]=useState(false);
 const [trialRemaining,setTrialRemaining]=useState(0);
 const [asaasTestBusy,setAsaasTestBusy]=useState(false);
 const [asaasTestMessage,setAsaasTestMessage]=useState("");
 const [asaasTestPix,setAsaasTestPix]=useState<{qr_code:string;qr_code_base64:string|null}|null>(null);
 async function testAsaasPix(){
  if(!window.confirm("Gerar um Pix REAL de R$ 29,90 para teste? Nenhum pagamento sera efetuado automaticamente."))return;
  setAsaasTestBusy(true);setAsaasTestMessage("");setAsaasTestPix(null);
  try{
   const {data,error}=await supabase.functions.invoke("diagnostico-pix-asaas",{body:{}});
   if(error){const response=(error as {context?:Response}).context;const detail=response&&typeof response.json==="function"?await response.json().catch(()=>null):null;throw Error(detail?.details||detail?.error||message(error))}
   if(data?.error)throw Error(data.details||data.error);
   if(!data?.qr_code)throw Error("Asaas nao retornou o codigo Pix.");
   setAsaasTestPix({qr_code:data.qr_code,qr_code_base64:data.qr_code_base64||null});
   setAsaasTestMessage("Pix Asaas de R$ 29,90 gerado. Nenhum torneio criado e nenhuma gratuidade consumida. Nao pague antes de conferir.");
  }catch(e){setAsaasTestMessage("Falha no Pix Asaas: "+message(e))}
  finally{setAsaasTestBusy(false)}
 }

 async function sortearChaves(categoryId: string) {
  if (!categoryId) { setError("Selecione uma categoria."); return; }
  if (!window.confirm("Confirmar o sorteio desta categoria? Ele não poderá ser repetido.")) return;
  setBusy(true);
  setError("");
  setDrawResult("");
  try {
   const { data, error } = await supabase.rpc("sortear_chaves", { p_category_id: categoryId });
   if (error) throw error;
   setDrawResult("Sorteio registrado. Confira as chaves abaixo.");
   await carregarChaves(categoryId);
  } catch (err) {
   setError(message(err));
  } finally {
   setBusy(false);
  }
 }
 async function carregarCategorias(tournamentId: string) {
  setError("");
  setDrawResult("");
  setDrawGroups([]);
  setDrawReadError("");
  setDrawLoading(true);
  setDrawCategories([]);
  setDrawCategoryId("");
  try {
   const { data, error } = await supabase.from("tournament_categories")
    .select("id,name").eq("tournament_id", tournamentId).order("created_at");
   if (error) throw error;
   setDrawCategories(data || []);
   if (data?.length) {
    setDrawCategoryId(data[0].id);
    await carregarChaves(data[0].id);
   }
  } catch (err) {
   setError("Erro ao carregar categorias: " + message(err));
  } finally {
   setDrawLoading(false);
  }
 }
 async function load(){
  const {data,error}=await supabase.from("tournaments").select("*").eq("organizer_id",userId).order("created_at",{ascending:false});
  if(error)setError(error.message);else setList((data||[]) as Tournament[]);
 }
 useEffect(()=>{void load();supabase.rpc("is_free_organizer").then(({data,error})=>{if(!error)setFreeOrganizer(data===true);});supabase.rpc("volox_trial_remaining").then(({data,error})=>{if(!error&&typeof data==="number")setTrialRemaining(data);});},[userId]);
 useEffect(()=>{
  if(!selected){setRegs([]);return;}
  supabase.from("registrations").select("*").eq("tournament_id",selected).order("created_at",{ascending:false})
   .then(({data,error})=>{if(error)setError(error.message);else setRegs((data||[]) as Registration[])});
 },[selected]);
 useEffect(()=>{
  if(!pix)return;
  let stopped=false;
  async function check(){
   if(!pix)return;
   const {data,error}=await supabase.functions.invoke("consultar-pagamento-asaas",{body:{payment_row_id:pix.payment_row_id}});
   if(stopped)return;
   if(error){setPaymentStatus("Aguardando atualização do pagamento.");return;}
   if(data?.status==="approved"&&data.tournament_id){
    setPaymentStatus("Pagamento confirmado! Campeonato liberado.");
    setPix(null);void load();
   }else setPaymentStatus("Aguardando confirmação do PIX...");
  }
  void check();const timer=setInterval(()=>void check(),5000);
  return()=>{stopped=true;clearInterval(timer)};
 },[pix?.payment_row_id,userId]);
 function updateCat(i:number,key:keyof Cat,value:string){
  setCats(prev=>prev.map((c,j)=>i===j?{...c,[key]:value}:c));
 }
 async function create(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setPaymentStatus("");
  try{
   const categories=cats.map(c=>{
    const fee_cents=Math.round(Number(c.fee.replace(",","."))*100);
    const capacity=Number(c.capacity);
    if(!c.name.trim()||!Number.isSafeInteger(fee_cents)||fee_cents<0||
      !Number.isInteger(capacity)||capacity<2||capacity>512)throw Error("Confira os dados das categorias.");
    return {name:c.name.trim(),modality:c.modality,fee_cents,capacity};
   });
   if(name.trim().length<3||!categories.length)throw Error("Informe o campeonato e pelo menos uma categoria.");
   if(freeOrganizer||trialRemaining>0){
    const {error:freeError}=await supabase.rpc("create_trial_tournament",{p_name:name.trim(),p_categories:categories});
    if(freeError)throw freeError;
    setPaymentStatus("Torneio criado. Publique em Meus campeonatos para utilizar uma publicação gratuita.");
    await load();
    return;
   }
   const {data,error}=await supabase.functions.invoke("criar-pagamento-pix",
    {body:{name:name.trim(),categories}});
   if(error)throw error;
   if(data?.error)throw Error(data.error);
   if(!data?.payment_row_id||!data?.qr_code)throw Error("O Mercado Pago não retornou o código PIX.");
   setPix(data);
  }catch(e){setError(message(e))}finally{setBusy(false)}
 }
 async function confirmPayment(r:Registration){
  if(!window.confirm(`Você conferiu o recebimento integral da inscrição de ${r.team_name} na conta da organização? Confirme somente após verificar o crédito. Esta ação registra sua conferência manual e não movimenta dinheiro.`))return;
  setBusy(true);setError("");
  try{
   const {data,error}=await supabase.from("registrations").update({payment_status:"paid"}).eq("id",r.id).eq("tournament_id",selected!).select("*").single();
   if(error||!data)throw error||new Error("Não foi possível confirmar o recebimento.");
   setRegs(prev=>prev.map(x=>x.id===r.id?data as Registration:x));
  }catch(e){setError(message(e))}finally{setBusy(false)}
 }
 async function decide(r:Registration,status:"approved"|"rejected"){
  setError("");
  setBusy(true);
  try{
   const {data,error}=await supabase.from("registrations").update({status}).eq("id",r.id).eq("tournament_id",selected!).select("id").single();
   if(error||!data)throw error||new Error("Não foi possível atualizar a inscrição.");
   setRegs(prev=>prev.map(x=>x.id===r.id?{...x,status}:x));
  }catch(e){setError(message(e))}finally{setBusy(false)}
 }
 const active=list.find(t=>t.id===selected);
 return <main>
  <h1>Painel do organizador</h1>
  <section className="card">
   <h2>Teste de pagamento Asaas</h2>
   <p className="muted">Gere um Pix real de R$ 29,90 para validar a integracao, sem criar campeonato nem consumir publicacoes gratuitas. Nao pague antes de conferir.</p>
   <button type="button" className="secondary" disabled={asaasTestBusy} onClick={()=>void testAsaasPix()}>{asaasTestBusy?"Gerando Pix...":"Gerar Pix Asaas de R$ 29,90 para teste"}</button>
   {asaasTestMessage&&<p role="status">{asaasTestMessage}</p>}
   {asaasTestPix&&<div className="card"><h3>Pix de validacao — R$ 29,90</h3>{asaasTestPix.qr_code_base64&&<img alt="QR Code Pix Asaas" style={{maxWidth:240,width:"100%"}} src={`data:image/png;base64,${asaasTestPix.qr_code_base64}`}/>}<p>Pix copia e cola:</p><textarea readOnly rows={4} style={{width:"100%"}} value={asaasTestPix.qr_code}/><button type="button" onClick={()=>void navigator.clipboard.writeText(asaasTestPix.qr_code)}>Copiar Pix</button></div>}
  </section>
  <div className="layout">
   <section>
    <h2>Novo campeonato</h2>
    <form className="card" onSubmit={create}>
     <label>Nome do campeonato<input required minLength={3} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
     <p className="muted">{freeOrganizer?"Arena Volox: publicação gratuita e ilimitada.":trialRemaining>0?`Você tem ${trialRemaining} publicação(ões) gratuita(s) disponível(is). Depois, R$ 29,90 por torneio.`:"R$ 29,90 uma única vez pelo campeonato. Categorias ilimitadas."}</p>
     {cats.map((c,i)=><div className="card" key={i}>
      <h3>Categoria {i+1}</h3>
      <label>Nome da categoria<input required maxLength={60} value={c.name} onChange={e=>updateCat(i,"name",e.target.value)}/></label>
      <label>Modalidade<select value={c.modality} onChange={e=>updateCat(i,"modality",e.target.value)}>
       {Object.entries(modalities).map(([k,v])=><option key={k} value={k}>{v}</option>)}
      </select></label>
      <label>Inscrição por equipe (R$)<input type="number" min="0" step="0.01" value={c.fee} onChange={e=>updateCat(i,"fee",e.target.value)}/></label>
      <label>Máximo de equipes<input type="number" min="2" max="512" value={c.capacity} onChange={e=>updateCat(i,"capacity",e.target.value)}/></label>
      {cats.length>1&&<button type="button" className="secondary" onClick={()=>setCats(prev=>prev.filter((_,j)=>j!==i))}>Remover categoria</button>}
     </div>)}
     <button type="button" className="secondary" onClick={()=>setCats(prev=>[...prev,{name:"",modality:"areia_2x2",fee:"120",capacity:"16"}])}>+ Adicionar categoria</button>
     <p className="muted">{freeOrganizer?"Sua conta é isenta da taxa de publicação.":trialRemaining>0?"A gratuidade é consumida na primeira publicação, não na criação.":"A cobrança de R$ 29,90 é separada das inscrições das equipes."}</p>
     <button disabled={busy||!!pix}>{busy?"Aguarde...":freeOrganizer||trialRemaining>0?"Criar torneio gratuitamente":"Gerar PIX de R$ 29,90"}</button>
    </form>
    {paymentStatus&&!pix&&<p role="status">{paymentStatus}</p>}
    {pix&&<div className="card">
     <h2>Pague o PIX de R$ 29,90</h2>
     {pix.qr_code_base64&&<img alt="QR Code PIX" style={{maxWidth:240,width:"100%"}} src={`data:image/png;base64,${pix.qr_code_base64}`}/>}
     <p>PIX copia e cola:</p>
     <textarea readOnly value={pix.qr_code||""} rows={4} style={{width:"100%"}}/>
     <button onClick={()=>void navigator.clipboard.writeText(pix.qr_code||"")}>Copiar código PIX</button>
     <p role="status">{paymentStatus||"Aguardando pagamento..."}</p>
     <p className="muted">Não feche esta página antes de guardar seu código PIX.</p>
    </div>}
   </section>
   <section>
    <h2>Meus campeonatos</h2>
    {list.length===0&&<p>Nenhum campeonato criado.</p>}
    {list.map(t=><div className="card" key={t.id}>
     <h3>{t.name}</h3>
     <p>{modalities[t.modality]} • {t.category} • {money(t.fee_cents)}</p>
     <TournamentPublication tournament={t} onChanged={()=>{void load();void supabase.rpc("volox_trial_remaining").then(({data,error})=>{if(!error&&typeof data==="number")setTrialRemaining(data);});}}/>
     {t.status==="open"?<p><Link to={`/t/${t.slug}`}>Página pública</Link></p>:<p className="muted">Publique o torneio para liberar o link aos atletas.</p>}
     <button className="secondary" onClick={()=>{setSelected(t.id);void carregarCategorias(t.id)}}>Inscrições e regulamento</button>
<button
  className="secondary"
 onClick={() => {
  setSelected(t.id);
  void carregarCategorias(t.id);
}}
>
  🏐 Sortear Chaves
</button>
    </div>)}
   </section>
  </div>
  {error&&<p className="error" role="alert">{error}</p>}
  {active&&<section>
   <h2>Inscrições — {active.name}</h2>
   <RulesEditor key={active.id} tournament={active} organizerId={userId} onSaved={()=>void load()}/>
{drawLoading && <p>Carregando categorias...</p>}
{!drawLoading && drawCategories.length === 0 && <p className="muted">Clique em Sortear Chaves para carregar as categorias.</p>}
{drawCategories.length > 0 && (
  <div className="card">
    <h3>🏐 Sorteio das Chaves</h3>

    <label>
      Escolha a categoria
      <select
        value={drawCategoryId}
        onChange={e => {
          setDrawCategoryId(e.target.value);
          setDrawResult("");
          void carregarChaves(e.target.value);
        }}
      >
        {drawCategories.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>

    <p className="muted">
      O sorteio utilizará somente equipes aprovadas. São necessárias pelo menos 3 equipes aprovadas.
    </p>
    {drawReadLoading && <p>Consultando chaves...</p>}
    {drawReadError && <p className="error" role="alert">{drawReadError}</p>}
    {drawGroups.length > 0 ? (
      <>
        <p role="status">Sorteio já realizado. {drawGroups.length} chave(s) encontrada(s).</p>
        <div className="layout">
          {drawGroups.map((group,i) => (
            <div className="card" key={i}>
              <h3>{group.group_name}</h3>
              <ol>{group.teams.map((team,j) => <li key={j}>{team}</li>)}</ol>
            </div>
          ))}
        </div>
      </>
    ) : (
      !drawReadLoading && !drawReadError && (
        <button type="button" disabled={busy || !drawCategoryId}
          onClick={() => void sortearChaves(drawCategoryId)}>
          {busy ? "Aguarde..." : "Confirmar sorteio da categoria"}
        </button>
      )
    )}
    {drawResult && <p role="status">{drawResult}</p>}
  </div>
)}
   {drawCategoryId && <JogosPanel categoryId={drawCategoryId}/>}
   {drawCategoryId && <EliminatoriasPanel categoryId={drawCategoryId}/>}
   {drawCategoryId && <PublicacaoResultados categoryId={drawCategoryId}/>} 
   <p className="muted">As inscrições pagas são recebidas diretamente pela organização. Confira o recebimento antes de confirmar o pagamento. A confirmação aqui é manual e não consulta o banco.</p>
   {regs.length===0?<p>Nenhuma inscrição ainda.</p>:<div className="table-wrap"><table>
    <thead><tr><th>Equipe</th><th>Responsável</th><th>Atletas</th><th>Pagamento</th><th>Situação</th><th>Ações</th></tr></thead>
    <tbody>{regs.map(r=><tr key={r.id}>
     <td>{r.team_name}</td>
     <td>{r.captain_name}<br/><small>{r.captain_email}</small><br/><small>{r.captain_phone}</small></td>
     <td>{r.athletes.join(", ")}</td>
     <td>{r.payment_status==="not_required"?"Gratuita":r.payment_status==="paid"?"Recebimento confirmado":"Aguardando confirmação"}{r.payment_confirmed_at&&<small style={{display:"block"}}>Confirmado manualmente em {new Date(r.payment_confirmed_at).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</small>}</td>
     <td>{r.status==="approved"?"Aprovada":r.status==="rejected"?"Rejeitada":"Aguardando aprovação"}</td>
     <td>{r.payment_status!=="paid"&&r.payment_status!=="not_required"&&r.status!=="rejected"&&<button disabled={busy} onClick={()=>void confirmPayment(r)}>Confirmar recebimento</button>}<button disabled={busy||r.status==="approved"||(r.payment_status!=="not_required"&&r.payment_status!=="paid")}
      onClick={()=>decide(r,"approved")}>Aprovar</button>
      <button className="danger" disabled={busy||r.status==="rejected"} onClick={()=>decide(r,"rejected")}>Rejeitar</button></td>
    </tr>)}</tbody></table></div>}
  </section>}
 </main>;
}

type VoloxMatch={
 id:string;group_name:string;round_number:number;team_a:string;team_b:string;
 team_a_id:string;team_b_id:string;sets_a:number|null;sets_b:number|null;
 status:string;set_scores:number[][]|null;
};
function JogosPanel({categoryId}:{categoryId:string}){
 const [matches,setMatches]=useState<VoloxMatch[]>([]);
 const [bestOf,setBestOf]=useState(3);
 const [modality,setModality]=useState<Modality>("areia_2x2");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [err,setErr]=useState("");
 const [info,setInfo]=useState("");
 const [editing,setEditing]=useState<string|null>(null);
 const [scores,setScores]=useState<string[][]>([]);
 async function refresh(){
  if(!categoryId)return;
  setLoading(true);setErr("");
  const {data,error}=await supabase.rpc("volox_jogos",{p_category_id:categoryId});
  if(error)setErr(error.message);
  else if(data){
   setMatches(Array.isArray(data.matches)?data.matches:[]);
   setBestOf(data.best_of===1?1:data.best_of===5?5:3);
   setModality(data.modality as Modality);
  }
  setLoading(false);
 }
 useEffect(()=>{setEditing(null);setMatches([]);void refresh()},[categoryId]);
 async function configure(n:number){
  setBusy(true);setErr("");setInfo("");
  try{
   const {error}=await supabase.rpc("volox_configurar_sets",{p_category_id:categoryId,p_best_of:n});
   if(error)throw error;
   await refresh();setInfo("Formato atualizado.");
  }catch(e){setErr(message(e))}finally{setBusy(false)}
 }
 function startEdit(m:VoloxMatch){
  setEditing(m.id);
  const rows=m.set_scores?.length?m.set_scores.map(x=>x.map(String)) :Array.from({length:Math.ceil(bestOf/2)},()=>["",""]);
  setScores(rows);
  setErr("");setInfo("");
 }
 function setPoint(i:number,j:number,v:string){
  setScores(prev=>prev.map((row,ri)=>ri===i?row.map((x,c)=>c===j?v:x):row));
 }
 async function save(m:VoloxMatch){
  setErr("");setInfo("");
  const parsed=scores.map(row=>row.map(x=>Number(x)));
  if(scores.some(row=>row.some(x=>x.trim()===""||!/^\d+$/.test(x)))){
   setErr("Informe os pontos inteiros de cada set.");return;
  }
  const targetWins=(bestOf+1)/2;
  let a=0,b=0;
  for(let i=0;i<parsed.length;i++){
   const [pa,pb]=parsed[i];
   const target=bestOf>1&&i===bestOf-1?15:modality==="quadra_6x6"?25:21;
   if(a===targetWins||b===targetWins){setErr("Há sets após o fim da partida.");return;}
   if(!validSetScore(modality,bestOf,i,pa,pb)){
    setErr(isBeachTennis(modality)?"Placar inválido: informe 6–0 a 6–4, 7–5 ou 7–6.":`Placar inválido no ${i+1}º set. Mínimo ${target} pontos e diferença de 2.`);return;
   }
   if(pa>pb)a++;else b++;
  }
  if(Math.max(a,b)!==targetWins){setErr("Adicione os sets necessários até uma equipe vencer.");return;}
  setBusy(true);
  try{
   const {error}=await supabase.rpc("volox_salvar_placar",{p_match_id:m.id,p_scores:parsed});
   if(error)throw error;
   setEditing(null);await refresh();setInfo("Placar salvo e classificação atualizada.");
  }catch(e){setErr(message(e))}finally{setBusy(false)}
 }
 const groups=Array.from(new Set(matches.map(m=>m.group_name))).sort();
 const wins=(bestOf+1)/2;
 return <section className="card">
  <h3>🏐 Jogos, placares e classificação</h3>
  {loading&&<p>Carregando jogos...</p>}
  {err&&<p className="error" role="alert">{err}</p>}
  {info&&<p role="status">{info}</p>}
  {!loading&&<><label>Formato da categoria
   <select disabled={busy} value={bestOf} onChange={e=>void configure(Number(e.target.value))}>
    {isBeachTennis(modality)?<option value={1}>Set único de 6 games</option>:<option value={3}>Melhor de 3 sets</option>}
    {modality==="quadra_6x6"&&<option value={5}>Melhor de 5 sets</option>}
   </select>
  </label>
  <p className="muted">{scoringDescription(modality)} O formato só pode mudar antes do primeiro placar.</p>
  {matches.length===0&&<p>Os jogos aparecerão aqui depois do sorteio.</p>}
  {groups.map(group=>{
   const games=matches.filter(m=>m.group_name===group);
   const ranking=rankGroup(games);
   return <div key={group} className="card">
    <h4>{group} — {games.length} jogos</h4>
    {games.map(m=><div key={m.id} className="card">
     <p><strong>{m.team_a}</strong> × <strong>{m.team_b}</strong> — Rodada {m.round_number}</p>
     <p>{m.status==="finished"?`Finalizado: ${m.sets_a} × ${m.sets_b}`:"Aguardando placar"}
      {m.set_scores?.length?` | Sets: ${m.set_scores.map(x=>x.join("–")).join(" / ")}`:""}</p>
     {editing!==m.id?<button type="button" className="secondary" disabled={busy} onClick={()=>startEdit(m)}>
       {m.status==="finished"?"Corrigir placar":"Lançar placar"}
      </button>:<div>
       {scores.map((row,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
        <span>Set {i+1}</span>
        <input aria-label={`${m.team_a} set ${i+1}`} type="number" min="0" step="1" style={{width:80}} value={row[0]} onChange={e=>setPoint(i,0,e.target.value)}/>
        <span>×</span>
        <input aria-label={`${m.team_b} set ${i+1}`} type="number" min="0" step="1" style={{width:80}} value={row[1]} onChange={e=>setPoint(i,1,e.target.value)}/>
       </div>)}
       <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button type="button" className="secondary" disabled={scores.length>=bestOf||busy} onClick={()=>setScores(p=>[...p,["",""]])}>+ Set</button>
        <button type="button" className="secondary" disabled={scores.length<=2||busy} onClick={()=>setScores(p=>p.slice(0,-1))}>− Set</button>
        <button type="button" disabled={busy} onClick={()=>void save(m)}>Salvar placar</button>
        <button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button>
       </div>
      </div>}
    </div>)}
    <h4>Classificação — {group}</h4>
    <p className="muted">Vitórias → saldo de sets → saldo de {isBeachTennis(modality)?"games":"pontos"} → confronto direto. Empates pendentes não definem classificação.</p>
    <div className="table-wrap"><table>
     <thead><tr><th>Pos.</th><th>Equipe</th><th>Jogos</th><th>Vitórias</th><th>Derrotas</th><th>Sets pró</th><th>Sets contra</th><th>Saldo de sets</th><th>Saldo de {isBeachTennis(modality)?"games":"pontos"}</th></tr></thead>
     <tbody>{ranking.map(t=><tr key={t.id}><td>{t.tied?"Empate":t.position}</td><td>{t.name}</td><td>{t.j}</td><td>{t.v}</td><td>{t.d}</td><td>{t.sf}</td><td>{t.sc}</td><td>{t.sf-t.sc}</td><td>{t.pf-t.pc}</td></tr>)}</tbody>
    </table></div>
   </div>;
  })}
  </>}
 </section>;
}


type KnockoutMatch={
 id:string;phase:"semi1"|"semi2"|"final"|"third";team_a:string;team_b:string;
 sets_a:number|null;sets_b:number|null;status:string;set_scores:number[][]|null;
};
function EliminatoriasPanel({categoryId}:{categoryId:string}){
 const [matches,setMatches]=useState<KnockoutMatch[]>([]);
 const [bestOf,setBestOf]=useState(3);
 const [modality,setModality]=useState<Modality>("areia_2x2");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [err,setErr]=useState("");
 const [info,setInfo]=useState("");
 const [editing,setEditing]=useState<string|null>(null);
 const [scores,setScores]=useState<string[][]>([]);
 async function refresh(){
  setLoading(true);setErr("");
  const {data,error}=await supabase.rpc("volox_eliminatorias",{p_category_id:categoryId});
  if(error)setErr(error.message);
  else if(data){
   setMatches(Array.isArray(data.matches)?data.matches:[]);
   setBestOf(data.best_of===1?1:data.best_of===5?5:3);
   setModality(data.modality as Modality);
  }
  setLoading(false);
 }
 useEffect(()=>{setMatches([]);setEditing(null);void refresh()},[categoryId]);
 async function generate(phase:"semi"|"finals"){
  const msg=phase==="semi"
   ?"Todos os jogos das chaves foram finalizados e conferidos? Gerar semifinais?"
   :"As semifinais estão corretas e finalizadas? Gerar final e terceiro lugar?";
  if(!window.confirm(msg))return;
  setBusy(true);setErr("");setInfo("");
  try{
   const {error}=await supabase.rpc(phase==="semi"?"volox_gerar_semifinais":"volox_gerar_finais",
    {p_category_id:categoryId});
   if(error)throw error;
   await refresh();setInfo("Confrontos gerados com sucesso.");
  }catch(e){setErr(message(e))}finally{setBusy(false)}
 }
 function startEdit(m:KnockoutMatch){
  setEditing(m.id);setScores(m.set_scores?.length?m.set_scores.map(x=>x.map(String)) :Array.from({length:Math.ceil(bestOf/2)},()=>["",""]));
  setErr("");setInfo("");
 }
 async function save(m:KnockoutMatch){
  setErr("");setInfo("");
  if(scores.some(row=>row.some(x=>x.trim()===""||!/^\d+$/.test(x)))){
   setErr("Preencha os pontos inteiros de todos os sets.");return;
  }
  const parsed=scores.map(row=>row.map(Number));
  let a=0,b=0;
  for(let i=0;i<parsed.length;i++){
   const [pa,pb]=parsed[i],target=bestOf>1&&i===bestOf-1?15:modality==="quadra_6x6"?25:21;
   if(a===(bestOf+1)/2||b===(bestOf+1)/2||!validSetScore(modality,bestOf,i,pa,pb)){
    setErr(`Placar inválido no set ${i+1}.`);return;
   }
   if(pa>pb)a++;else b++;
  }
  if(Math.max(a,b)!==(bestOf+1)/2){setErr("Preencha todos os sets até definir o vencedor.");return;}
  setBusy(true);
  try{
   const {error}=await supabase.rpc("volox_salvar_eliminatoria",{p_match_id:m.id,p_scores:parsed});
   if(error)throw error;
   setEditing(null);await refresh();setInfo("Resultado salvo.");
  }catch(e){setErr(message(e))}finally{setBusy(false)}
 }
 const hasSemi=matches.some(m=>m.phase==="semi1");
 const hasFinal=matches.some(m=>m.phase==="final");
 const semisDone=matches.filter(m=>m.phase==="semi1"||m.phase==="semi2").length===2&&
   matches.filter(m=>m.phase==="semi1"||m.phase==="semi2").every(m=>m.status==="finished");
 const labels:{[k:string]:string}={semi1:"Semifinal 1",semi2:"Semifinal 2",third:"Terceiro lugar",final:"Final"};
 const final=matches.find(m=>m.phase==="final"&&m.status==="finished");
 const third=matches.find(m=>m.phase==="third"&&m.status==="finished");
 const winner=(m:KnockoutMatch)=>(m.sets_a??0)>(m.sets_b??0)?m.team_a:m.team_b;
 const runnerUp=final?(final.sets_a??0)>(final.sets_b??0)?final.team_b:final.team_a:null;
 const semi1=matches.find(m=>m.phase==="semi1");
 const semi2=matches.find(m=>m.phase==="semi2");
 const bracketCard=(m:KnockoutMatch|undefined,title:string)=>(
  <div style={{flex:"1 1 190px",minWidth:0,padding:14,border:"1px solid #cbd5e1",borderRadius:12,background:"rgba(148,163,184,.08)"}}>
   <div style={{fontSize:12,fontWeight:700,opacity:.7,marginBottom:8}}>{title}</div>
   {m?<><div style={{fontWeight:700,overflowWrap:"anywhere"}}>{m.team_a||"A definir"}</div>
    <div style={{fontSize:12,opacity:.7,margin:"5px 0"}}>×</div>
    <div style={{fontWeight:700,overflowWrap:"anywhere"}}>{m.team_b||"A definir"}</div>
    <div style={{marginTop:10,fontSize:13}}>{m.status==="finished"?`Finalizado: ${m.sets_a} × ${m.sets_b}`:"Aguardando placar"}</div>
   </>:<div style={{opacity:.7}}>Aguardando definição</div>}
  </div>
 );
 return <section className="card">
  <h3>🏆 Fase eliminatória</h3>
  <p className="muted">Depois de finalizar e conferir os jogos das chaves, confirme a geração das semifinais. Os vencedores avançam à final; os perdedores disputam o terceiro lugar.</p>
  {loading&&<p>Carregando eliminatórias...</p>}
  {err&&<p className="error" role="alert">{err}</p>}
  {info&&<p role="status">{info}</p>}
  {!loading&&<>
   {!hasSemi&&<button type="button" disabled={busy} onClick={()=>void generate("semi")}>Confirmar classificação e gerar semifinais</button>}
   {hasSemi&&!hasFinal&&<button type="button" disabled={busy||!semisDone} onClick={()=>void generate("finals")}>Gerar final e terceiro lugar</button>}
   {hasSemi&&<div className="card" style={{marginTop:16}}>
    <h4>🏐 Chaveamento do campeonato</h4>
    <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"stretch"}}>
     <div style={{flex:"2 1 250px",minWidth:0}}>
      <p style={{fontWeight:700,marginBottom:8}}>Semifinais</p>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
       {bracketCard(semi1,"SEMIFINAL 1")}
       {bracketCard(semi2,"SEMIFINAL 2")}
      </div>
     </div>
     <div style={{flex:"1 1 200px",minWidth:0}}>
      <p style={{fontWeight:700,marginBottom:8}}>Decisão</p>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
       {bracketCard(matches.find(m=>m.phase==="final"),"🏆 FINAL")}
       {bracketCard(matches.find(m=>m.phase==="third"),"🥉 TERCEIRO LUGAR")}
      </div>
     </div>
    </div>
   </div>}
   {final&&<div className="card" style={{textAlign:"center",padding:22,marginTop:16}}>
    <h3 style={{marginBottom:16}}>🏆 Pódio do campeonato</h3>
    <div style={{display:"flex",justifyContent:"center",gap:12,flexWrap:"wrap",alignItems:"stretch"}}>
     <div style={{flex:"1 1 160px",maxWidth:260,padding:18,borderRadius:14,background:"rgba(234,179,8,.14)",border:"2px solid #d4a017"}}>
      <div style={{fontSize:28}}>🥇</div><strong>Campeão</strong>
      <p style={{fontSize:18,fontWeight:800,overflowWrap:"anywhere"}}>{winner(final)}</p>
     </div>
     <div style={{flex:"1 1 160px",maxWidth:260,padding:18,borderRadius:14,background:"rgba(148,163,184,.13)",border:"1px solid #94a3b8"}}>
      <div style={{fontSize:28}}>🥈</div><strong>Vice-campeão</strong>
      <p style={{fontSize:18,fontWeight:800,overflowWrap:"anywhere"}}>{runnerUp}</p>
     </div>
     {third&&<div style={{flex:"1 1 160px",maxWidth:260,padding:18,borderRadius:14,background:"rgba(180,110,50,.11)",border:"1px solid #b87333"}}>
      <div style={{fontSize:28}}>🥉</div><strong>Terceiro lugar</strong>
      <p style={{fontSize:18,fontWeight:800,overflowWrap:"anywhere"}}>{winner(third)}</p>
     </div>}
    </div>
    {!third&&<p className="muted">O terceiro lugar aparecerá quando a disputa terminar.</p>}
   </div>}
   {matches.map(m=><div key={m.id} className="card">
    <h4>{labels[m.phase]}</h4>
    <p><strong>{m.team_a}</strong> × <strong>{m.team_b}</strong></p>
    <p>{m.status==="finished"?`Finalizado: ${m.sets_a} × ${m.sets_b}`:"Aguardando resultado"}
     {m.set_scores?.length?` | Sets: ${m.set_scores.map(s=>s.join("–")).join(" / ")}`:""}</p>
    {editing!==m.id?
     <button type="button" className="secondary" disabled={busy} onClick={()=>startEdit(m)}>
      {m.status==="finished"?"Corrigir placar":"Lançar placar"}
     </button>:
     <div>
      {scores.map((row,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
       <span>Set {i+1}</span>
       <input aria-label={`${m.team_a} set ${i+1}`} type="number" min="0" step="1" style={{width:80}}
        value={row[0]} onChange={e=>setScores(p=>p.map((r,j)=>j===i?[e.target.value,r[1]]:r))}/>
       <span>×</span>
       <input aria-label={`${m.team_b} set ${i+1}`} type="number" min="0" step="1" style={{width:80}}
        value={row[1]} onChange={e=>setScores(p=>p.map((r,j)=>j===i?[r[0],e.target.value]:r))}/>
      </div>)}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
       <button type="button" className="secondary" disabled={busy||scores.length>=bestOf}
        onClick={()=>setScores(p=>[...p,["",""]])}>+ Set</button>
       <button type="button" className="secondary" disabled={busy||scores.length<=2}
        onClick={()=>setScores(p=>p.slice(0,-1))}>− Set</button>
       <button type="button" disabled={busy} onClick={()=>void save(m)}>Salvar placar</button>
       <button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button>
      </div>
     </div>}
   </div>)}
  </>}
 </section>;
}


function PublicacaoResultados({categoryId}:{categoryId:string}){
 const [published,setPublished]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError("");
  supabase.rpc("volox_publicacao_status",{p_category_id:categoryId}).then(({data,error})=>{
   if(cancelled)return;
   if(error)setError(error.message);else setPublished(data===true);
   setLoading(false);
  });
  return ()=>{cancelled=true};
 },[categoryId]);
 async function toggle(){
  if(!window.confirm(published?"Ocultar os resultados do público?":"Publicar resultados desta categoria? O campeonato também precisa estar aberto."))return;
  setBusy(true);setError("");
  const {data,error}=await supabase.rpc("volox_definir_publicacao",{p_category_id:categoryId,p_published:!published});
  if(error)setError(error.message);else setPublished(data===true);
  setBusy(false);
 }
 return <section className="card">
  <h3>🌐 Publicação dos resultados</h3>
  <p className="muted">O público só verá os resultados quando esta categoria estiver publicada e o campeonato e a categoria estiverem abertos.</p>
  {loading?<p>Consultando publicação...</p>:<><p><strong>{published?"Publicação ativada":"Resultados ocultos"}</strong></p>
   <button type="button" disabled={busy||!!error} onClick={()=>void toggle()}>{busy?"Aguarde...":published?"Ocultar resultados":"Publicar resultados"}</button></>}
  {error&&<p className="error" role="alert">{error}</p>}
 </section>;
}

type PublicMatch={id?:string;team_a:string;team_b:string;team_a_id?:string;team_b_id?:string;
 sets_a:number|null;sets_b:number|null;status:string;set_scores:number[][]|null;round_number?:number;phase?:string};
type PublicGroup={name:string;matches:PublicMatch[]};
function ResultadosPublicos({categoryId,modality}:{categoryId:string;modality?:Modality}){
 const [data,setData]=useState<{groups:PublicGroup[];knockout:PublicMatch[]}|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{
  let cancelled=false;setLoading(true);setData(null);setError("");
  supabase.rpc("volox_resultados_publicos",{p_category_id:categoryId}).then(({data,error})=>{
   if(cancelled)return;
   if(error)setError("Não foi possível consultar os resultados.");
   else setData(data&&typeof data==="object"?data as {groups:PublicGroup[];knockout:PublicMatch[]}:null);
   setLoading(false);
  });
  return ()=>{cancelled=true};
 },[categoryId]);
 const winner=(m:PublicMatch)=>m.status==="finished"&&m.sets_a!==null&&m.sets_b!==null
  ?m.sets_a>m.sets_b?m.team_a:m.team_b:null;
 const final=data?.knockout?.find(m=>m.phase==="final");
 const third=data?.knockout?.find(m=>m.phase==="third");
 const vice=final&&winner(final)?winner(final)===final.team_a?final.team_b:final.team_a:null;
 return <section className="card">
  <h2>🏐 Resultados do campeonato</h2>
  {loading&&<p>Carregando resultados...</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {!loading&&!error&&!data&&<p className="muted">Os resultados desta categoria ainda não foram publicados.</p>}
  {data&&<>
   {final&&winner(final)&&<div className="card"><h3>🏆 Pódio</h3>
    <p>🥇 Campeão: <strong>{winner(final)}</strong></p>
    <p>🥈 Vice-campeão: <strong>{vice}</strong></p>
    {third&&winner(third)&&<p>🥉 Terceiro lugar: <strong>{winner(third)}</strong></p>}
   </div>}
   {(data.groups||[]).map((g,i)=>{
    const ranking=rankGroup(g.matches||[]);
    return <div className="card" key={i}><h3>{g.name}</h3><p className="muted">Vitórias → saldo de sets → saldo de {isBeachTennis(modality)?"games":"pontos"} → confronto direto. Empates pendentes não definem classificação.</p>
     <div className="table-wrap"><table><thead><tr><th>Pos.</th><th>Equipe</th><th>Jogos</th><th>Vitórias</th><th>Derrotas</th><th>Saldo de sets</th><th>Saldo de {isBeachTennis(modality)?"games":"pontos"}</th></tr></thead>
      <tbody>{ranking.map(t=><tr key={t.id}><td>{t.tied?"Empate":t.position}</td><td>{t.name}</td><td>{t.j}</td><td>{t.v}</td><td>{t.d}</td><td>{t.sf-t.sc}</td><td>{t.pf-t.pc}</td></tr>)}</tbody>
     </table></div>
     {(g.matches||[]).map((m,j)=><p key={m.id||j}>{m.team_a} × {m.team_b} — {m.status==="finished"?`${m.sets_a} × ${m.sets_b}`:"Aguardando placar"}</p>)}
    </div>;
   })}
   {!!data.knockout?.length&&<div className="card"><h3>🏆 Chaveamento eliminatório</h3>
    {(["semi1","semi2","third","final"] as const).map(phase=>{
     const m=data.knockout.find(x=>x.phase===phase);
     if(!m)return null;
     const label={semi1:"Semifinal 1",semi2:"Semifinal 2",third:"Terceiro lugar",final:"Final"}[phase];
     return <div className="card" key={phase}><strong>{label}</strong>
      <p>{m.team_a} × {m.team_b}</p>
      <p>{m.status==="finished"?`${m.sets_a} × ${m.sets_b}`:"Aguardando placar"}</p></div>;
    })}
   </div>}
  </>}
 </section>;
}

function PublicTournament(){
 const {slug}=useParams();const [params,setParams]=useSearchParams();
 type PublicCat={id:string;name:string;modality:Modality;fee_cents:number;capacity:number;status:string;best_of:number|null};
 const [t,setT]=useState<Tournament|null>(null);const [cats,setCats]=useState<PublicCat[]>([]);const [catId,setCatId]=useState("");
 const [err,setErr]=useState("");const [loading,setLoading]=useState(true);const [team,setTeam]=useState("");const [captain,setCaptain]=useState("");
 const [email,setEmail]=useState("");const [phone,setPhone]=useState("");const [athletes,setAthletes]=useState<string[]>([]);const [submitting,setSubmitting]=useState(false);
 const [favorites,setFavorites]=useState(readFavorites);const [storageNotice,setStorageNotice]=useState("");
 const navigate=useNavigate();const requestedTab=params.get("aba")||"informacoes";const tab=["informacoes","categorias","regulamento","resultados","inscricao"].includes(requestedTab)?requestedTab:"informacoes";
 useEffect(()=>{
  let cancelled=false;
  async function load(){
   setLoading(true);setErr("");setT(null);setCats([]);setCatId("");
   const {data,error}=await supabase.from("tournaments").select("*").eq("slug",slug).eq("status","open").maybeSingle();
   if(cancelled)return;
   if(error||!data){setErr("Este torneio não está disponível para consulta pública.");setLoading(false);return}
   const found=data as Tournament;
   const result=await supabase.from("tournament_categories").select("id,name,modality,fee_cents,capacity,status,best_of").eq("tournament_id",found.id).order("created_at");
   if(cancelled)return;
   if(result.error){setErr("Não foi possível carregar as categorias.");setLoading(false);return}
   setT(found);setCats((result.data||[]) as PublicCat[]);
   const requested=params.get("categoria");
   setCatId(result.data?.find(c=>c.id===requested)?.id||result.data?.[0]?.id||"");
   setLoading(false);
  }
  void load();return()=>{cancelled=true};
 },[slug]);
 useEffect(()=>{if(t){document.title=`${t.name} | VoloxPlay`;document.querySelector('meta[property="og:title"]')?.setAttribute("content",document.title)}},[t]);
 const selected=cats.find(c=>c.id===catId);const modality=selected?.modality||t?.modality;const fee=selected?.fee_cents??t?.fee_cents??0;const count=modality?teamSizes[modality]:0;
 useEffect(()=>{if(count)setAthletes(Array(count).fill(""))},[catId,count]);
 function showTab(next:string,category?:string){const updated=new URLSearchParams(params);updated.set("aba",next);if(category){setCatId(category);updated.set("categoria",category)}setParams(updated)}
 async function submit(e:FormEvent){
  e.preventDefault();if(!t)return;setErr("");setSubmitting(true);
  try{
   if(!eventState(t).accepting||selected&&selected.status!=="open")throw Error("As inscrições desta categoria estão encerradas.");
   if(athletes.some(x=>!x.trim()))throw Error("Informe todos os atletas titulares.");
   const {data,error}=await supabase.rpc("register_team_by_category",{p_tournament_id:t.id,p_category_id:cats.length?catId:null,p_team_name:team.trim(),p_captain_name:captain.trim(),p_captain_email:email.trim(),p_captain_phone:phone.trim(),p_athletes:athletes.map(x=>x.trim())});
   if(error)throw error;if(!data)throw Error("Não foi possível criar a inscrição.");
   rememberRegistration({id:data,tournament:t.name,category:selected?.name});navigate(`/inscricao/${data}`);
  }catch(e){setErr(message(e))}finally{setSubmitting(false)}
 }
 if(loading)return <AppScaffold><p role="status">Carregando torneio...</p></AppScaffold>;
 if(!t)return <AppScaffold><div className="app-empty"><Trophy size={35}/><h1>Torneio indisponível</h1><p>{err}</p><Link className="button" to="/campeonatos">Explorar torneios</Link></div></AppScaffold>;
 const state=eventState(t);const canRegister=state.accepting&&(!cats.length||cats.some(c=>c.status==="open"));const saved=favorites.includes(t.id);
 const picker=<label className="category-picker">Categoria<select value={catId} onChange={e=>showTab(tab,e.target.value)}>{cats.map(c=><option key={c.id} value={c.id}>{c.name} — {modalities[c.modality]}</option>)}</select></label>;
 return <AppScaffold>
  <Link className="event-back" to="/campeonatos"><ArrowLeft size={17}/> Todos os torneios</Link>
  <div className="event-profile-cover"><div className="art-court"/><Volleyball size={135} strokeWidth={.8}/><span>O JOGO<br/><strong>COMEÇA AQUI.</strong></span></div>
  <section className="event-profile-heading"><div><span className={`event-status ${canRegister?"open":""}`}>{canRegister&&<span className="live-dot"/>}{canRegister&&state.phase==="upcoming"?"Inscrições abertas":state.label}</span><h1>{t.name}</h1><div className="event-profile-meta"><span><CalendarDays size={16}/>{eventDates(t)}</span><span><MapPin size={16}/>{eventPlace(t)}</span></div></div><button className={`event-save ${saved?"saved":""}`} aria-pressed={saved} onClick={()=>{try{const next=saved?favorites.filter(id=>id!==t.id):[...favorites,t.id];writeFavorites(next);setFavorites(next);setStorageNotice("")}catch{setStorageNotice("Não foi possível salvar os favoritos neste navegador.")}}}><Heart size={18} fill={saved?"currentColor":"none"}/>{saved?"Salvo":"Salvar"}</button></section>
  {storageNotice&&<p role="status" className="notice">{storageNotice}</p>}
  <nav className="event-tabs" aria-label="Seções do torneio">{[["informacoes","Informações"],["categorias","Categorias"],["regulamento","Regulamento"],["resultados","Jogos e resultados"]].map(([key,label])=><button key={key} aria-current={tab===key?"page":undefined} className={tab===key?"active":""} onClick={()=>showTab(key)}>{label}{key==="categorias"&&<span>{cats.length||1}</span>}</button>)}</nav>
  {tab==="informacoes"&&<div className="event-details-grid"><section className="card event-description"><h2>Sobre o torneio</h2><p className="written-description">{t.description||"Participe desta competição no VoloxPlay. Consulte as categorias disponíveis e leia o regulamento antes de fazer sua inscrição."}</p><div className="event-info-line"><CalendarDays size={20}/><div><strong>Quando</strong><p>{eventDates(t)}</p></div></div><div className="event-info-line"><MapPin size={20}/><div><strong>Onde</strong><p>{eventPlace(t)}</p></div></div><div className="event-info-line"><Clock size={20}/><div><strong>Prazo de inscrição</strong><p>{t.registration_deadline?`Até ${formatDate(t.registration_deadline)}, às 23h59 (Brasília)`:"Consulte a organização. Inscrições sujeitas à disponibilidade."}</p></div></div><button className="text-button" onClick={()=>showTab("regulamento")}>Ler regulamento completo <ChevronRight size={17}/></button></section><aside className="card event-entry-summary"><span className="app-eyebrow">SUA PRÓXIMA DISPUTA</span><h2>{canRegister?"Pronto para jogar?":"Acompanhe a competição"}</h2><p>{cats.length||1} categoria{(cats.length||1)===1?"":"s"} · Vôlei e Beach Tennis</p><p>Confira valores, modalidade e regulamento antes de se inscrever.</p><button disabled={!canRegister} onClick={()=>showTab("categorias")}>{canRegister?"Escolher categoria":"Inscrições encerradas"}<ChevronRight size={17}/></button><button className="text-button" onClick={()=>showTab("resultados")}>Ver jogos e resultados</button></aside></div>}
  {tab==="categorias"&&<section><div className="section-heading"><h2>Escolha sua categoria</h2><p>Inscrição individual, por dupla ou por equipe.</p></div><div className="category-grid">{(cats.length?cats:[{id:"",name:t.category,modality:t.modality,fee_cents:t.fee_cents,capacity:t.capacity,status:"open",best_of:null}]).map(c=>{const available=state.accepting&&c.status==="open";return <article className="card category-card" key={c.id}><div className="category-icon"><Users size={24}/></div><span className={`event-status ${available?"open":""}`}>{available?"Inscrições abertas":"Inscrições encerradas"}</span><h3>{c.name}</h3><p>{modalities[c.modality]} · {teamSizes[c.modality]} {teamSizes[c.modality]===1?"atleta":"atletas"} por equipe</p><p className="muted">Limite de {c.capacity} equipes · {c.best_of?formatLabel(c.modality,c.best_of):"Formato a confirmar"}</p><div className="category-price">{c.fee_cents?money(c.fee_cents):"Gratuita"}<small> por equipe</small></div><button disabled={!available} onClick={()=>showTab("inscricao",c.id||undefined)}>{available?"Inscrever minha equipe":"Inscrições encerradas"}<ChevronRight size={17}/></button></article>})}</div></section>}
  {tab==="regulamento"&&<div className="card">{cats.length>0&&picker}<CompetitionRules text={t.competition_rules||""} modality={modality} bestOf={selected?.best_of}/></div>}
  {tab==="resultados"&&<div className="card"><h2>Jogos e resultados</h2>{cats.length>0?<>{picker}<ResultadosPublicos categoryId={catId} modality={modality}/></>:<p className="muted">Os jogos serão exibidos quando a organização publicar os resultados da categoria.</p>}</div>}
  {tab==="inscricao"&&<section className="card entry-form"><button className="text-button" onClick={()=>showTab("categorias")}><ArrowLeft size={15}/> Voltar para categorias</button><div className="section-heading"><span className="app-eyebrow">ENTRE PARA A DISPUTA</span><h2>Inscreva sua equipe</h2><p>Preencha os dados dos atletas. Você não precisa criar uma conta.</p></div>{cats.length>0&&picker}<div className="entry-selected"><span>{selected?.name||t.category} · {modality?modalities[modality]:""}</span><strong>{fee?money(fee):"Gratuita"}<small> por equipe</small></strong></div>{!state.accepting||selected&&selected.status!=="open"?<p className="notice">As inscrições desta categoria estão encerradas.</p>:<>{fee>0&&t.payment_instructions&&<div className="written-rules"><h3>Pagamento à organização</h3><p>{t.payment_instructions}</p></div>}{fee>0&&<p className="notice">O pagamento é feito diretamente à organização, fora do aplicativo. Sua inscrição ficará aguardando a conferência manual do recebimento e a aprovação da organização. Não há débito automático.</p>}<form onSubmit={submit}><div className="form-section-label">01 · SUA EQUIPE</div><label>Nome do atleta / dupla / equipe<input required minLength={2} maxLength={100} value={team} onChange={e=>setTeam(e.target.value)}/></label><div className="form-section-label">02 · RESPONSÁVEL</div><label>Nome do responsável<input required minLength={2} maxLength={100} value={captain} onChange={e=>setCaptain(e.target.value)}/></label><div className="editor-grid"><label>E-mail<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label><label>WhatsApp<input required type="tel" minLength={8} maxLength={25} value={phone} onChange={e=>setPhone(e.target.value)}/></label></div><div className="form-section-label">03 · ATLETAS TITULARES ({count})</div><div className="editor-grid">{athletes.map((a,i)=><label key={i}>Atleta {i+1}<input required minLength={2} maxLength={100} value={a} onChange={e=>setAthletes(prev=>prev.map((x,j)=>i===j?e.target.value:x))}/></label>)}</div><p className="muted">Os dados de contato são usados para administrar a inscrição e não serão exibidos publicamente. Consulte o <button type="button" className="inline-link" onClick={()=>showTab("regulamento")}>regulamento da competição</button>.</p><button disabled={submitting||!!(cats.length&&!catId)}>{submitting?"Enviando...":"Enviar inscrição"}<ChevronRight size={17}/></button>{err&&<p className="error" role="alert">{err}</p>}</form></>}</section>}
 </AppScaffold>;
}
function RegistrationStatus(){
 const {id}=useParams();const [status,setStatus]=useState("");const [err,setErr]=useState("");
 useEffect(()=>{if(!id)return;supabase.rpc("get_registration_status",{p_id:id}).then(({data,error})=>{if(error)setErr(error.message);else if(!data)setErr("Inscrição não encontrada.");else {setStatus(JSON.stringify(data));rememberRegistration({id,tournament:data.tournament_name||"Campeonato"})}})},[id]);
 let obj:{team_name?:string;status?:string;payment_status?:string;tournament_name?:string;payment_instructions?:string;fee_cents?:number;payment_confirmed_at?:string}|null=null;try{obj=status?JSON.parse(status):null}catch{}
 return <AppScaffold><div className="registration-status-page"><Link className="event-back" to="/minhas-inscricoes"><ArrowLeft size={17}/> Minhas inscrições</Link><h1>Acompanhar inscrição</h1><div className="card">{err?<p className="error">{err}</p>:obj?<><h2>{obj.team_name}</h2><p>Campeonato: {obj.tournament_name}</p><p>Situação: <strong>{obj.status==="pending"?"Aguardando aprovação":obj.status==="approved"?"Aprovada":"Rejeitada"}</strong></p><p>Pagamento: <strong>{obj.payment_status==="not_required"?"Não exigido":obj.payment_status==="paid"?"Recebimento confirmado pela organização":"Aguardando confirmação da organização"}</strong></p>{obj.payment_status!=="not_required"&&<><p>Valor da inscrição: <strong>{money(obj.fee_cents||0)}</strong></p>{obj.payment_instructions?<div className="written-rules"><h3>Como pagar à organização</h3><p>{obj.payment_instructions}</p></div>:<p>Combine o pagamento diretamente com a organização. O aplicativo não gera cobrança automática da inscrição.</p>}</>}<p className="muted">Guarde este link privado. Ele permite consultar o status da sua inscrição.</p></>:<p>Consultando...</p>}</div></div></AppScaffold>
}
export default App;
