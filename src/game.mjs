import { Chess, DEFAULT_POSITION } from 'chess.js';

export const STARTS = Object.freeze([
  {
    id: 'classic',
    title: '完整对局',
    description: '从熟悉的开局出发，和伙伴一起商量每一步。',
    fen: null,
  },
  {
    id: 'queen-rook',
    title: '后车合力',
    description: '车守住退路，让后和车一起完成将死。',
    fen: '6k1/R7/3Q4/8/8/8/8/6K1 w - - 0 1',
  },
  {
    id: 'two-rooks',
    title: '双车收网',
    description: '两辆车轮流封住一排，把黑王的退路慢慢收紧。',
    fen: '6k1/8/1R6/R7/8/8/8/6K1 w - - 0 1',
  },
  {
    id: 'promotion',
    title: '小兵的变身',
    description: '小兵再走一步就能升变，试着用新棋子完成将死。',
    fen: '7k/5P2/6K1/8/8/8/8/8 w - - 0 1',
  },
].map(Object.freeze));

const SNAPSHOT_VERSION = 1;
const SQUARE = /^[a-h][1-8]$/;
const PROMOTIONS = new Set(['q', 'r', 'b', 'n']);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSquare = value => typeof value === 'string' && SQUARE.test(value);

function findStart(id) {
  const start = STARTS.find(candidate => candidate.id === id);
  if (!start) throw new Error(`未知的开局：${String(id)}`);
  return start;
}

function uciMove(move) {
  const result = { from: move.from, to: move.to };
  if (move.promotion) result.promotion = move.promotion;
  return result;
}

function validSavedMove(move) {
  return isRecord(move)
    && Object.keys(move).every(key => ['from', 'to', 'promotion'].includes(key))
    && isSquare(move.from)
    && isSquare(move.to)
    && (!Object.hasOwn(move, 'promotion') || PROMOTIONS.has(move.promotion));
}

/** A complete chess game. Change position through this class; chess is exposed for inspection. */
export class ChessGame {
  #chess;
  #startId;
  #startFen;

  constructor(snapshot = null) {
    if (snapshot === null) this.newGame();
    else this.restore(snapshot);
  }

  get chess() { return this.#chess; }
  get startId() { return this.#startId; }

  newGame(startId = 'classic') {
    const start = findStart(startId);
    const chess = new Chess(start.fen ?? DEFAULT_POSITION);
    this.#chess = chess;
    this.#startId = start.id;
    this.#startFen = chess.fen();
    return this;
  }

  legal(square) {
    if (!isSquare(square) || this.#chess.isGameOver()) return [];
    return this.#chess.moves({ square, verbose: true });
  }

  move(from, to, promotion = 'q') {
    if (!isSquare(from) || !isSquare(to) || !PROMOTIONS.has(promotion)
      || this.#chess.isGameOver()) return null;
    try {
      return this.#chess.move({ from, to, promotion });
    } catch {
      return null;
    }
  }

  /** Undo a pending white move, or a complete white/black round, to white's turn. */
  undoRound() {
    if (!this.#chess.undo()) return false;
    if (this.#chess.turn() === 'b') this.#chess.undo();
    return true;
  }

  snapshot() {
    return {
      version: SNAPSHOT_VERSION,
      startId: this.#startId,
      startFen: this.#startFen,
      moves: this.#chess.history({ verbose: true }).map(uciMove),
      fen: this.#chess.fen(),
    };
  }

  /** Validate and replay in isolation. A failed restore never changes this game. */
  restore(snapshot) {
    if (!isRecord(snapshot) || snapshot.version !== SNAPSHOT_VERSION
      || typeof snapshot.startId !== 'string' || typeof snapshot.startFen !== 'string'
      || typeof snapshot.fen !== 'string' || !Array.isArray(snapshot.moves)) {
      throw new Error('存档格式或版本不正确。');
    }
    const start = findStart(snapshot.startId);
    const chess = new Chess(start.fen ?? DEFAULT_POSITION);
    const startFen = chess.fen();
    if (snapshot.startFen !== startFen) throw new Error('存档的初始棋局与开局不一致。');

    for (const [index, savedMove] of snapshot.moves.entries()) {
      if (!validSavedMove(savedMove) || chess.isGameOver()) {
        throw new Error(`存档第 ${index + 1} 步不合法。`);
      }
      let played;
      try {
        played = chess.move(savedMove);
      } catch {
        throw new Error(`存档第 ${index + 1} 步不合法。`);
      }
      if (played.promotion !== savedMove.promotion) {
        throw new Error(`存档第 ${index + 1} 步的升变信息不一致。`);
      }
    }
    if (chess.fen() !== snapshot.fen) throw new Error('存档棋谱与最终棋局不一致。');

    this.#chess = chess;
    this.#startId = start.id;
    this.#startFen = startFen;
    return this;
  }

  outcome() {
    const chess = this.#chess;
    if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? 'b' : 'w';
      return {
        type: 'checkmate',
        winner,
        title: winner === 'w' ? '白方获胜' : '黑方获胜',
        detail: `${winner === 'w' ? '黑' : '白'}王正在被将军，已经没有合法的解围办法。`,
      };
    }
    if (chess.isStalemate()) return {
      type: 'stalemate', winner: null, title: '这局和棋',
      detail: '轮到走棋的一方没有被将军，却已经无棋可走，这叫逼和。',
    };
    if (chess.isThreefoldRepetition()) return {
      type: 'threefold', winner: null, title: '这局和棋',
      detail: '相同局面已出现三次，这局按三次重复和棋结束。',
    };
    if (chess.isInsufficientMaterial()) return {
      type: 'insufficient', winner: null, title: '这局和棋',
      detail: '双方剩下的棋子已经无法完成将死。',
    };
    if (chess.isDrawByFiftyMoves()) return {
      type: 'fifty-move', winner: null, title: '这局和棋',
      detail: '双方各走了五十步，没有吃子或移动兵，这局按五十步规则和棋结束。',
    };
    if (chess.isDraw()) return {
      type: 'draw', winner: null, title: '这局和棋', detail: '这局已经达到和棋条件。',
    };
    return null;
  }

  board() {
    return this.#chess.board().flat().filter(Boolean)
      .map(({ square, type, color }) => ({ square, type, color }));
  }
}
