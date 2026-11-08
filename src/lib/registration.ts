import type { Modality } from '../types';
export const registrationUnit=(modality:Modality,mode?:string)=>mode==='drawn'||modality==='beach_tennis_simples'?'atleta':'equipe';
