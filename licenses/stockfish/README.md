# Stockfish 19 Lite, single-threaded release assets

The files in `../../public/engine/` were copied unchanged from the npm package
`stockfish@19.0.0`. No npm install or lifecycle scripts were run. The complete
package's SHA-512 integrity was checked before extracting the two runtime files.
Their SHA-256 digests also match the official GitHub release assets. All digests
and source locations are recorded in `manifest.json`.

## Corresponding source and build inputs

- Source: `stockfish.js-54fde71d90c7c403964f6cacef48f7bbec495df1.tgz`.
- Immutable upstream archive:
  https://codeload.github.com/nmrugg/stockfish.js/tar.gz/54fde71d90c7c403964f6cacef48f7bbec495df1
- npm `gitHead`: `54fde71d90c7c403964f6cacef48f7bbec495df1`.
- Release tag `v19.0.0` points to merge commit
  `9cb3e5066d48f1a35d792afeda36eff37ae60570`. Both commits have the identical
  Git tree `b86a9b4ce4d5754a8130c65940c998ef1b719a2a`.
- Required lite network: `nn-61e7af4bb97d.nnue`, included here. Its full SHA-256
  matches the Lichess LFS pointer and its bytes were found unchanged in the
  initialized runtime's WebAssembly memory. It is already embedded in the WASM;
  the game does not need to fetch a separate network file.
- Upstream `build.js` expects Emscripten 3.1.7, Node.js and Make. It optionally
  uses `uglify-js` for loader minification but does not pin that tool's version.

To build, extract the archive, copy the included `.nnue` file into its `src/`
directory, activate Emscripten 3.1.7, and run:

```sh
node build.js --single-threaded --lite --no-split -f
```

The archive contains the upstream source, build scripts, authors, and GPL text.
There are no local modifications to the upstream source or runtime files.
Source provenance and runtime digests were verified; a byte-identical rebuild
has **not** been performed. Upstream does not publish a complete reproducible
toolchain lock, so do not describe these files as a verified reproducible build.

The official network endpoint redirected to an HTTP 403 in the preparation
environment. The included network was obtained from the public Lichess LFS
mirror and independently checked as described above. This supplies the build
input locally rather than relying on that endpoint remaining available.

## Browser integration contract

Use the JavaScript file directly as a **classic** Worker, retaining both original
filenames and placing the WASM beside it. Do not bundle the loader as an ES module.
With a project deployed below `/star-chess-party/`, use the application's base
path rather than a root-relative `/engine/` URL. For Vite, for example:

```js
const engine = new Worker(
  `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`,
);
engine.onmessage = ({ data }) => console.log(data);
engine.postMessage('uci');
// After uciok: send the options below, then isready.
// After readyok: send ucinewgame, position ..., then go ... .
```

The loader itself is the worker; there is no additional `.worker.js` file and no
SharedArrayBuffer/COOP/COEP requirement for this flavor. It uses streaming WASM
compilation: the deployed `.wasm` must return HTTP 200 with
`Content-Type: application/wasm`, not a fallback HTML page.

Observed handshake identifies `Stockfish 19 Lite WASM`, reports Threads maximum
1, Skill Level 0–20 and UCI_Elo 1320–3190, then returns `uciok` and `readyok`.
Its default initial WebAssembly linear memory is **128 MiB**, despite the small
download. Terminate the worker when leaving the game. Browser and physical
iOS/iPadOS performance still require testing.

An initial easy-mode experiment can use:

```text
setoption name Threads value 1
setoption name Hash value 16
setoption name Ponder value false
setoption name UCI_LimitStrength value false
setoption name Skill Level value 0
isready
ucinewgame
position startpos
go movetime 200
```

This is a starting configuration, not a measured beginner rating. Keep
UCI_LimitStrength false when using Skill Level because UCI_Elo takes precedence
otherwise. The reported minimum Elo is 1320; assigning 300 or 500 does not create
that rated opponent. Short endgames, adjustable help, and child playtesting are
needed to establish accessible difficulty. Only allow one active search; on
cancel, wait for its bestmove or terminate/recreate the worker before another
position, and reject stale results against the current position revision.

## Verification

From the repository root:

```sh
node licenses/stockfish/verify.cjs
```

This checks the supplied assets' hashes, initializes the exact WASM to confirm
the network bytes, and exercises UCI initialization plus a bounded search. It
does not claim browser transport, deployed MIME type, or iPhone performance.

## Distribution

Stockfish.js is GPLv3. Preserve `Copying.txt`, authors, upstream notices, this
source archive, and the network build input. Make these corresponding sources
available with a prominent source/license link wherever the binary is served.
The source archive is about 0.63 MB and the network about 1.17 MB; both fit in the
repository, so no separate large release attachment is needed.

For this public project, licensing the project's own client code under GPLv3 is
the straightforward compatible release choice; the main task owns that root
license decision. Third-party artwork and other assets retain their individual
licenses and must be listed separately. A separate Worker is not by itself a
claim that GPL obligations do not apply to the surrounding program.
