import { readFile, writeFile, mkdir } from 'node:fs/promises';
const home=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const baseTitle='VoloxPlay | Campeonatos de vôlei e Beach Tennis';
const baseDescription='Encontre campeonatos de vôlei e Beach Tennis no VoloxPlay. Consulte categorias, regulamentos e valores e faça sua inscrição online.';
const pages=[
 {path:'campeonatos',title:'Campeonatos e inscrições | VoloxPlay',description:baseDescription},
 {path:'regras',title:'Regras da competição | VoloxPlay',description:'Consulte as regras de inscrição, formatos de disputa e critérios de desempate dos campeonatos no VoloxPlay.'}
];
for(const page of pages){
 const directory=new URL(`../dist/${page.path}/`,import.meta.url);
 await mkdir(directory,{recursive:true});
 let html=home.replaceAll(baseTitle,page.title).replaceAll(baseDescription,page.description)
   .replace('rel="canonical" href="https://volox-play.vercel.app/"',`rel="canonical" href="https://volox-play.vercel.app/${page.path}"`)
   .replace('property="og:url" content="https://volox-play.vercel.app/"',`property="og:url" content="https://volox-play.vercel.app/${page.path}"`);
 if(page.path==='regras')html=html.replace('<h1>Encontre seu próximo torneio.</h1>','<h1>Regras no VoloxPlay</h1>')
   .replace('<h2>Torneios de vôlei e Beach Tennis</h2>','<h2>Inscrição, pontuação e desempate</h2>')
   .replace('Consulte datas, categorias e regulamentos. Faça sua inscrição online e acompanhe os resultados no VoloxPlay.','Consulte o regulamento específico de cada campeonato antes de se inscrever. A classificação para as semifinais usa vitórias, saldo de sets, saldo de pontos e confronto direto, nessa ordem.');
 await writeFile(new URL('index.html',directory),html);
}
console.log('Public pages generated: /campeonatos and /regras');
