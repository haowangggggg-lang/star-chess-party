const ENGINE_PATH = 'engine/stockfish-19-lite-single.js';

function abortError() {
  const error = new Error('这次计算已取消。');
  error.name = 'AbortError';
  return error;
}

function engineError(message, cause) {
  const error = new Error(message);
  if (cause !== undefined) error.cause = cause;
  return error;
}

/** One lazy classic Worker. Cancelling retires it so UCI replies cannot cross games. */
export class Computer {
  constructor({
    baseUrl = './',
    onStatus = () => {},
    workerFactory = (url) => new globalThis.Worker(url),
    initTimeoutMs = 15000,
    searchTimeoutMs = 8000,
  } = {}) {
    const documentBase = globalThis.document?.baseURI
      || globalThis.location?.href || 'http://localhost/';
    this.engineUrl = new URL(ENGINE_PATH, new URL(baseUrl, documentBase));
    this.onStatus = onStatus;
    this.workerFactory = workerFactory;
    this.initTimeoutMs = initTimeoutMs;
    this.searchTimeoutMs = searchTimeoutMs;
    this.session = null;
    this.request = null;
    this.disposed = false;
  }

  async suggest(fen, { skill = 0, movetime = 300, signal } = {}) {
    if (this.disposed) throw engineError('棋手已关闭，请重新进入棋局。');
    if (this.request) this.cancel();
    if (typeof fen !== 'string' || !fen.trim() || /[\r\n\0]/.test(fen)) {
      throw engineError('棋局信息不完整，暂时无法计算。');
    }
    if (signal?.aborted) throw abortError();
    if (!Number.isFinite(skill) || !Number.isFinite(movetime)) {
      throw engineError('棋手的计算设置无效，请再试一次。');
    }

    let resolve;
    let reject;
    const result = new Promise((yes, no) => { resolve = yes; reject = no; });
    const request = {
      fen: fen.trim(),
      skill: Math.max(0, Math.min(20, Math.round(skill))),
      movetime: Math.max(50, Math.min(5000, Math.round(movetime))),
      signal, resolve, reject, settled: false, session: null, timer: null,
    };
    request.abort = () => {
      if (this.request === request) this.cancel();
    };
    this.request = request;
    signal?.addEventListener('abort', request.abort, { once: true });
    void this.begin(request);
    return result;
  }

  async begin(request) {
    try {
      if (!this.session) this.status('loading');
      if (this.request !== request) return;
      const session = this.session || this.createSession();
      request.session = session;
      await session.ready;
      if (this.request !== request || session.closed) return;
      session.search = request;
      request.timer = setTimeout(() => {
        this.failSession(session, engineError('棋手思考超时了，请再试一次。'));
      }, this.searchTimeoutMs);
      this.status('thinking');
      if (this.request !== request || session.closed) return;
      // All commands run in the worker; the main thread never searches positions.
      for (const command of [
        'ucinewgame',
        'setoption name UCI_LimitStrength value false',
        `setoption name Skill Level value ${request.skill}`,
        `position fen ${request.fen}`,
        `go movetime ${request.movetime}`,
      ]) session.worker.postMessage(command);
    } catch (error) {
      if (request.settled) return;
      const friendly = error?.name === 'AbortError' ? error
        : engineError(error?.message?.startsWith('棋手') ? error.message
          : '棋手暂时没有准备好，请再试一次。', error);
      if (request.session) this.retireSession(request.session, friendly);
      this.settle(request, { error: friendly });
      this.status(friendly.name === 'AbortError' ? 'idle' : 'error');
    }
  }

  createSession() {
    const session = { closed: false, phase: 'uci', initialized: false, search: null };
    session.ready = new Promise((resolve, reject) => {
      session.resolve = resolve;
      session.reject = reject;
    });
    this.session = session;
    try {
      session.worker = this.workerFactory(this.engineUrl);
      session.message = event => this.receive(session, event.data);
      session.error = event => {
        event.preventDefault?.();
        this.failSession(session, engineError('棋手没有加载成功，请再试一次。', event.error));
      };
      session.messageError = () => {
        this.failSession(session, engineError('棋手回复异常，请再试一次。'));
      };
      session.worker.addEventListener('message', session.message);
      session.worker.addEventListener('error', session.error);
      session.worker.addEventListener('messageerror', session.messageError);
      session.timer = setTimeout(() => {
        this.failSession(session, engineError('棋手加载超时，请检查网络后再试一次。'));
      }, this.initTimeoutMs);
      session.worker.postMessage('uci');
    } catch (error) {
      this.retireSession(session, engineError('棋手没有加载成功，请再试一次。', error));
    }
    return session;
  }

  receive(session, data) {
    if (session.closed || this.session !== session || typeof data !== 'string') return;
    for (const text of data.split(/[\r\n]+/)) {
      if (session.closed || this.session !== session) return;
      const line = text.trim();
      try {
        if (line === 'uciok' && session.phase === 'uci') {
          session.phase = 'ready';
          for (const command of [
            'setoption name Threads value 1',
            'setoption name Hash value 16',
            'setoption name Ponder value false',
            'setoption name UCI_LimitStrength value false',
            'isready',
          ]) session.worker.postMessage(command);
        } else if (line === 'readyok' && session.phase === 'ready') {
          clearTimeout(session.timer);
          session.initialized = true;
          session.phase = 'idle';
          session.resolve();
          this.status('ready');
        } else if (/^info string CRITICAL ERROR/.test(line)) {
          this.failSession(session, engineError('棋手无法分析这个棋局，请重新开始这一局。'));
        } else if (line.startsWith('bestmove ') && session.search) {
          const request = session.search;
          if (this.request !== request) return;
          const move = line.split(/\s+/)[1];
          if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)
            && move !== '(none)' && move !== '0000') {
            this.failSession(session, engineError('棋手返回的走法不完整，请再试一次。'));
            return;
          }
          session.search = null;
          this.settle(request, { value: move === '(none)' || move === '0000' ? null : move });
          this.status('idle');
        }
      } catch (error) {
        this.failSession(session, engineError('棋手暂时无法继续，请再试一次。', error));
      }
    }
  }

  failSession(session, error) {
    if (session.closed || this.session !== session) return;
    const request = this.request;
    this.retireSession(session, error);
    if (request && (!request.session || request.session === session)) {
      this.settle(request, { error });
    }
    this.status('error');
  }

  retireSession(session, error = abortError()) {
    if (session.closed) return;
    session.closed = true;
    clearTimeout(session.timer);
    if (this.session === session) this.session = null;
    if (session.worker) {
      session.worker.removeEventListener('message', session.message);
      session.worker.removeEventListener('error', session.error);
      session.worker.removeEventListener('messageerror', session.messageError);
      session.worker.terminate();
    }
    if (!session.initialized) session.reject(error);
  }

  settle(request, { error, value }) {
    if (request.settled) return;
    request.settled = true;
    clearTimeout(request.timer);
    request.signal?.removeEventListener('abort', request.abort);
    if (this.request === request) this.request = null;
    if (error) request.reject(error);
    else request.resolve(value);
  }

  cancel() {
    const error = abortError();
    if (this.request) this.settle(this.request, { error });
    // Also releases an idle worker, useful when the tab becomes hidden.
    if (this.session) this.retireSession(this.session, error);
    this.status('idle');
  }

  dispose() {
    this.disposed = true;
    this.cancel();
  }

  status(value) {
    // A UI observer must not prevent worker cleanup or leave promises pending.
    try { this.onStatus(value); } catch { /* Observer owns its display errors. */ }
  }
}
