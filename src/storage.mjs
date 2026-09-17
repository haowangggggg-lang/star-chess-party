const KEY='star-chess-party:v2';
let database;
function open(){
  if(database)return database;
  database=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('无法使用本机存档'));return;}
    const request=indexedDB.open('star-chess-party',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('saves');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('本机存档正在被另一页使用'));
  });return database;
}
async function readDB(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('saves','readonly');const r=tx.objectStore('saves').get('current');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
export async function loadSaved(){
  let a=null,b=null;try{a=JSON.parse(localStorage.getItem(KEY));}catch{}try{b=await readDB();}catch{}
  return [a,b].filter(Boolean).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0]||null;
}
export async function saveGame(value){
  let backup=false;try{localStorage.setItem(KEY,JSON.stringify(value));backup=true;}catch{}
  try{const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(value,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});return true;}catch{return backup;}
}
