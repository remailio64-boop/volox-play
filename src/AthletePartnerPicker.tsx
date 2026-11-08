import { useEffect, useId, useState } from 'react';
import { supabase } from './lib/supabase';

export type AthleteChoice={public_code:string;display_name:string;city:string};

export function AthletePartnerPicker({label,selected,excludedCodes,onSelect}:{label:string;selected:AthleteChoice|null;excludedCodes:string[];onSelect:(athlete:AthleteChoice|null)=>void}){
 const id=useId();
 const [name,setName]=useState(''),[city,setCity]=useState(''),[rows,setRows]=useState<AthleteChoice[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[searched,setSearched]=useState(false);
 useEffect(()=>{
  let active=true;setRows([]);setError('');setSearched(false);setLoading(false);
  if(selected||name.trim().length<3)return;
  setLoading(true);
  const timer=setTimeout(()=>{
   supabase.rpc('search_athlete_partners',{p_name:name.trim(),p_city:city.trim()}).then(({data,error})=>{
    if(!active)return;
    if(error)setError('Não foi possível buscar atletas. Altere a busca para tentar novamente.');else setRows(data||[]);
    setSearched(true);setLoading(false);
   });
  },300);
  return()=>{active=false;clearTimeout(timer)};
 },[name,city,selected]);
 const available=rows.filter(r=>!excludedCodes.includes(r.public_code));
 return <section className="partner-picker" aria-label={label}><h4>{label}</h4>{selected?<div className="selected-athlete"><strong>{selected.display_name}</strong><span>{selected.city||'Cidade não informada'}</span><button type="button" className="text-button" onClick={()=>{onSelect(null);setName('');setCity('')}}>Trocar atleta</button></div>:<>
  <div className="editor-grid"><label htmlFor={`${id}-name`}>Nome do parceiro<input id={`${id}-name`} type="search" autoComplete="off" maxLength={60} value={name} placeholder="Digite pelo menos 3 letras" onChange={e=>setName(e.target.value)}/></label><label htmlFor={`${id}-city`}>Cidade para filtrar (opcional)<input id={`${id}-city`} type="search" maxLength={100} value={city} placeholder="Cidade do parceiro" onChange={e=>setCity(e.target.value)}/></label></div>
  <div aria-live="polite">{loading&&<p>Buscando atletas...</p>}{error&&<p role="alert" className="error">{error}</p>}{searched&&!loading&&!error&&!available.length&&<p>Nenhum parceiro encontrado. Confira o nome e a cidade. Seu parceiro precisa criar um perfil e permitir a busca por nome ou a exibição pública.</p>}</div>
  {!!available.length&&<ul className="partner-results">{available.map(athlete=><li key={athlete.public_code}><div><strong>{athlete.display_name}</strong><small>{athlete.city||'Cidade não informada'}</small></div><button type="button" className="secondary" aria-label={`Selecionar ${athlete.display_name}, ${athlete.city||'cidade não informada'}`} onClick={()=>onSelect(athlete)}>Selecionar</button></li>)}</ul>}
  {available.length>=12&&<p className="muted">Refine o nome ou a cidade para encontrar seu parceiro.</p>}
 </>}</section>;
}
