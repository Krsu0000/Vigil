import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export function GameDialog({title,onClose,children,className=''}:{title:string;onClose:()=>void;children:ReactNode;className?:string}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current!;dialog.showModal();return()=>dialog.close();},[]);
  return <dialog ref={ref} className={`game-dialog ${className}`} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}}>
    <header><h2>{title}</h2><button onClick={onClose} autoFocus aria-label={`${title} 닫기`}>닫기</button></header>{children}
  </dialog>;
}
