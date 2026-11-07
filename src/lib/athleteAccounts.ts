export const normalizeAthleteCode=(value:string)=>value.trim().toLowerCase();
// Only internal athlete/account and tournament destinations are permitted.
export const athleteReturn=(value:string|null)=>value&&/^\/(atleta(?:[/?]|$)|t\/[^/])/.test(value)&&!value.includes('\\')?value:'/atleta';
