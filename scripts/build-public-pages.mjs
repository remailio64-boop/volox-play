import { readFile, writeFile, mkdir } from 'node:fs/promises';
const home=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const baseTitle='Volox Play | Campeonatos de vôlei e beach vôlei';
const baseDescription='Encontre campeonatos de vôlei e beach vôlei no Volox Play. Consulte categorias, regulamentos e valores e faça sua inscrição online.';
const pages=[
 {path:'campeonatos',title:'Campeonatos e inscrições | Volox Play',description:baseDescription},
 {path:'regras',title:'Regras da competição | Volox Play',description:'Consulte as regras de inscrição, formatos de disputa e critérios de desempate dos campeonatos no Volox Play.'}
];
for(const page of pages){
 const directory=new URL(`../dist/${page.path}/`,import.meta.url);
 await mkdir(directory,{recursive:true});
 let html=home.replaceAll(baseTitle,page.title).replaceAll(baseDescription,page.description)
   .replace('rel="canonical" href="https://volox-play.vercel.app/"',`rel="canonical" href="https://volox-play.vercel.app/${page.path}"`)
   .replace('property="og:url" content="https://volox-play.vercel.app/"',`property="og:url" content="https://volox-play.vercel.app/${page.path}"`);
 if(page.path==='regras')html=html.replace('<h1>Encontre seu próximo torneio.</h1>','<h1>Regras no Volox Play</h1>')
   .replace('<h2>Torneios de vôlei e beach vôlei</h2>','<h2>Inscrição, pontuação e desempate</h2>')
   .replace('Consulte datas, categorias e regulamentos. Faça sua inscrição online e acompanhe os resultados no Volox Play.','Consulte o regulamento específico de cada campeonato antes de se inscrever. A classificação para as semifinais usa vitórias, saldo de sets, saldo de pontos e confronto direto, nessa ordem.');
 await writeFile(new URL('index.html',directory),html);
}
console.log('Public pages generated: /campeonatos and /regras');
