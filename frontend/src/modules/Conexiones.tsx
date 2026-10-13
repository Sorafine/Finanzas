import {useEffect,useState} from 'react';
import {req} from '../shared/api';
type Status={configured:boolean;connected:boolean;mode:string};
type Suggestion={gmail_id:string;subject:string;sender:string;snippet:string;date:string;amount_detected:string|null};
export default function Conexiones(){
 const[status,setStatus]=useState<Status|null>(null);const[list,setList]=useState<Suggestion[]>([]);const[error,setError]=useState('');const[notice,setNotice]=useState('');const[busy,setBusy]=useState(false);
 async function refresh(){setStatus(await req<Status>('/google/status'))}
 useEffect(()=>{void refresh().catch(e=>setError(e.message))},[]);
 async function execute(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function read(){const response=await req<{suggestions:Suggestion[]}>('/google/gmail/suggestions');setList(response.suggestions)}
 async function review(item:Suggestion,choice:'dismissed'|'reviewed'){await req('/google/gmail/review',{method:'POST',body:JSON.stringify({gmail_id:item.gmail_id,status:choice})});setList(previous=>previous.filter(m=>m.gmail_id!==item.gmail_id));setNotice('Revisión guardada (no modifica saldos)')}
 return <div className="connections-module"><h2>Conexiones</h2><p className="muted">Activa tus servicios de Google con tu autorización. Gmail solo propone posibles movimientos; no modifica el dinero automáticamente.</p>
 {error&&<p className="error">{error}</p>}{notice&&<p className="success-msg">{notice}</p>}
 <section className="panel"><h3>Cuenta Google</h3><p>{status?.connected?'Conectada':status?.configured?'Preparada para conectar':'Pendiente de configurar credenciales OAuth'}</p>
 <div className="connection-actions">{status?.connected?<button className="secondary" disabled={busy} onClick={()=>void execute(async()=>{await req('/google/disconnect',{method:'POST'});await refresh();setList([])})}>Desconectar</button>:<a className="primary" href="http://localhost:8000/google/connect">Conectar Google</a>}</div>
 <p className="hint">Modo de desarrollo local para una sola persona. No publiques esta versión sin autenticación y almacenamiento protegido de tokens.</p></section>
 <section className="panel"><h3>Gmail · Movimientos detectados</h3><p className="muted">Analiza posibles correos financieros de los últimos 30 días y revísalos antes de cualquier registro.</p>
 <div className="connection-actions"><button className="primary" disabled={!status?.connected||busy} onClick={()=>void execute(read)}>Buscar comprobantes</button></div>
 {list.map(x=><article key={x.gmail_id} className="gmail-suggestion"><strong>{x.subject||'Sin asunto'}</strong><small>{x.sender}</small><p>{x.snippet}</p><b>{x.amount_detected?`Posible importe: S/ ${x.amount_detected}`:'Monto no detectado'}</b><div className="connection-actions"><button className="secondary" disabled={busy} onClick={()=>void execute(()=>review(x,'dismissed'))}>Descartar</button><button className="primary" disabled={busy} onClick={()=>void execute(()=>review(x,'reviewed'))}>Marcar revisado</button></div></article>)}
 <p className="hint">La clasificación y confirmación como ingreso, gasto o retiro se implementará en una siguiente etapa para evitar registros equivocados y duplicados.</p></section>
 <section className="panel"><h3>Google Calendar</h3><p className="muted">Con Google conectado podrás sincronizar recordatorios de vencimientos desde Planes. Cada pago tendrá un identificador único en SQLite para actualizar el mismo evento.</p></section>
 </div>;
}
