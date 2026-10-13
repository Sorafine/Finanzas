import {useState,FormEvent} from 'react';
import Modal from '../../shared/Modal';
import {Account,req,cents} from '../../shared/api';
export default function AccountModal({account,onClose,onSaved}:{account?:Account;onClose:()=>void;onSaved:()=>Promise<void>}){
 const[name,setName]=useState(account?.name??'');const[kind,setKind]=useState<'bank'|'wallet'|'cash'>('bank');const[opening,setOpening]=useState('0');const[busy,setBusy]=useState(false);const[error,setError]=useState('');
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{if(account){await req(`/accounts/${account.id}`,{method:'PATCH',body:JSON.stringify({name:name.trim()})})}else{if(!Number.isFinite(cents(opening))||cents(opening)<0)throw Error('Saldo inválido');await req('/accounts',{method:'POST',body:JSON.stringify({name:name.trim(),kind,opening_cents:cents(opening)})})}await onSaved();onClose()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <Modal title={account?'Editar cuenta':'Agregar cuenta o efectivo'} onClose={onClose}><form className="form" onSubmit={e=>void save(e)}>
 {error&&<p className="error">{error}</p>}
 <label>Nombre<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Ej. BCP Ahorros" autoFocus/></label>
 {!account&&<><label>Tipo<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="bank">Cuenta bancaria</option><option value="wallet">Billetera digital</option><option value="cash">Efectivo</option></select></label><label>Saldo inicial (S/)<input type="number" min="0" step="0.01" value={opening} onChange={e=>setOpening(e.target.value)}/></label></>}
 <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Guardando...':'Guardar cuenta'}</button></div></form></Modal>
}
