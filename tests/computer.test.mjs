import test from 'node:test';
import assert from 'node:assert/strict';
import { Computer } from '../src/computer.mjs';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

class ControlledWorker {
  constructor(url) {
    this.url = url;
    this.commands = [];
    this.listeners = new Map();
    this.terminated = false;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  postMessage(command) {
    assert.equal(this.terminated, false, 'A retired worker must never receive a command');
    this.commands.push(command);
  }
  terminate() { this.terminated = true; }
  emit(line) { for (const fn of this.listeners.get('message') || []) fn({ data: line }); }
  fail() { for (const fn of this.listeners.get('error') || []) fn({ preventDefault() {} }); }
}

function setup(options = {}) {
  const workers = [];
  const computer = new Computer({
    baseUrl: 'https://example.github.io/star-chess-party/',
    workerFactory: url => {
      const worker = new ControlledWorker(url);
      workers.push(worker);
      return worker;
    },
    ...options,
  });
  return { computer, workers };
}

async function ready(worker) {
  worker.emit('uciok');
  worker.emit('readyok');
  await Promise.resolve();
}

test('loads lazily below the deployment base and reuses a completed worker', async t => {
  const { computer, workers } = setup();
  t.after(() => computer.dispose());
  assert.equal(workers.length, 0);
  const first = computer.suggest(FEN, { skill: 4, movetime: 250 });
  assert.equal(workers[0].url.href,
    'https://example.github.io/star-chess-party/engine/stockfish-19-lite-single.js');
  assert.deepEqual(workers[0].commands, ['uci']);
  workers[0].emit('uciok');
  assert.equal(workers[0].commands.includes('setoption name Hash value 16'), true);
  assert.equal(workers[0].commands.includes('setoption name Ponder value false'), true);
  assert.equal(workers[0].commands.some(x => x.startsWith('go ')), false);
  workers[0].emit('readyok');
  await Promise.resolve();
  assert.ok(workers[0].commands.includes('setoption name Skill Level value 4'));
  assert.equal(workers[0].commands.at(-1), 'go movetime 250');
  workers[0].emit('bestmove e2e4 ponder e7e5');
  assert.equal(await first, 'e2e4');

  const second = computer.suggest('7k/5P2/6K1/8/8/8/8/8 w - - 0 1', { skill: 15 });
  await Promise.resolve();
  assert.equal(workers.length, 1);
  assert.ok(workers[0].commands.includes('setoption name Skill Level value 15'));
  workers[0].emit('bestmove f7f8q');
  assert.equal(await second, 'f7f8q');
});

test('a cancelled search cannot complete the next request through a queued old reply', async t => {
  const { computer, workers } = setup();
  t.after(() => computer.dispose());
  const first = computer.suggest(FEN);
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  await ready(workers[0]);
  const queuedOldCallback = [...workers[0].listeners.get('message')][0];
  const second = computer.suggest(FEN);
  assert.equal(workers[0].terminated, true);
  assert.equal(workers.length, 2);
  await cancelled;
  await ready(workers[1]);
  let finished = false;
  second.then(() => { finished = true; });
  queuedOldCallback({ data: 'bestmove a2a4' });
  await Promise.resolve();
  assert.equal(finished, false);
  workers[1].emit('bestmove d2d4');
  assert.equal(await second, 'd2d4');
});

test('AbortSignal cancels initialization, and a later request starts cleanly', async t => {
  const { computer, workers } = setup();
  t.after(() => computer.dispose());
  const controller = new AbortController();
  const pending = computer.suggest(FEN, { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await rejected;
  assert.equal(workers[0].terminated, true);
  const next = computer.suggest(FEN);
  await ready(workers[1]);
  workers[1].emit('bestmove 0000');
  assert.equal(await next, null);
});

test('an initialization timeout rejects and retires the worker instead of hanging', async t => {
  const { computer, workers } = setup({ initTimeoutMs: 20 });
  t.after(() => computer.dispose());
  await assert.rejects(computer.suggest(FEN), /棋手加载超时/);
  assert.equal(workers[0].terminated, true);
  assert.equal(computer.session, null);
});

test('a worker construction failure rejects with a friendly error and permits retry', async t => {
  let failedOnce = false;
  const worker = new ControlledWorker(new URL('https://example.test/engine.js'));
  const { computer } = setup({ workerFactory: () => {
    if (!failedOnce) {
      failedOnce = true;
      throw new Error('Worker unavailable');
    }
    return worker;
  } });
  t.after(() => computer.dispose());
  await assert.rejects(computer.suggest(FEN), /棋手没有加载成功/);
  const retried = computer.suggest(FEN);
  await ready(worker);
  worker.emit('bestmove b1c3');
  assert.equal(await retried, 'b1c3');
});

test('search timeout and runtime failure release resources and permit retry', async t => {
  const { computer, workers } = setup({ searchTimeoutMs: 20 });
  t.after(() => computer.dispose());
  const first = computer.suggest(FEN);
  const timedOut = assert.rejects(first, /棋手思考超时/);
  await ready(workers[0]);
  await timedOut;
  assert.equal(workers[0].terminated, true);
  const second = computer.suggest(FEN);
  const failed = assert.rejects(second, /棋手没有加载成功/);
  workers[1].fail();
  await failed;
  assert.equal(workers[1].terminated, true);
  const third = computer.suggest(FEN);
  await ready(workers[2]);
  workers[2].emit('bestmove (none)');
  assert.equal(await third, null);
});

test('rejects command injection, releases an idle worker, and disposes permanently', async () => {
  const { computer, workers } = setup({ onStatus: () => { throw new Error('UI error'); } });
  await assert.rejects(computer.suggest(`${FEN}\nquit`), /棋局信息/);
  assert.equal(workers.length, 0);
  const pending = computer.suggest(FEN);
  await ready(workers[0]);
  workers[0].emit('bestmove g1f3');
  await pending;
  computer.cancel();
  assert.equal(workers[0].terminated, true);
  computer.dispose();
  await assert.rejects(computer.suggest(FEN), /棋手已关闭/);
});
