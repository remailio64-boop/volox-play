import type { Modality } from '../types';
export function isBeachTennis(modality?:Modality|string){return modality==='beach_tennis_duplas'||modality==='beach_tennis_simples'}
export function validSetScore(modality:Modality,bestOf:number,index:number,a:number,b:number){
 if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0||![1,3,5].includes(bestOf)||!Number.isInteger(index)||index<0||index>=bestOf)return false;
 const high=Math.max(a,b),low=Math.min(a,b);
 if(isBeachTennis(modality))return bestOf===1&&index===0&&(high===6&&low<=4||high===7&&(low===5||low===6));
 const target=bestOf>1&&index===bestOf-1?15:modality==='quadra_6x6'?25:21;
 return high>=target&&high-low>=2&&(high===target||high-low===2);
}
export function formatLabel(modality:Modality,bestOf?:number|null){return isBeachTennis(modality)?'Set único · 6 games':bestOf?`Melhor de ${bestOf} sets`:'Formato a confirmar'}
export function scoringDescription(modality?:Modality){return isBeachTennis(modality)?'Beach Tennis: set único de 6 games. Em 5–5, vai a 7–5; em 6–6, tie-break de 7 pontos com diferença de 2, registrado como 7–6 no set. Os games são disputados sem vantagem (ponto decisivo em 40–40).':'Vôlei de quadra: sets até 25 pontos. Vôlei de areia: sets até 21. O set decisivo vai a 15, sempre com diferença de 2 pontos.'}
