import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const load=async path=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const {validSetScore}=await load('../src/lib/scoring.ts');
const {eventState}=await load('../src/lib/athlete.ts');
const {rankGroup}=await load('../src/lib/ranking.ts');
const {authMessage}=await load('../src/lib/authMessages.ts');
const cases=[
 ['areia_2x2',1,0,21,19,true],['areia_2x2',1,0,15,13,false],
 ['quadra_6x6',1,0,25,23,true],['quadra_6x6',1,0,15,13,false],
 ['areia_2x2',3,0,21,19,true],['areia_2x2',3,0,21,20,false],
 ['areia_2x2',3,0,22,20,true],['areia_2x2',3,0,23,20,false],
 ['areia_2x2',3,2,15,13,true],['areia_2x2',3,2,15,14,false],
 ['areia_2x2',3,2,17,15,true],['quadra_6x6',5,0,25,23,true],
 ['quadra_6x6',5,0,26,24,true],['quadra_6x6',5,0,25,24,false],
 ['quadra_6x6',5,4,15,13,true],['beach_tennis_duplas',1,0,6,4,true],
 ['beach_tennis_duplas',1,0,6,5,false],['beach_tennis_duplas',1,0,7,5,true],
 ['beach_tennis_duplas',1,0,7,6,true],['beach_tennis_duplas',1,0,8,6,false],
 ['beach_tennis_simples',1,0,6,0,true],['beach_tennis_simples',1,0,7,7,false],
 ['areia_2x2',3,3,21,19,false],['areia_2x2',3,-1,21,19,false],
 ['areia_2x2',3,0,-1,21,false],['areia_2x2',3,0,21.5,19,false],
];
for(const [mod,best,i,a,b,expected] of cases)assert.equal(validSetScore(mod,best,i,a,b),expected,JSON.stringify([mod,best,i,a,b]));
assert.equal(eventState({status:'open',registration_deadline:'2026-11-06'},'2026-11-06').accepting,true);
assert.equal(eventState({status:'open',registration_deadline:'2026-11-05'},'2026-11-06').accepting,false);
assert.equal(eventState({status:'open',event_end_date:'2026-11-05'},'2026-11-06').accepting,false);
assert.equal(eventState({status:'draft'},'2026-11-06').accepting,false);
const match=(a,b,sa,sb,scores)=>({team_a:a,team_b:b,team_a_id:a,team_b_id:b,sets_a:sa,sets_b:sb,status:'finished',set_scores:scores});
assert.deepEqual(rankGroup([match('A','B',2,0,[[21,10],[21,10]]),match('A','C',2,0,[[21,10],[21,10]]),match('B','C',2,0,[[21,10],[21,10]])]).map(x=>x.id),['A','B','C']);
assert.equal(rankGroup([match('A','B',1,0,[[21,19]]),match('B','C',1,0,[[21,19]]),match('C','A',1,0,[[21,19]])]).every(x=>x.tied),true);
assert.match(authMessage({code:'email_not_confirmed'}),/Confirme seu e-mail/);
assert.match(authMessage({code:'invalid_credentials'}),/incorretos/);
assert.match(authMessage({code:'over_email_send_rate_limit'}),/limite/);
console.log(`${cases.length+9} regression checks passed (scoring, deadlines, ranking, auth errors)`);

const {athleteReturn,normalizeAthleteCode}=await load('../src/lib/athleteAccounts.ts');
for(const value of [null,'https://example.com','//example.com','/painel','/atleta\\example.com','javascript:alert(1)'])assert.equal(athleteReturn(value),'/atleta');
assert.equal(athleteReturn('/t/copa?aba=inscricao'),'/t/copa?aba=inscricao');
assert.equal(athleteReturn('/atleta?retorno=inscricao'),'/atleta?retorno=inscricao');
assert.equal(normalizeAthleteCode(' A1b2C3d4E5f6 '),'a1b2c3d4e5f6');
console.log('9 athlete identity and safe return checks passed');

const {registrationUnit}=await load('../src/lib/registration.ts');
for(const [modality,mode,expected] of [['areia_2x2','formed','equipe'],['areia_4x4','drawn','atleta'],['beach_tennis_simples','formed','atleta'],['beach_tennis_duplas','formed','equipe'],['beach_tennis_duplas','drawn','atleta'],['quadra_6x6','formed','equipe']])assert.equal(registrationUnit(modality,mode),expected);
console.log('6 registration price-unit checks passed');
