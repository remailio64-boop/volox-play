import { useState } from 'react';
import { supabase } from './lib/supabase';
import type { Tournament } from './types';

export function TournamentPublication({tournament,onChanged}:{tournament:Tournament;onChanged:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function toggle(){
  const publishing=tournament.status!=='open';
  if(!window.confirm(publishing?'Publicar este torneio? Ele ficará visível para os atletas e poderá receber inscrições.':'Ocultar este torneio? O link público ficará indisponível. As inscrições e os resultados serão preservados.'))return;
  setBusy(true);setError('');
  try{
   const {data,error}=await supabase.from('tournaments').update({status:publishing?'open':'draft'})
    .eq('id',tournament.id).eq('organizer_id',tournament.organizer_id).select('id').single();
   if(error||!data)throw error||new Error('Não foi possível atualizar a publicação.');
   onChanged();
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar a publicação.')}finally{setBusy(false)}
 }
 return <div><p role="status">{tournament.status==='open'?'Publicado: visível para os atletas.':'Rascunho: ainda não aparece para os atletas.'}</p><button type="button" className="secondary" disabled={busy} onClick={()=>void toggle()}>{busy?'Atualizando...':tournament.status==='open'?'Ocultar torneio':'Publicar torneio'}</button>{error&&<p role="alert" className="error">{error}</p>}</div>;
}
