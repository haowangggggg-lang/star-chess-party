import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess, DEFAULT_POSITION } from 'chess.js';
import { ChessGame, STARTS } from '../src/game.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
function play(game, ...moves) {
  for (const notation of moves) {
    const result = game.move(notation.slice(0, 2), notation.slice(2, 4), notation[4] ?? 'q');
    assert.ok(result, `Expected legal move ${notation} from ${game.chess.fen()}`);
  }
  return game;
}

test('starts a complete game and rejects illegal moves without changing history', () => {
  const game = new ChessGame();
  assert.ok(game.chess instanceof Chess);
  assert.equal(game.startId, 'classic');
  assert.equal(game.chess.fen(), DEFAULT_POSITION);
  assert.equal(game.board().length, 32);
  assert.equal(game.board().filter(piece => piece.type === 'k').length, 2);
  assert.deepEqual(game.legal('e2').map(move => move.to).sort(), ['e3', 'e4']);
  assert.equal(game.legal('e2')[0].piece, 'p');
  const before = game.snapshot();
  for (const [from, to] of [['e2', 'e5'], ['e7', 'e5'], ['a1', 'a8'], ['e1', 'e3'], ['z2', 'a3']]) {
    assert.equal(game.move(from, to), null);
  }
  assert.equal(game.move('e2', 'e4', 'k'), null);
  assert.deepEqual(game.legal('invalid'), []);
  assert.deepEqual(game.snapshot(), before);
  assert.equal(game.outcome(), null);
});

test('castling moves king and rook, round undo restores castling rights', () => {
  const game = play(new ChessGame(), 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5');
  const before = game.snapshot();
  const castle = game.move('e1', 'g1');
  assert.equal(castle.san, 'O-O');
  assert.equal(game.chess.get('g1').type, 'k');
  assert.equal(game.chess.get('f1').type, 'r');
  assert.equal(game.chess.get('h1'), undefined);
  assert.equal(game.undoRound(), true);
  assert.deepEqual(game.snapshot(), before);
  assert.ok(game.legal('e1').some(move => move.to === 'g1'));
});

test('castling cannot pass through an attacked square', () => {
  const game = play(new ChessGame(), 'e2e4', 'd7d5', 'g1f3', 'c8f5', 'f1c4', 'f5e4', 'd2d3', 'e4d3');
  assert.equal(game.chess.isCheck(), false);
  assert.equal(game.chess.isAttacked('f1', 'b'), true);
  assert.equal(game.chess.isAttacked('g1', 'b'), false);
  const before = game.snapshot();
  assert.equal(game.move('e1', 'g1'), null);
  assert.deepEqual(game.snapshot(), before);
});

test('en passant captures the adjacent pawn and survives save/restore', () => {
  const game = play(new ChessGame(), 'e2e4', 'a7a6', 'e4e5', 'd7d5');
  const restored = new ChessGame(copy(game.snapshot()));
  const capture = restored.move('e5', 'd6');
  assert.equal(capture.captured, 'p');
  assert.ok(capture.flags.includes('e'));
  assert.equal(restored.chess.get('d5'), undefined);
  assert.equal(restored.chess.get('d6').color, 'w');
  assert.equal(restored.undoRound(), true);
  assert.deepEqual(restored.snapshot(), game.snapshot());
  play(game, 'g1f3', 'a6a5');
  assert.equal(game.move('e5', 'd6'), null, 'en passant expires after the next turn');
});

test('promotion offers four legal pieces; queen mates, knight draws', () => {
  const game = new ChessGame().newGame('promotion');
  assert.deepEqual(game.legal('f7').map(move => move.promotion).sort(), ['b', 'n', 'q', 'r']);
  const promotion = game.move('f7', 'f8');
  assert.equal(promotion.promotion, 'q');
  assert.equal(game.chess.get('f8').type, 'q');
  assert.equal(game.outcome().type, 'checkmate');
  assert.equal(game.outcome().winner, 'w');
  assert.equal(new ChessGame(copy(game.snapshot())).outcome().winner, 'w');
  assert.equal(game.undoRound(), true);
  assert.equal(game.outcome(), null);
  assert.equal(game.chess.get('f7').type, 'p');
  assert.equal(game.move('f7', 'f8', 'n').promotion, 'n');
  assert.equal(game.outcome().type, 'insufficient');
  assert.equal(game.outcome().winner, null);
});

test('checkmate stops play and undo reopens the previous white turn', () => {
  const game = play(new ChessGame(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.equal(game.outcome().type, 'checkmate');
  assert.equal(game.outcome().winner, 'b');
  assert.deepEqual(game.legal('a2'), []);
  const before = game.snapshot();
  assert.equal(game.move('a2', 'a3'), null);
  assert.deepEqual(game.snapshot(), before);
  assert.equal(game.undoRound(), true);
  assert.equal(game.chess.turn(), 'w');
  assert.equal(game.chess.history().length, 2);
  assert.equal(game.outcome(), null);
});

test('stalemate is a draw instead of a win for the stronger side', () => {
  const game = play(new ChessGame().newGame('queen-rook'), 'd6f4', 'g8h8', 'f4f7');
  assert.equal(game.chess.isCheck(), false);
  assert.equal(game.chess.moves().length, 0);
  assert.equal(game.outcome().type, 'stalemate');
  assert.equal(game.outcome().winner, null);
  assert.equal(new ChessGame(copy(game.snapshot())).outcome().type, 'stalemate');
});

test('threefold repetition remains detectable across saved full history', () => {
  const game = play(new ChessGame(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1');
  assert.equal(game.outcome(), null);
  const restored = new ChessGame(copy(game.snapshot()));
  play(restored, 'f6g8');
  assert.equal(restored.outcome().type, 'threefold');
  assert.equal(restored.outcome().winner, null);
  const terminal = restored.snapshot();
  assert.equal(new Chess(terminal.fen).isThreefoldRepetition(), false, 'a FEN alone loses repetition history');
  const reopened = new ChessGame(copy(terminal));
  assert.equal(reopened.outcome().type, 'threefold');
  assert.deepEqual(reopened.snapshot(), terminal);
  assert.equal(reopened.undoRound(), true);
  assert.equal(reopened.chess.turn(), 'w');
  assert.equal(reopened.chess.history().length, 6);
  assert.equal(reopened.outcome(), null);
});

test('restore rejects malformed, illegal or inconsistent data transactionally', () => {
  const game = play(new ChessGame(), 'e2e4', 'e7e5');
  const valid = game.snapshot();
  const invalid = [
    null, [], {},
    { ...valid, version: 2 },
    { ...valid, startId: 'missing' },
    { ...valid, startId: 'promotion' },
    { ...valid, startFen: STARTS.find(start => start.id === 'promotion').fen },
    { ...valid, fen: DEFAULT_POSITION },
    { ...valid, moves: [] },
    { ...valid, moves: 'e2e4' },
    { ...valid, moves: [{ from: 'a1', to: 'a8' }] },
    { ...valid, moves: [{ from: 'e2', to: 'e4', promotion: 'k' }] },
    { ...valid, moves: [{ from: 'e2', to: 'e4', promotion: 'q' }, valid.moves[1]] },
    { ...valid, moves: [{ ...valid.moves[0], unexpected: true }, valid.moves[1]] },
  ];
  const originalChess = game.chess;
  for (const snapshot of invalid) {
    assert.throws(() => game.restore(snapshot));
    assert.strictEqual(game.chess, originalChess);
    assert.deepEqual(game.snapshot(), valid);
  }
  assert.throws(() => new ChessGame({ ...valid, fen: 'invalid' }));
  const detached = game.snapshot();
  detached.moves[0].to = 'a8';
  assert.deepEqual(game.snapshot(), valid);
  const repeated = play(new ChessGame(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8').snapshot();
  repeated.moves.push({ from: 'e2', to: 'e4' });
  assert.throws(() => game.restore(repeated), /第 9 步/);
  assert.deepEqual(game.snapshot(), valid);
});

test('undo handles a pending computer response and a complete round', () => {
  const game = new ChessGame();
  assert.equal(game.undoRound(), false);
  play(game, 'e2e4');
  assert.equal(game.chess.turn(), 'b');
  assert.equal(game.undoRound(), true);
  assert.equal(game.chess.fen(), DEFAULT_POSITION);
  play(game, 'e2e4', 'e7e5');
  assert.equal(game.undoRound(), true);
  assert.equal(game.chess.fen(), DEFAULT_POSITION);
  assert.equal(game.undoRound(), false);
});

test('switching starts resets history; every short ending has a real mate', () => {
  const game = play(new ChessGame(), 'e2e4', 'e7e5');
  for (const start of STARTS) {
    game.newGame(start.id);
    assert.equal(game.startId, start.id);
    assert.equal(game.chess.fen(), start.fen ?? DEFAULT_POSITION);
    assert.deepEqual(game.chess.history(), []);
    assert.equal(game.chess.turn(), 'w');
    assert.equal(game.outcome(), null);
    const kings = game.board().filter(piece => piece.type === 'k');
    assert.deepEqual(kings.map(king => king.color).sort(), ['b', 'w']);
    assert.equal(game.chess.isAttacked(kings.find(king => king.color === 'b').square, 'w'), false);
    assert.deepEqual(new ChessGame(copy(game.snapshot())).snapshot(), game.snapshot());
  }
  const before = game.snapshot();
  assert.throws(() => game.newGame('unknown'));
  assert.deepEqual(game.snapshot(), before);

  for (const target of ['d8', 'b8']) {
    game.newGame('queen-rook');
    assert.ok(game.move('d6', target));
    assert.equal(game.outcome().type, 'checkmate', 'accept different correct mating moves');
  }
  game.newGame('two-rooks');
  play(game, 'b6b7');
  assert.equal(game.outcome(), null);
  const replies = game.chess.moves({ verbose: true });
  assert.ok(replies.length > 0);
  for (const reply of replies) {
    const branch = new ChessGame(copy(game.snapshot()));
    assert.ok(branch.move(reply.from, reply.to));
    assert.ok(branch.move('a5', 'a8'));
    assert.equal(branch.outcome().type, 'checkmate');
    assert.equal(branch.outcome().winner, 'w');
  }
  game.newGame('promotion');
  play(game, 'f7f8q');
  assert.equal(game.outcome().type, 'checkmate');
  assert.equal(game.outcome().winner, 'w');
});
