import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';

const PendingInvitesContext=createContext(0);
export function PendingInvitesProvider({userId,children}:{userId?:string;children:ReactNode}){
 const [count,setCount]=useState(0);const {pathname}=useLocation();
 useEffect(()=>{
  let active=true;let request=0;setCount(0);
  async function refresh(){
   const current=++request;if(!userId)return;
   const {data,error}=await supabase.rpc('get_athlete_dashboard');
   if(active&&current===request&&!error)setCount((data?.participations||[]).filter((p:{membership_status:string;registration_status:string})=>p.membership_status==='pending'&&p.registration_status!=='rejected').length);
  }
  void refresh();window.addEventListener('focus',refresh);window.addEventListener('volox-invites-updated',refresh);
  return()=>{active=false;window.removeEventListener('focus',refresh);window.removeEventListener('volox-invites-updated',refresh)};
 },[userId,pathname]);
 return <PendingInvitesContext.Provider value={count}>{children}</PendingInvitesContext.Provider>;
}
export function PendingInviteBadge(){
 const count=useContext(PendingInvitesContext);
 return count>0?<span className="invite-badge" aria-label={`${count} convite${count===1?'':'s'} pendente${count===1?'':'s'}`}>{count}</span>:null;
}
