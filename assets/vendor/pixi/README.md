# PixiJS local dependency

Version: 8.22.0, from the npm `pixi.js` package, MIT licensed (see LICENSE).

`pixi-8.22.0.min.mjs` starts from the standalone ESM distribution. Upstream SHA-256: `66257bc46776898bf8c54daaed402ed8f9ac109379c47b2dfa8aa048544d2953`. Local adapted SHA-256: `d1b98b8574bea51021e07453566797bba6334e2bb7941de6e434a9d738371be7`.

The local adaptation removes the four Basis/KTX transcoder CDN defaults. Both URL config objects are frozen with null fields. Their setters, worker initializers and public compressed-texture loaders fail explicitly before starting a worker or fetching a file. Those optional formats are unsupported here; the battle player supplies RGBA `BufferImageSource` textures directly. `Application`, `MeshSimple`, `Texture`, `BufferImageSource` and `Graphics` remain available.

`unsafe-eval-csp.mjs` comes from `dist/packages/unsafe-eval.js`. Its wrapper was adapted to import the local ESM namespace and export the polyfills instead of assigning a browser global. The official polyfills replace generated eval functions; the page CSP is unchanged. The source-map comment was removed.

Adapted polyfill SHA-256: `6b9443330689333b2e3f45b4d9ee702da44993f311ad21e6bf090307820b339e`.

The player does not use remote asset loading. Pictures come from the user's authenticated disc session and are passed as typed pixel buffers.

The repository verifier pins each module's exact path and bytes and parses its real static ESM dependencies using the local Node/V8 parser without linking or executing the module. The standalone module imports nothing; the polyfill imports only the adjacent standalone file. Known license, XML namespace, console and shader/base64 URL-like text is inventoried for those exact pins. No CDN default is exempted, and the unmodified same-origin CSP, network-write scan and browser-module reference checks still apply. Unapproved vendor files or changed bytes receive ordinary static checks and fail closed.
