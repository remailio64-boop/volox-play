export function inviteShareText(origin:string,team:string,tournament:string){
 const account=new URL('/atleta',origin).href;
 return `Inscrevi nossa equipe ${team} no torneio ${tournament}. Entre na sua conta do VoloxPlay e vá em Convites e participações para conferir o convite e confirmar sua participação.\n${account}\nA confirmação do convite é separada do pagamento e da aprovação da organização.`;
}
