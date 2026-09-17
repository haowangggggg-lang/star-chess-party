import { ChessGame, STARTS } from './game.mjs';
import { GameBoard } from './board.mjs';
import { Computer } from './computer.mjs';
import { loadSaved, saveGame } from './storage.mjs';
import { Sound } from './sound.mjs';

const $=id=>document.getElementById(id);
const BASE=new URL(import.meta.env.BASE_URL,document.baseURI).href;
const NAMES={p:'兵',r:'车',n:'马',b:'象',q:'后',k:'王'};
const DIFFICULTIES={0:'轻松',4:'认真',8:'挑战'};
const game=new ChessGame(),sound=new Sound();
let board,ready=false,busy=false,paused=false,selected=null,suggestion=null,partnerPicking=false,promotion=null,revision=0,skill=0,topView=false,nextStart='classic',lastResult=null,engineError=false,restored=false;
let saveSerial=0;
const computer=new Computer({baseUrl:BASE,onStatus:status=>{
  if(!ready)return;
  if(status==='loading')$('opponent-state').textContent='云朵棋手准备中…';
  if(status==='thinking')$('opponent-state').textContent=game.chess.turn()==='b'?'让我想一想…':'帮你想一招…';
}});

function say(text){$('message').textContent=text;}
function show(id){const d=$(id);if(!d.open)d.showModal();}
function close(id){$(id).close();}
function closeAll(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function enableControls(enabled){document.querySelectorAll('button:not(#retry-graphics), #save-upload').forEach(control=>{control.disabled=!enabled;});}
function envelope(){return{version:2,updatedAt:Date.now(),game:game.snapshot(),settings:{skill,sound:sound.enabled,topView}};}
async function save(){const id=++saveSerial;const ok=await saveGame(envelope());if(id===saveSerial)$('save-state').textContent=ok?'这局已记住，下次接着玩':'本机存档不可用，可在设置里导出';}
function kingInCheck(){return game.chess.isCheck()?game.board().find(p=>p.color===game.chess.turn()&&p.type==='k')?.square:null;}
function lastMove(){const h=game.chess.history({verbose:true}),m=h.at(-1);return m?[m.from,m.to]:[];}
function highlight(){board?.highlight({selected,legal:selected?game.legal(selected).map(m=>m.to):[],lastMove:lastMove(),suggested:suggestion?[suggestion.from,suggestion.to]:[],check:kingInCheck()});}
function render(){
  if(!ready)return;
  const outcome=game.outcome(),white=game.chess.turn()==='w';
  $('turn-title').textContent=paused?'歇一会儿':outcome?'这一局结束啦':partnerPicking?'伙伴来标个建议':busy?(white?'一起想一想…':'云朵在思考'):white?'轮到团团':'轮到云朵棋手';
  $('turn-avatar').src=new URL(`art/${white?'penguin':'cloud-bot'}.webp`,BASE).href;
  $('opponent-name').textContent=`云朵棋手 · ${DIFFICULTIES[skill]}`;
  if(!busy)$('opponent-state').textContent=outcome?'好棋，下次再玩':paused?'等你回来':engineError?'点我，重新请棋手回来':white?'准备好啦，听你的':'该我啦';
  $('opponent').classList.toggle('thinking',busy&&!white);
  $('undo').disabled=!game.chess.history().length;
  $('hint').disabled=busy||!white||!!outcome||paused;
  $('view').setAttribute('aria-pressed',String(topView));
  $('view').setAttribute('aria-label',topView?'切换立体视角':'切换俯视视角');
  $('game-label').textContent=STARTS.find(s=>s.id===game.startId).title;
  const soundToggle=$('sound-toggle');
  soundToggle.querySelector('span').textContent=`声音已${sound.enabled?'开启':'关闭'}`;
  soundToggle.querySelector('img').src=new URL(`icons/speaker-${sound.enabled?'high':'slash'}.svg`,BASE).href;
  soundToggle.setAttribute('aria-pressed',String(sound.enabled));
  $('suggestion-bar').hidden=!suggestion;
  if(suggestion)$('suggestion-text').textContent=`${suggestion.source==='partner'?'伙伴':'云朵'}建议：${NAMES[game.chess.get(suggestion.from)?.type]||'棋子'} ${suggestion.from} → ${suggestion.to}。最后听你的。`;
  document.querySelectorAll('[data-skill]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.skill)===skill)));
  document.querySelectorAll('[data-start]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.start===nextStart)));
  $('game-shell').dataset.turn=white?'white':'black';$('game-shell').dataset.busy=String(busy);$('game-shell').dataset.view=topView?'top':'perspective';
  $('board-stage').setAttribute('aria-busy',String(busy));
  highlight();
}
function resetTransient(){revision++;computer.cancel();selected=null;suggestion=null;partnerPicking=false;promotion=null;busy=false;engineError=false;lastResult=null;}
function start(id){
  if(!ready)return;
  resetTransient();game.newGame(id);nextStart=id;paused=false;closeAll();board.sync(game.board());render();void save();
  say(id==='classic'?'选一枚白棋，小圆点会告诉你能走到哪里。':STARTS.find(s=>s.id===id).description);
}
function revealOutcome(){
  const o=game.outcome();if(!o)return false;
  render();const key=game.chess.fen();if(lastResult===key)return true;lastResult=key;
  $('result-title').textContent=o.winner==='w'?'赢得漂亮！':o.winner==='b'?'云朵这次赢啦':'这局，握个手！';
  $('result-detail').textContent=o.winner==='w'?'你们一起找到了好棋。想再挑战哪一局？':o.winner==='b'?'想换个走法试试？可以回到棋盘悔棋，或再来一局。':o.detail;
  $('choose-next').textContent=game.startId==='classic'?'试个合作小挑战':'去下一个小挑战';
  show('result-dialog');sound.play(o.winner==='w'?'win':'move');say(o.detail);return true;
}
async function commit(from,to,promote='q'){
  if(!ready||busy||paused)return false;
  const move=game.move(from,to,promote);if(!move)return false;
  const rev=revision;busy=true;selected=null;suggestion=null;partnerPicking=false;render();void save();
  sound.play(game.chess.isCheck()?'check':move.captured?'capture':'move');
  await board.animate(move,game.board());
  if(rev!==revision)return true;
  busy=false;render();
  if(revealOutcome())return true;
  if(game.chess.isCheck())say(game.chess.turn()==='w'?'你的王被将军了。找一招保护它。':'将军！看看云朵怎么应对。');
  else if(move.color==='b')say(move.captured?'云朵吃了一枚棋子。一起看看下一步。':`云朵走了${NAMES[move.piece]}：${move.from} → ${move.to}。轮到你啦。`);
  else say(move.captured?'这步吃到了棋子！轮到云朵回应。':'棋子落稳啦，看看云朵怎么走。');
  if(game.chess.turn()==='b')void computerTurn();return true;
}
async function computerTurn(){
  if(!ready||paused||document.hidden||busy||game.chess.turn()!=='b'||game.outcome())return;
  const rev=revision,fen=game.chess.fen();busy=true;engineError=false;render();
  try{
    const uci=await computer.suggest(fen,{skill,movetime:skill===8?600:300});
    if(rev!==revision||fen!==game.chess.fen()||paused||document.hidden)return;
    busy=false;
    if(!uci||!await commit(uci.slice(0,2),uci.slice(2,4),uci[4]||'q'))throw new Error('这步没有落稳，点云朵棋手再试一次。');
  }catch(error){if(rev!==revision)return;busy=false;if(error.name!=='AbortError'){engineError=true;say(error.message);}}finally{if(rev===revision){busy=false;render();}}
}
function pick(sq){
  if(!ready||busy||paused||game.outcome()||game.chess.turn()!=='w')return;
  const piece=game.chess.get(sq);
  if(piece?.color==='w'){
    selected=sq;highlight();say(partnerPicking?`伙伴选中了${NAMES[piece.type]}。再点一个落点，给团团留个建议。`:game.legal(sq).length?`选中了${NAMES[piece.type]}，点一个小圆点落子。`:'这枚棋子暂时没有合法走法，换一枚看看。');return;
  }
  if(!selected){say('先点一枚奶油白棋子，再选它要去的地方。');return;}
  const choices=game.legal(selected).filter(m=>m.to===sq);
  if(!choices.length){say(game.chess.isCheck()?'这步还不能解除将军。试试有提示的格子。':'这步走不到。看看小圆点，或者换一枚棋子。');return;}
  if(partnerPicking){suggestion={from:selected,to:sq,source:'partner'};partnerPicking=false;selected=null;render();say('伙伴的建议留下了。团团来决定：采纳，还是自己想一招？');return;}
  if(choices.some(m=>m.promotion)){promotion={from:selected,to:sq};show('promotion-dialog');return;}
  void commit(selected,sq);
}
function undo(){
  if(!ready||!game.chess.history().length)return;
  resetTransient();game.undoRound();closeAll();board.sync(game.board());render();void save();say('回到你落子之前。这次想怎么走？');
}
async function cloudHint(){
  if(!ready||paused||busy||game.chess.turn()!=='w'||game.outcome())return;close('hint-dialog');
  partnerPicking=false;selected=null;const rev=revision,fen=game.chess.fen();busy=true;render();say('云朵在帮你找一个可以考虑的办法…');
  try{const uci=await computer.suggest(fen,{skill:16,movetime:500});if(rev!==revision||fen!==game.chess.fen())return;if(uci){suggestion={from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4],source:'cloud'};say('建议已经标在棋盘上。要不要走，听你的。');}}
  catch(error){if(rev===revision&&error.name!=='AbortError')say(error.message);}
  finally{if(rev===revision){busy=false;render();}}
}
function pause(){
  if(!ready)return;revision++;computer.cancel();busy=false;paused=true;selected=null;partnerPicking=false;promotion=null;suggestion=null;board.sync(game.board());closeAll();render();void save();show('pause-dialog');
}
function resume(){if(!ready)return;paused=false;close('pause-dialog');render();if(!revealOutcome()&&game.chess.turn()==='b')void computerTurn();else say('回来啦，继续想这一步。');}
function settings(){if(!ready)return;nextStart=game.startId;render();show('settings-dialog');}

document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>close(button.dataset.close)));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d&&d.id!=='promotion-dialog'&&d.id!=='pause-dialog')d.close();}));
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resume();});
$('promotion-dialog').addEventListener('close',()=>{promotion=null;});
$('settings-open').onclick=settings;
$('opponent').onclick=()=>{if(!ready)return;if(engineError&&game.chess.turn()==='b'){void computerTurn();return;}settings();};
$('undo').onclick=undo;
$('hint').onclick=()=>{if(ready&&!busy&&!paused&&game.chess.turn()==='w'&&!game.outcome())show('hint-dialog');};
$('partner-tap').onclick=()=>{if(ready&&!busy&&game.chess.turn()==='w'&&!game.outcome())show('hint-dialog');};
$('view').onclick=()=>{if(!ready)return;topView=!topView;board.setView(topView);render();void save();say(topView?'俯视棋盘，每一格都看得清。':'回到立体视角。');};
$('ask-partner').onclick=()=>{if(!ready||busy||paused||game.chess.turn()!=='w'||game.outcome())return;close('hint-dialog');suggestion=null;selected=null;partnerPicking=true;render();say('把设备递给伙伴：先选一枚白棋，再点它能到的格子。只留下建议，暂时不落子。');};
$('ask-cloud').onclick=cloudHint;
$('accept-suggestion').onclick=()=>{if(!ready||paused||!suggestion||busy)return;const move={...suggestion};if(game.legal(move.from).some(m=>m.to===move.to&&m.promotion)&&!move.promotion){promotion=move;show('promotion-dialog');}else void commit(move.from,move.to,move.promotion||'q');};
$('dismiss-suggestion').onclick=()=>{suggestion=null;selected=null;render();say('当然可以有自己的主意。你来选下一步。');};
document.querySelectorAll('[data-promotion]').forEach(b=>b.onclick=()=>{if(!promotion)return;const move={...promotion};close('promotion-dialog');void commit(move.from,move.to,b.dataset.promotion);});
document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>{skill=Number(b.dataset.skill);render();void save();});
$('starts').replaceChildren(...STARTS.map(s=>{const b=document.createElement('button');b.type='button';b.dataset.start=s.id;b.className='start-option';const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=s.title;span.textContent=s.description;b.append(strong,span);b.onclick=()=>{nextStart=s.id;render();};return b;}));
$('new-game').onclick=()=>{if(!ready)return;close('settings-dialog');if(game.chess.history().length&&!game.outcome())show('newgame-dialog');else start(nextStart);};
$('confirm-new').onclick=()=>start(nextStart);
$('pause').onclick=pause;$('resume').onclick=resume;
$('sound-toggle').onclick=()=>{sound.enabled=!sound.enabled;sound.play();render();void save();};
$('again').onclick=()=>start(game.startId);
$('choose-next').onclick=()=>{const i=STARTS.findIndex(s=>s.id===game.startId);start(STARTS[i>=STARTS.length-1?1:i+1].id);};
$('close-result').onclick=()=>close('result-dialog');
$('retry-graphics').onclick=()=>location.reload();
$('export-save').onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(envelope(),null,2)],{type:'application/json'}));a.href=url;a.download='星棋派对-我的棋局.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('棋局已导出。下次可以在设置里读入。');};
$('import-save').onclick=()=>$('save-upload').click();
$('save-upload').onchange=async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!ready||!file)return;
  let value;
  try{if(file.size>2*1024*1024)throw new Error('存档文件太大了，请选择导出的棋局文件。');value=normalizeSaved(JSON.parse(await file.text()));}
  catch(error){say(`没有读入存档：${error.message} 原来的棋局还在。`);return;}
  resetTransient();game.restore(value.game);readSettings(value.settings);board.sync(game.board());board.setView(topView);paused=false;closeAll();render();void save();say('棋局读入了，我们接着下。');if(!revealOutcome())void computerTurn();
};
function normalizeSaved(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==2)throw new Error('这份存档不是当前版本的棋局。');
  const candidate=new ChessGame().restore(value.game),s=value.settings===undefined?{}:value.settings;
  if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('存档的设置格式不正确。');
  return{game:candidate.snapshot(),settings:{skill:[0,4,8].includes(s.skill)?s.skill:skill,sound:s.sound===true,topView:s.topView===true}};
}
function readSettings(s){skill=s.skill;sound.enabled=s.sound;topView=s.topView;}
document.addEventListener('visibilitychange',()=>{
  if(!ready)return;
  if(document.hidden){revision++;computer.cancel();busy=false;board.sync(game.board());void save();}
  else{render();if(!paused){if(!revealOutcome())void computerTurn();}}
});
window.addEventListener('pagehide',()=>{computer.cancel();if(ready)void save();});
window.addEventListener('pageshow',()=>{if(ready){board.sync(game.board());render();void computerTurn();}});

async function boot(){
  enableControls(false);
  try{
    const saved=await loadSaved();
    if(saved?.version===2){try{const value=normalizeSaved(saved);game.restore(value.game);readSettings(value.settings);restored=true;}catch{say('上次的存档没能完整读入，先从新的一局开始。');}}
    nextStart=game.startId;
    board=new GameBoard($('board-stage'),{baseUrl:BASE,onSquare:pick,onError:error=>{paused=true;computer.cancel();$('render-error').hidden=false;say(error.message);}});
    await board.ready;board.sync(game.board());board.setView(topView);ready=true;enableControls(true);$('loading').hidden=true;render();
    say(restored?'上次的棋局还在，接着玩吧。':'你们执白，云朵执黑。先选一枚棋子试试。');
    if(!revealOutcome())void computerTurn();
    if('serviceWorker'in navigator&&!import.meta.env.DEV){navigator.serviceWorker.register(new URL('sw.js',BASE),{scope:new URL('.',BASE).pathname}).catch(()=>{});}
  }catch(error){$('loading').hidden=true;$('render-error').hidden=false;say('画面没有准备好。请刷新试试，已有棋局会保留。');console.error(error);}
}
void boot();
