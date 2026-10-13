export type Account={id:number;name:string;kind:'bank'|'cash'|'wallet';balance_cents:number};
export type Card={id:number;account_id:number;name:string;card_type:'debit'|'credit';last_four:string;brand:string;credit_limit_cents:number;debt_cents:number;closing_day:number|null;due_day:number|null};
export type Movement={id:number;kind:string;amount_cents:number;concept:string;account_id:number;destination_id:number|null;created_at:string;classification:string|null;category:string|null;fee_cents:number};
export const money=(c:number)=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(c/100);
export const cents=(n:string)=>Math.round(Number(n.replace(',','.'))*100);
export async function req<T>(route:string, options?:RequestInit):Promise<T>{const res=await fetch('/api'+route,{...options,headers:{'Content-Type':'application/json',...options?.headers}});if(!res.ok){let message='No se pudo completar la operación';try{message=(await res.json()).detail??message}catch{}throw new Error(message)}return res.json()}
