export const names = { r: '车', b: '象', n: '马' };
export const symbols = { r: '♜', b: '♝', n: '♞' };
export const levels = [
  { title: '云朵快递', short: '云朵岛', subtitle: '绕过小山，把星星带到传送门。', pieces: [{ id:'r', type:'r', at:'a2', goal:'g8', color:'mint' }], stars:[{at:'c2',owner:'r'},{at:'c5',owner:'r'},{at:'g5',owner:'r'}], blocks:['e2','e3','e4','e6','b7'], tip:'车沿横线或竖线走，不能穿过小山。' },
  { title: '跳跳星河', short: '跳跳岛', subtitle: '小马能跳过小山。找一条自己的路！', pieces:[{id:'n',type:'n',at:'b1',goal:'h8',color:'pink'}], stars:[{at:'c3',owner:'n'},{at:'e4',owner:'n'},{at:'d6',owner:'n'},{at:'f7',owner:'n'}], blocks:['c5','e6','f3','d2','f5'], tip:'马走“日”字：一个方向两格，再向旁边一格。' },
  { title: '双人星际快递', short: '伙伴岛', subtitle: '一人选一枚棋子，一起把两扇门点亮。', pieces:[{id:'r',type:'r',at:'a1',goal:'h7',color:'mint'},{id:'b',type:'b',at:'b2',goal:'g7',color:'pink'}], stars:[{at:'a6',owner:'r'},{at:'g6',owner:'r'},{at:'e5',owner:'b'},{at:'c7',owner:'b'}], blocks:['d2','d3','d5','f3','f4'], tip:'车找青绿色星星，象找粉色星星。最后各自回到同色传送门。' },
];
export const xy = at => [at.charCodeAt(0)-97, Number(at[1])-1];
export const square = (x,y) => String.fromCharCode(97+x)+(y+1);
export function newState(level=0) { return {level,pieces:levels[level].pieces.map(p=>({...p})),collected:[],moves:0,won:false}; }
export function legalMoves(state,id) {
  const p=state.pieces.find(p=>p.id===id); if(!p || state.won)return [];
  const level=levels[state.level], [x,y]=xy(p.at), result=[];
  const unavailable=at=>level.blocks.includes(at)||state.pieces.some(q=>q.id!==id&&q.at===at);
  const directions=p.type==='r'?[[1,0],[-1,0],[0,1],[0,-1]]:p.type==='b'?[[1,1],[1,-1],[-1,1],[-1,-1]]:[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
  for(const [dx,dy] of directions) for(let step=1;step<=(p.type==='n'?1:7);step++) {
    const nx=x+dx*step,ny=y+dy*step;if(nx<0||nx>7||ny<0||ny>7)break;
    const at=square(nx,ny);if(unavailable(at))break;result.push(at);
  }
  return result;
}
export function move(state,id,to) {
  if(!legalMoves(state,id).includes(to))return null;
  const next=structuredClone(state),p=next.pieces.find(p=>p.id===id);p.at=to;next.moves++;
  const star=levels[state.level].stars.find(s=>s.at===to&&s.owner===id);
  if(star&&!next.collected.includes(to))next.collected.push(to);
  next.won=next.collected.length===levels[state.level].stars.length&&next.pieces.every(p=>p.at===p.goal);
  return next;
}
export function hint(state,id) {
  if(state.won)return null;
  const piece=state.pieces.find(p=>p.id===id);if(!piece)return null;
  let targets=levels[state.level].stars.filter(s=>s.owner===id&&!state.collected.includes(s.at)).map(s=>s.at);
  if(!targets.length)targets=[piece.goal];
  if(targets.includes(piece.at))return null;
  const seen=new Set([piece.at]),queue=[{at:piece.at,first:null}];
  for(let i=0;i<queue.length;i++){
    const node=queue[i],probe={...state,pieces:state.pieces.map(p=>p.id===id?{...p,at:node.at}:p)};
    for(const at of legalMoves(probe,id))if(!seen.has(at)){
      const first=node.first||at;if(targets.includes(at))return first;
      seen.add(at);queue.push({at,first});
    }
  }
  return null;
}
