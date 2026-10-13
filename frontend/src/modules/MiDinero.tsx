import {useEffect,useState} from 'react';
import {Wallet,ChevronLeft,ChevronRight,Plus,PenLine,ArrowDownUp,CreditCard,Landmark,Smartphone,CheckCircle2} from 'lucide-react';
import {Account,Card,Movement,req,money} from '../shared/api';
import CardModal from './mi-dinero/CardModal';
import AccountModal from './mi-dinero/AccountModal';
type Props={accounts:Account[];cards:Card[];reload:()=>Promise<void>;onWithdraw:()=>void;onIncome:()=>void;notify:(s:string)=>void};
type Item={type:'account';id:string;value:Account}|{type:'card';id:string;value:Card};
export default function MiDinero({accounts,cards,reload,onWithdraw,onIncome,notify}:Props){
 const[slide,setSlide]=useState(0);const[accountForm,setAccountForm]=useState<Account|null|undefined>();const[cardForm,setCardForm]=useState<Card|null|undefined>();const[history,setHistory]=useState<Movement[]|null>(null);const[error,setError]=useState('');
 const items:Item[]=[...accounts.map(a=>({type:'account' as const,id:`a${a.id}`,value:a})),...cards.map(c=>({type:'card' as const,id:`c${c.id}`,value:c}))];
 const index=Math.min(slide,Math.max(0,items.length-1));const item=items[index];
 useEffect(()=>{if(slide>=items.length)setSlide(Math.max(0,items.length-1))},[items.length,slide]);
 const shift=(by:number)=>setSlide((index+by+items.length)%items.length);
 async function loadHistory(id:number){try{setError('');setHistory(await req<Movement[]>(`/accounts/${id}/movements`))}catch(e){setError((e as Error).message)}}
 async function saved(){await reload();notify('Cambios guardados correctamente')}
 return <div className="money-module">
  <div className="section-head"><h2>Mi dinero</h2><span className="muted">{accounts.length} cuentas · {cards.length} tarjetas</span></div>
  <p className="muted">Desliza para consultar cuentas, billeteras, efectivo y tarjetas.</p>
  <div className="money-total"><small>Saldo total registrado</small><strong>{money(accounts.reduce((sum,a)=>sum+a.balance_cents,0))}</strong></div>
  <div className="money-shortcuts"><button className="primary" onClick={()=>setCardForm(null)}><CreditCard size={18}/> + Agregar tarjeta</button><button className="secondary" onClick={()=>setAccountForm(null)}><Plus size={18}/> + Agregar cuenta</button></div>
  {error&&<p className="error" role="alert">{error}</p>}
  {item?<><div className="slider-shell"><button className="arrow" aria-label="Anterior" disabled={items.length<2} onClick={()=>shift(-1)}><ChevronLeft/></button>
   <div className={'financial-card '+(item.type==='card'&&(item.value as Card).card_type==='credit'?'credit':'')}
     onTouchStart={e=>{e.currentTarget.dataset.x=String(e.touches[0].clientX)}} onTouchEnd={e=>{const dx=e.changedTouches[0].clientX-Number(e.currentTarget.dataset.x??0);if(Math.abs(dx)>45&&items.length>1)shift(dx<0?1:-1)}}>
    {item.type==='account'?<><div className="financial-top"><span>{item.value.kind==='cash'?<Wallet/>:item.value.kind==='wallet'?<Smartphone/>:<Landmark/>}{item.value.name}</span><span className="tag">{item.value.kind==='cash'?'Efectivo':item.value.kind==='wallet'?'Billetera':'Banco'}</span></div><small>Saldo registrado</small><div className="financial-value">{money(item.value.balance_cents)}</div><div className="financial-bottom"><span>Dinero disponible</span><button onClick={()=>void loadHistory(item.value.id)}>Ver movimientos →</button></div></>:<><div className="financial-top"><span><CreditCard/>{item.value.name}</span><span className="tag">{item.value.card_type==='debit'?'Débito':'Crédito'}</span></div><small>{item.value.brand} ···· {item.value.last_four}</small><div className="financial-value">{money(item.value.card_type==='debit'?accounts.find(a=>a.id===item.value.account_id)?.balance_cents??0:item.value.debt_cents)}</div><div className="financial-bottom"><span>{item.value.card_type==='debit'?'Saldo vinculado':'Deuda registrada'}</span><button onClick={()=>setCardForm(item.value)}>Editar →</button></div>{item.value.card_type==='credit'&&<small>Límite: {money(item.value.credit_limit_cents)} · Disponible: {money(item.value.credit_limit_cents-item.value.debt_cents)}</small>}</>}
   </div><button className="arrow" aria-label="Siguiente" disabled={items.length<2} onClick={()=>shift(1)}><ChevronRight/></button></div>
   <div className="slider-dots">{items.map((el,i)=><button key={el.id} aria-label={`Ver ${i+1}`} className={i===index?'selected':''} onClick={()=>setSlide(i)}/>)}</div><p className="slider-tip">{index+1} de {items.length} · Desliza o utiliza las flechas</p>
   {item.type==='account'&&<div className="quick-line"><button className="secondary" onClick={()=>setAccountForm(item.value as Account)}><PenLine size={16}/> Editar cuenta</button><button className="secondary" onClick={()=>void loadHistory(item.value.id)}>Ver historial</button></div>}
  </>:<div className="panel empty"><h2>Agrega tu primera cuenta</h2><p>Después podrás vincular tarjetas.</p></div>}
  <div className="money-actions"><button className="primary" onClick={onWithdraw}><ArrowDownUp size={16}/> Retirar efectivo</button><button className="secondary" onClick={onIncome}><Plus size={16}/> Añadir dinero</button></div>
  {history&&<section className="panel"><div className="section-head"><h2>Historial</h2><button className="secondary" onClick={()=>setHistory(null)}>Cerrar</button></div>{history.length?history.map(m=><div className="movement" key={m.id}><div className="grow"><strong>{m.concept}</strong><small>{m.created_at.slice(0,10)} · {m.kind}</small></div><b>{money(m.amount_cents)}</b></div>):<p className="muted">Sin movimientos todavía.</p>}</section>}
  <p className="hint"><CheckCircle2 size={14}/> La tarjeta de débito no duplica el saldo de su cuenta. La tarjeta de crédito muestra deuda, no dinero propio.</p>
  {accountForm!==undefined&&<AccountModal account={accountForm??undefined} onClose={()=>setAccountForm(undefined)} onSaved={saved}/>}
  {cardForm!==undefined&&<CardModal accounts={accounts} card={cardForm??undefined} onClose={()=>setCardForm(undefined)} onSaved={saved}/>}
 </div>
}
