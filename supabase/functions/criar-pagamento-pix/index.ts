
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {
 "Access-Control-Allow-Origin": "*",
 "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
 "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}})}
function admin(){
 return createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
 {auth:{autoRefreshToken:false,persistSession:false}});
}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"Metodo nao permitido"},405);
 try{
  const bearer=req.headers.get("authorization")||"";
  if(!bearer.startsWith("Bearer "))return json({error:"Login obrigatorio"},401);
  const db=admin();
  const {data:{user},error:userError}=await db.auth.getUser(bearer.slice(7));
  if(userError||!user?.email)return json({error:"Login invalido"},401);
  const body=await req.json();
  const name=String(body.name||"").trim();
  const cats=body.categories;
  if(name.length<2||name.length>100||!Array.isArray(cats)||cats.length<1||cats.length>100)
   return json({error:"Confira campeonato e categorias"},400);
  const seen=new Set<string>();
  const categories=[];
  for(const c of cats){
   const categoryName=String(c.name||"").trim();
   const modality=String(c.modality||"");
   const fee=Number(c.fee_cents);
   const capacity=Number(c.capacity);
   if(categoryName.length<1||categoryName.length>60||
      !["areia_2x2","areia_4x4","quadra_6x6","beach_tennis_duplas","beach_tennis_simples"].includes(modality)||
      !Number.isSafeInteger(fee)||fee<0||!Number.isInteger(capacity)||capacity<2||capacity>512||
      seen.has(categoryName.toLocaleLowerCase("pt-BR")))
     return json({error:"Categoria invalida ou repetida"},400);
   seen.add(categoryName.toLocaleLowerCase("pt-BR"));
   categories.push({name:categoryName,modality,fee_cents:fee,capacity});
  }
  const {data:row,error:dbError}=await db.from("tournament_payments")
   .insert({organizer_id:user.id,amount_cents:2990,status:"pending",tournament_data:{name,categories}})
   .select("id").single();
  if(dbError||!row)return json({error:"Nao foi possivel registrar a cobranca"},500);
  const token=Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if(!token)return json({error:"Token do provedor ausente"},500);
  const mp=await fetch("https://api.mercadopago.com/v1/payments",{
   method:"POST",
   headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json",
    "X-Idempotency-Key":row.id},
   body:JSON.stringify({transaction_amount:29.90,description:`VoloxPlay - ${name.slice(0,80)}`,
     payment_method_id:"pix",payer:{email:user.email},external_reference:row.id})
  });
  const payment=await mp.json();
  if(!mp.ok||!payment.id)return json({error:"Mercado Pago nao gerou o PIX",details:payment.message||"Tente novamente"},502);
  const {error:saveError}=await db.from("tournament_payments")
    .update({provider_payment_id:String(payment.id)}).eq("id",row.id);
  if(saveError)return json({error:"PIX gerado, mas houve falha ao registrar identificador. Contate suporte.",reference:row.id},500);
  return json({payment_id:String(payment.id),payment_row_id:row.id,
    qr_code:payment.point_of_interaction?.transaction_data?.qr_code||null,
    qr_code_base64:payment.point_of_interaction?.transaction_data?.qr_code_base64||null});
 }catch(e){console.error(e);return json({error:"Falha ao gerar PIX"},500)}
});

