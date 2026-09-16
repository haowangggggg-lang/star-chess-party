import { levels, names, symbols, newState, legalMoves, move, hint, square } from './engine.mjs';
const $=id=>document.getElementById(id);
let state=newState(),selected='r',history=[],mode='solo',turn=0,hinted=null,sound=false,audioCtx=null,lastMove=null;
const completed=new Set();
function say(text){$('message').textContent=text;}
function chime(win=false){if(!sound)return;try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();audioCtx.resume();(win?[523,659,784,1047]:[659,880]).forEach((f,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(audioCtx.destination);const t=audioCtx.currentTime+i*.1;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.09,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+.23);o.start(t);o.stop(t+.25);});}catch{sound=false;$('sound').textContent='音效不可用';}}
function updateTurn(){const isPartner=mode==='relay'&&turn===1;$('turn-name').textContent=isPartner?'轮到伙伴来走':'队长来选路';$('quick-mode').textContent=mode==='relay'?(isPartner?'伙伴接棒！ · 点这里交回队长':'队长先走！ · 接着轮到伙伴'):'队长来选路 · 点这里切换接力';$('quick-mode').setAttribute('aria-label',mode==='relay'?'切换为我来指挥':'切换为我们接力');$('turn-info').textContent=mode==='relay'?'每走一步换一个人。一起看看，再出发。':'想自己走，或邀请伙伴帮忙，都可以。';$('turn-dot').style.background=isPartner?'var(--pink)':'var(--mint)';$('solo').setAttribute('aria-pressed',String(mode==='solo'));$('relay').setAttribute('aria-pressed',String(mode==='relay'));}
function render(){
 const level=levels[state.level];$('level-title').textContent=level.title;$('island-no').textContent=`ISLAND 0${state.level+1}`;$('stars').textContent=`★ ${state.collected.length} / ${level.stars.length}`;$('stars').setAttribute('aria-label',`已收集 ${state.collected.length} 颗，共 ${level.stars.length} 颗星星`);$('objective').textContent=level.subtitle;$('rule').textContent=level.tip;$('undo').disabled=!history.length;
 document.querySelectorAll('[data-level]').forEach(b=>{b.setAttribute('aria-current',String(Number(b.dataset.level)===state.level));b.classList.toggle('done',completed.has(Number(b.dataset.level)));});
 $('pieces').innerHTML=state.pieces.map(p=>`<button class="pick-piece ${p.color}" data-piece="${p.id}" aria-pressed="${p.id===selected}" aria-label="选择${names[p.type]}，当前位置${p.at}"><span class="mini-piece" aria-hidden="true">${symbols[p.type]}</span><span>${names[p.type]}${p.at===p.goal?' · 到家':''}</span></button>`).join('');
 const allowed=legalMoves(state,selected);let html='';
 for(let y=7;y>=0;y--)for(let x=0;x<8;x++){
  const at=square(x,y),p=state.pieces.find(p=>p.at===at),star=level.stars.find(s=>s.at===at&&!state.collected.includes(at)),portal=state.pieces.find(p=>p.goal===at),block=level.blocks.includes(at);
  let cls=`cell ${(x+y)%2===0?'dark':''}`;if(p?.id===selected)cls+=' selected';if(allowed.includes(at))cls+=' potential';if(star||portal)cls+=' has-item';if(hinted===at)cls+=' hinted';if(lastMove===at)cls+=' pop';
  const label=[at,p?names[p.type]:'',star?`${state.level===2?(star.owner==='r'?'车的':'象的'):''}星星`:'',portal?`${names[portal.type]}的传送门`:'',block?'小山，不可停留':'',allowed.includes(at)?'可到达':''].filter(Boolean).join('，');
  html+=`<button class="${cls}" data-at="${at}" aria-label="${label}" ${p?.id===selected?'aria-pressed="true"':''}>${portal?`<span class="portal ${portal.color} ${p?.id===portal.id?'arrived':''}" aria-hidden="true">◎</span>`:''}${star?`<span class="star ${state.level===2?(star.owner==='r'?'mint':'pink'):''}" aria-hidden="true">★</span>`:''}${block?'<span class="block" aria-hidden="true">⛰</span>':''}${p?`<span class="piece ${p.color}" aria-hidden="true">${symbols[p.type]}</span>`:''}</button>`;
 }
 $('board').innerHTML=html;updateTurn();
}
function start(level){if(!Number.isInteger(level)||level<0||level>=levels.length)throw Error('请选择现有小岛');state=newState(level);selected=state.pieces[0].id;history=[];turn=0;hinted=null;lastMove=null;render();say(level===2?'两位棋友，先各选一枚棋子吧。':'落到全部星星上，再回同色传送门。');}
function play(id,to){
 const next=move(state,id,to);if(!next)return false;
 history.push({state:structuredClone(state),selected,turn});const collected=next.collected.length>state.collected.length;state=next;selected=id;hinted=null;lastMove=to;if(mode==='relay')turn=1-turn;render();
 const p=state.pieces.find(p=>p.id===id);say(collected?'找到一颗星星！下一步想去哪儿？':p.at===p.goal&&state.collected.length<levels[state.level].stars.length?'传送门在这里，星星还在等我们。':mode==='relay'?(turn?'轮到伙伴啦，一起看看下一步。':'轮到队长啦，你来决定。'):'这一步落稳了。接着探索吧！');
 if(collected)chime();
 if(state.won){completed.add(state.level);render();say('星星全部送到，传送门亮起来了！');$('win-title').textContent=state.level===2?'三座小岛，一起点亮！':'这一岛，我们搞定了！';$('win-copy').textContent=state.level===2?'今天的星际快递完成啦。想再玩哪一岛，听你的。':'星星已经全部送到。接下来，听你的。';$('next').textContent=state.level===2?'回云朵岛再出发':'去下一座岛';$('win-dialog').showModal();chime(true);}
 return true;
}
$('board').addEventListener('click',e=>{const cell=e.target.closest('[data-at]');if(!cell)return;const at=cell.dataset.at,p=state.pieces.find(p=>p.at===at);if(p){selected=p.id;hinted=null;lastMove=null;render();say(`选中${names[p.type]}，小圆点是能走到的地方。`);$('board').querySelector(`[data-at="${at}"]`)?.focus({preventScroll:true});return;}if(!play(selected,at)){say(levels[state.level].blocks.includes(at)?'这格是小山。车和象要绕路，马可以跳过去。':'这一步走不到。试试有小圆点的格子。');}else $('board').querySelector(`[data-at="${at}"]`)?.focus({preventScroll:true});});
$('board').addEventListener('keydown',e=>{const keys={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]},d=keys[e.key],at=e.target.dataset.at;if(!d||!at)return;e.preventDefault();const x=at.charCodeAt(0)-97+d[0],y=Number(at[1])-1+d[1];if(x>=0&&x<8&&y>=0&&y<8)$('board').querySelector(`[data-at="${square(x,y)}"]`)?.focus();});
$('pieces').addEventListener('click',e=>{const b=e.target.closest('[data-piece]');if(b){selected=b.dataset.piece;hinted=null;lastMove=null;render();say(`现在由${names[state.pieces.find(p=>p.id===selected).type]}出发。`);}});
document.querySelectorAll('[data-level]').forEach(b=>b.addEventListener('click',()=>start(Number(b.dataset.level))));
$('undo').addEventListener('click',()=>{const prev=history.pop();if(!prev)return;state=prev.state;selected=prev.selected;turn=prev.turn;hinted=null;lastMove=null;render();say('回到上一步。换个想法试试。');});
$('restart').addEventListener('click',()=>start(state.level));
$('hint').addEventListener('click',()=>{hinted=hint(state,selected);lastMove=null;render();const p=state.pieces.find(p=>p.id===selected),done=p.at===p.goal&&levels[state.level].stars.filter(s=>s.owner===selected).every(s=>state.collected.includes(s.at));say(hinted?`可以考虑 ${hinted} 这个格子。想不想走，由你决定。`:done?'这位棋友已经到家，换另一枚棋子试试。':'请伙伴先挪开挡路的棋子，再一起找找路。');});
function setMode(value){mode=value;turn=0;updateTurn();say(mode==='relay'?'接力开始：队长先走，伙伴下一步接上。':'队长来指挥，想要帮忙时随时邀请伙伴。');}
$('quick-mode').addEventListener('click',()=>setMode(mode==='solo'?'relay':'solo'));
$('solo').addEventListener('click',()=>setMode('solo'));$('relay').addEventListener('click',()=>setMode('relay'));
$('sound').addEventListener('click',()=>{sound=!sound;$('sound').textContent=`音效：${sound?'开':'关'}`;$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');if(sound)chime();});
$('invite').addEventListener('click',()=>$('help-dialog').showModal());$('help-close').addEventListener('click',()=>$('help-dialog').close());
$('rest').addEventListener('click',()=>$('rest-dialog').showModal());for(const id of ['resume','rest-close'])$(id).addEventListener('click',()=>$('rest-dialog').close());
$('next').addEventListener('click',()=>{$('win-dialog').close();start((state.level+1)%levels.length);});$('again').addEventListener('click',()=>{$('win-dialog').close();start(state.level);});$('finish').addEventListener('click',()=>{$('win-dialog').close();$('rest-dialog').showModal();});
start(0);
