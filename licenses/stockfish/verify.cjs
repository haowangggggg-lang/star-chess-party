// Release-asset verification only; not part of the game's runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json')));
const runtime = path.join(root, 'public/engine');
const loader = path.join(runtime, 'stockfish-19-lite-single.js');
const wasm = path.join(runtime, 'stockfish-19-lite-single.wasm');

for (const record of [...manifest.runtimeFiles, manifest.source.archive, manifest.network.file]) {
  const bytes = fs.readFileSync(path.join(root, record.path));
  assert.equal(bytes.length, record.bytes, `size mismatch: ${record.path}`);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), record.sha256,
    `SHA-256 mismatch: ${record.path}`);
}

async function verifyNetwork() {
  const init = require(loader)();
  const engine = await init({ locateFile: () => wasm, listener() {} });
  const memory = Buffer.from(engine.HEAPU8.buffer);
  const network = fs.readFileSync(path.join(root, manifest.network.file.path));
  const networkOffset = memory.indexOf(network);
  assert.ok(networkOffset >= 0, 'Supplied network not present in initialized WASM');
  return { initialLinearMemoryBytes: memory.length, networkOffset };
}

function verifyUci() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [loader], { stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = [];
    let stderr = '';
    let sawUci = false;
    let sawReady = false;
    let bestmove;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('UCI verification timed out after 15 seconds'));
    }, 15000);
    const send = (command) => child.stdin.write(`${command}\n`);
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    readline.createInterface({ input: child.stdout }).on('line', line => {
      lines.push(line);
      if (line === 'uciok') {
        sawUci = true;
        send('setoption name Threads value 1');
        send('setoption name Hash value 16');
        send('setoption name Ponder value false');
        send('setoption name UCI_LimitStrength value false');
        send('setoption name Skill Level value 0');
        send('isready');
      } else if (line === 'readyok') {
        sawReady = true;
        send('ucinewgame');
        send('position startpos');
        send('go movetime 200');
      } else if (line.startsWith('bestmove ')) {
        bestmove = line.split(' ')[1];
        send('quit');
      }
    });
    child.on('close', code => {
      clearTimeout(timer);
      try {
        assert.equal(code, 0, `engine exited ${code}: ${stderr}`);
        assert.ok(sawUci && sawReady, 'UCI handshake incomplete');
        assert.ok(lines.includes('id name Stockfish 19 Lite WASM'), 'Unexpected engine');
        assert.ok(lines.includes('option name Threads type spin default 1 min 1 max 1'));
        const legalOpeningMoves = new Set([
          ...'abcdefgh'.split('').flatMap(file => [`${file}2${file}3`, `${file}2${file}4`]),
          'b1a3', 'b1c3', 'g1f3', 'g1h3',
        ]);
        assert.ok(legalOpeningMoves.has(bestmove), `Illegal opening result: ${bestmove}`);
        resolve({ uciok: sawUci, readyok: sawReady, bestmove });
      } catch (error) { reject(error); }
    });
    send('uci');
  });
}

(async () => {
  const network = await verifyNetwork();
  const uci = await verifyUci();
  console.log(JSON.stringify({ passed: true, version: manifest.version, ...network, ...uci,
    browserWorkerTested: false, iosSafariTested: false }, null, 2));
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
