export function authMessage(error:unknown){
 const value=error as {code?:string;message?:string};
 const messages:Record<string,string>={
  invalid_credentials:'E-mail ou senha incorretos.',
  email_not_confirmed:'Confirme seu e-mail antes de entrar. Você pode reenviar a confirmação abaixo.',
  over_email_send_rate_limit:'O limite de envio de e-mails foi atingido. Aguarde antes de solicitar novamente.',
  over_request_rate_limit:'Muitas tentativas em pouco tempo. Aguarde e tente novamente.',
  weak_password:'Escolha uma senha mais forte, com pelo menos 6 caracteres.',
  email_address_invalid:'Confira o endereço de e-mail informado.',
  signup_disabled:'O cadastro de novas contas está temporariamente indisponível.',
 };
 return messages[value?.code||'']||value?.message||'Não foi possível concluir o acesso. Tente novamente.';
}
