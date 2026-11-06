export type RankingMatch={team_a:string;team_b:string;team_a_id?:string;team_b_id?:string;sets_a:number|null;sets_b:number|null;status:string;set_scores:number[][]|null};
type Standing={id:string;name:string;j:number;v:number;d:number;sf:number;sc:number;pf:number;pc:number;h2h:number;position:number;tied:boolean;missingPoints:boolean};

// Match the ranking criteria used by volox_gerar_semifinais in the database.
export function rankGroup(matches:RankingMatch[]):Standing[]{
 const teams=new Map<string,Standing>();
 for(const m of matches){
  for(const [id,name] of [[m.team_a_id,m.team_a],[m.team_b_id,m.team_b]] as [string|undefined,string][])
   if(id&&!teams.has(id))teams.set(id,{id,name,j:0,v:0,d:0,sf:0,sc:0,pf:0,pc:0,h2h:0,position:0,tied:false,missingPoints:false});
  if(m.status!=="finished"||m.sets_a===null||m.sets_b===null)continue;
  const a=teams.get(m.team_a_id||""),b=teams.get(m.team_b_id||"");
  if(!a||!b)continue;
  a.j++;b.j++;a.sf+=m.sets_a;a.sc+=m.sets_b;b.sf+=m.sets_b;b.sc+=m.sets_a;
  if(m.sets_a>m.sets_b){a.v++;b.d++}else{b.v++;a.d++}
  if(!m.set_scores?.length){a.missingPoints=true;b.missingPoints=true}
  for(const [pa,pb] of m.set_scores||[]){a.pf+=pa;a.pc+=pb;b.pf+=pb;b.pc+=pa}
 }
 const basicTie=(a:Standing,b:Standing)=>a.v===b.v&&a.sf-a.sc===b.sf-b.sc;
 const pointsTie=(a:Standing,b:Standing)=>basicTie(a,b)&&a.pf-a.pc===b.pf-b.pc;
 for(const m of matches){
  if(m.status!=="finished"||m.sets_a===null||m.sets_b===null)continue;
  const a=teams.get(m.team_a_id||""),b=teams.get(m.team_b_id||"");
  if(a&&b&&pointsTie(a,b)){
   if(m.sets_a>m.sets_b)a.h2h++;else b.h2h++;
  }
 }
 const compare=(a:Standing,b:Standing)=>b.v-a.v||(b.sf-b.sc)-(a.sf-a.sc)||(b.pf-b.pc)-(a.pf-a.pc)||b.h2h-a.h2h;
 const ordered=[...teams.values()].sort((a,b)=>compare(a,b)||a.id.localeCompare(b.id));
 ordered.forEach((team,i)=>{
  team.position=i+1;
  team.tied=ordered.some(other=>other.id!==team.id&&(compare(team,other)===0||(basicTie(team,other)&&(team.missingPoints||other.missingPoints))));
  if(i&&compare(ordered[i-1],team)===0)team.position=ordered[i-1].position;
 });
 return ordered;
}
