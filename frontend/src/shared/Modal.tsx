import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
export default function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  useEffect(()=>{ const fn=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};document.addEventListener('keydown',fn);return()=>document.removeEventListener('keydown',fn)},[onClose]);
  return <div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-heading"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20}/></button></div>
      {children}
    </section>
  </div>;
}
