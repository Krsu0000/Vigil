import {useId,useRef,useState} from 'react';

/** Keep the native filename; retry does not depend on a second change event. */
export function FileImport({label,className,onImport}:{label:string;className?:string;onImport:(file:File)=>Promise<string>}){
  const id=useId(),request=useRef(0),[file,setFile]=useState<File>(),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[failed,setFailed]=useState(false);
  const load=async(selected:File)=>{
    const version=++request.current;setFile(selected);setBusy(true);setFailed(false);setStatus(`${selected.name} · 불러오는 중…`);
    try{const result=await onImport(selected);if(request.current===version)setStatus(`${selected.name} · ${result}`);}
    catch(error){if(request.current===version){setFailed(true);setStatus(`${selected.name} · 불러오기 실패: ${error instanceof Error?error.message:String(error)}`);}}
    finally{if(request.current===version)setBusy(false);}
  };
  return <div className={`maker-file-import ${className??''}`} aria-busy={busy}>
    <label>{label}<input aria-label={label} aria-describedby={id} type="file" accept="application/json,.json" onChange={e=>{const selected=e.currentTarget.files?.[0];if(selected)void load(selected);}}/></label>
    <p id={id} role={failed?'alert':'status'} className={failed?'maker-error':''}>{status||'JSON 파일을 선택하면 바로 불러옵니다.'}</p>
    {file&&<button type="button" disabled={busy} onClick={()=>{void load(file);}}>같은 파일 다시 불러오기</button>}
  </div>;
}

export async function readImportJson(file:File,maxMb:number):Promise<unknown>{
  if(file.size>maxMb*1024*1024)throw new Error(`파일은 ${maxMb}MB 이하로 불러와 주세요.`);
  const text=(await file.text()).replace(/^\uFEFF/,'');
  if(!text.trim())throw new Error('빈 파일입니다. 내보낸 JSON 파일을 선택해 주세요.');
  try{return JSON.parse(text);}
  catch{throw new Error('JSON 형식이 올바르지 않습니다. 파일 내용을 확인하거나 제작 화면에서 다시 내보내 주세요.');}
}
