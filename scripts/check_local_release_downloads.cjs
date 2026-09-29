'use strict';
// Local end-to-end harness: real files/worker/patch/download; only the OS picker is supplied by a fixture.
// It needs the owner's own stock images (nothing here is downloaded or uploaded) and Playwright.
//
//   node scripts/check_local_release_downloads.cjs [--plan] [--release <id>[,<id>...]]... [--all]
//
//   default        every row of the group of each game's default release (today: F v0.5 a/b/c and
//                  Final v0.2 a/b/c)
//   --release ID   exactly these indexed releases (repeatable, comma separated)
//   --all          every indexed release
//   --plan         print what would run (sessions, expected payload requests) and exit; needs neither
//                  Playwright nor the stock images
//
// A shared v3 payload (one file for a font group) is checked in ONE browser session per payload: the
// harness walks a -> b -> c on the same page and requires exactly one network request for the payload,
// which is the client-cache contract of docs/PATCH_FORMAT_V3.md section 17. v1/v2 releases run one
// session per release with one request for their own patch.
//
// Environment: SRWF_SITE_URL (default http://127.0.0.1:8792, serve the repository root),
// SRWF_F_STOCK, SRWF_FIN_STOCK (exact stock images), SRWF_VERIFY_OUT (scratch directory),
// PLAYWRIGHT_PATH, SRWF_BROWSER_EXECUTABLE (optional Chromium-family binary).
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const PATCH_FORMAT_V3 = 'srwf.sparse-byte-delta.v3';
const LANE_PATTERN = /^(srwf-(?:f|final)-\d{8}-v\d+(?:-\d+)+)-([abc])$/;
// The newest notes (shortcut and BGM tables) exist for the local F v0.5 / Final v0.2 rows only.
const LATEST_NOTES_PATTERN = /-20260928-v0-(?:5|2)-[abc]$/;
const CUE_TRACKS = Object.freeze({ 'srwf-f': 4, 'srwf-final': 3 });
const DEFAULT_STOCK = Object.freeze({
  'srwf-f': '/Users/garlicb/Documents/srwf_runtime/rom/mod/stock.img',
  'srwf-final': '/private/tmp/srwf-g103-r116-public-export/fin-stock.img',
});
const STOCK_ENV = Object.freeze({ 'srwf-f': 'SRWF_F_STOCK', 'srwf-final': 'SRWF_FIN_STOCK' });

function groupOf(id) {
  const match = LANE_PATTERN.exec(id);
  return match ? { group: match[1], lane: match[2] } : { group: id, lane: null };
}

function loadCatalog(siteRoot = root) {
  const index = JSON.parse(fs.readFileSync(path.join(siteRoot, 'manifest', 'releases.json'), 'utf8'));
  const entries = index.releases.map((row) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(siteRoot, row.manifest), 'utf8'));
    const { group, lane } = groupOf(row.id);
    return Object.freeze({
      id: row.id,
      game: row.gameId,
      group,
      lane,
      format: manifest.patch.format,
      shared: manifest.patch.format === PATCH_FORMAT_V3,
      variant: manifest.patch.variant ?? null,
      patchUrl: manifest.patch.url,
      patchSha256: manifest.patch.sha256,
      patchSize: manifest.patch.size,
      targetFilename: manifest.target.filename,
      cueFilename: manifest.target.cueFilename,
      targetSha256: manifest.target.sha256,
      targetSize: manifest.target.size,
      cueTracks: CUE_TRACKS[row.gameId],
      latestNotes: LATEST_NOTES_PATTERN.test(row.id),
    });
  });
  return { index, entries };
}

function selectEntries(catalog, { releases = [], all = false } = {}) {
  const { index, entries } = catalog;
  let selected;
  if (releases.length > 0) {
    selected = releases.map((id) => {
      const entry = entries.find((candidate) => candidate.id === id);
      if (!entry) {
        throw new Error(`Release ${id} is not indexed`);
      }
      return entry;
    });
  } else if (all) {
    selected = entries.slice();
  } else {
    const groups = new Set(index.games.map((game) => groupOf(game.defaultReleaseId).group));
    selected = entries.filter((entry) => groups.has(entry.group));
  }
  return selected.sort((left, right) => (
    left.game.localeCompare(right.game)
    || left.group.localeCompare(right.group)
    || String(left.lane).localeCompare(String(right.lane))
  ));
}

// One session per shared payload (all its lanes on one page), one per release otherwise.
function buildSessions(selected) {
  const sessions = [];
  const byPayload = new Map();
  for (const entry of selected) {
    if (!entry.shared) {
      sessions.push({ key: entry.id, shared: false, entries: [entry], expectedPayloadRequests: 1 });
      continue;
    }
    if (entry.lane === null || entry.variant !== entry.lane) {
      throw new Error(`${entry.id}: a v3 row must be a -a/-b/-c release whose variant is its suffix`);
    }
    let session = byPayload.get(entry.patchUrl);
    if (!session) {
      session = { key: entry.patchUrl, shared: true, entries: [], expectedPayloadRequests: 1 };
      byPayload.set(entry.patchUrl, session);
      sessions.push(session);
    }
    const [first] = session.entries;
    if (first && (first.patchSha256 !== entry.patchSha256 || first.patchSize !== entry.patchSize || first.group !== entry.group)) {
      throw new Error(`${entry.id}: rows sharing ${entry.patchUrl} disagree about the payload`);
    }
    session.entries.push(entry);
  }
  return sessions;
}

function stockFor(game, { mustExist }) {
  const stock = process.env[STOCK_ENV[game]] || DEFAULT_STOCK[game];
  if (!stock) {
    throw new Error(`No stock image is configured for ${game}`);
  }
  if (mustExist && !fs.existsSync(stock)) {
    throw new Error(`Stock image for ${game} not found at ${stock}; set ${STOCK_ENV[game]}`);
  }
  return stock;
}

function parseArgs(argv) {
  const options = { plan: false, all: false, releases: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--plan') {
      options.plan = true;
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--release') {
      index += 1;
      if (index >= argv.length) {
        throw new Error('--release needs an id');
      }
      options.releases.push(...argv[index].split(',').filter(Boolean));
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return options;
}

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function runSession(browser, session, { site, out, report }) {
  const [first] = session.entries;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 Android Mobile LocalReleaseVerification',
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const file = document.querySelector('#verification-file').files[0];
      const handle = { kind: 'file', name: file.name, getFile: async () => file };
      return {
        kind: 'directory',
        name: 'Local verification source',
        async *entries() { yield [file.name, handle]; },
        getFileHandle: async () => handle,
      };
    };
  });
  const page = await context.newPage();
  const errors = [];
  let payloadRequests = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith(`/${first.patchUrl}`)) {
      payloadRequests += 1;
    }
  });
  await page.goto(site, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('#gameSelect').disabled);
  await page.selectOption('#gameSelect', first.game);
  await page.waitForFunction(() => !document.querySelector('#releaseSelect').disabled);

  try {
    for (const entry of session.entries) {
      if (await page.locator('#releaseSelect').inputValue() !== entry.group) {
        await page.selectOption('#releaseSelect', entry.group);
      }
      if (entry.lane !== null) {
        // The page disables both selectors while a manifest loads; wait for the load to finish.
        await page.waitForFunction(() => !document.querySelector('#fontSelect').disabled);
        if (await page.locator('#fontSelect').inputValue() !== entry.lane) {
          await page.selectOption('#fontSelect', entry.lane);
        }
      }
      await page.waitForFunction((name) => document.querySelector('#targetName').textContent === name, entry.targetFilename);
      if (await page.locator('#releaseSelect').isDisabled()) {
        throw new Error('Version selector disabled');
      }
      if (entry.latestNotes) {
        await page.locator('#patchNotesToggle').click();
        if (await page.locator('.patch-note-bgm-table').count() !== 2) {
          throw new Error('Missing BGM tables');
        }
        if (!(await page.locator('#patchNotesSummary').innerText()).includes('버튼 + START')) {
          throw new Error('Missing shortcut');
        }
        await page.screenshot({ path: path.join(out, `${entry.id}-notes.png`) });
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
          throw new Error('Horizontal page overflow');
        }
        await page.locator('#patchNotesClose').click();
      }
      await page.evaluate(() => {
        if (document.querySelector('#verification-file')) {
          return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.id = 'verification-file';
        input.hidden = true;
        document.body.append(input);
      });
      await page.locator('#verification-file').setInputFiles(stockFor(entry.game, { mustExist: true }));
      await page.locator('#sourceButton').click();
      await page.waitForFunction(() => !document.querySelector('#patchButton').disabled);
      console.log(entry.id, 'source selected; applying', new Date().toISOString());
      await page.locator('#patchButton').click();
      await page.waitForFunction(
        () => !document.querySelector('#downloadActions').hidden || !document.querySelector('#errorPanel').hidden,
        {},
        { timeout: 600000 },
      );
      if (await page.locator('#errorPanel').isVisible()) {
        throw new Error(await page.locator('#errorPanel').innerText());
      }
      for (const kind of ['Bin', 'Cue']) {
        const wait = page.waitForEvent('download', { timeout: 600000 });
        await page.locator(`#download${kind}Link`).click();
        const download = await wait;
        const file = path.join(out, download.suggestedFilename());
        await download.saveAs(file);
        if (kind === 'Bin') {
          if (await hashFile(file) !== entry.targetSha256) {
            throw new Error('Downloaded BIN hash mismatch');
          }
          if ((await fsp.stat(file)).size !== entry.targetSize) {
            throw new Error('BIN size mismatch');
          }
          await fsp.unlink(file);
        } else {
          const cue = await fsp.readFile(file, 'utf8');
          if (!cue.includes(entry.targetFilename)) {
            throw new Error('CUE filename mismatch');
          }
          if ((cue.match(/TRACK /g) || []).length !== entry.cueTracks) {
            throw new Error('CUE tracks mismatch');
          }
          await fsp.unlink(file);
        }
        await download.delete();
      }
      await page.screenshot({ path: path.join(out, `${entry.id}-complete.png`) });
      if (errors.length) {
        throw new Error(errors.join('\n'));
      }
      report.push({
        id: entry.id,
        format: entry.format,
        sourceSelection: 'PASS',
        patchWorker: 'PASS',
        binDownloadSha256: entry.targetSha256,
        cueDownload: 'PASS',
        latestNotes: entry.latestNotes ? 'PASS' : 'NOT_CHECKED',
      });
      await fsp.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
      console.log(entry.id, 'PASS', new Date().toISOString());
    }
    // The client-cache contract: a shared payload is fetched once however many variants are applied.
    if (payloadRequests !== session.expectedPayloadRequests) {
      throw new Error(`${first.patchUrl} was requested ${payloadRequests} times, expected ${session.expectedPayloadRequests}`);
    }
    report.push({
      payload: first.patchUrl,
      shared: session.shared,
      variants: session.entries.map((entry) => entry.lane),
      payloadRequests,
    });
    await fsp.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(first.patchUrl, `${payloadRequests} request(s) for ${session.entries.length} release(s) PASS`);
  } finally {
    await context.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalog = loadCatalog();
  const selected = selectEntries(catalog, options);
  const sessions = buildSessions(selected);
  if (options.plan) {
    console.log(JSON.stringify({
      releases: selected.map((entry) => entry.id),
      sessions: sessions.map((session) => ({
        payload: session.entries[0].patchUrl,
        shared: session.shared,
        releases: session.entries.map((entry) => entry.id),
        expectedPayloadRequests: session.expectedPayloadRequests,
      })),
    }, null, 2));
    return;
  }
  for (const game of new Set(selected.map((entry) => entry.game))) {
    stockFor(game, { mustExist: true });
  }
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/Users/garlicb/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const site = process.env.SRWF_SITE_URL || 'http://127.0.0.1:8792';
  const out = process.env.SRWF_VERIFY_OUT || '/private/tmp/srwf-g103-r116-browser';
  await fsp.mkdir(out, { recursive: true });
  const launchOptions = { headless: true };
  const executablePath = process.env.SRWF_BROWSER_EXECUTABLE
    || (fs.existsSync('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')
      ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
      : undefined);
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  const browser = await chromium.launch(launchOptions);
  const report = [];
  try {
    for (const session of sessions) {
      await runSession(browser, session, { site, out, report });
    }
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await desktop.goto(site);
    await desktop.waitForFunction(() => !document.querySelector('#gameSelect').disabled);
    await desktop.screenshot({ path: path.join(out, 'desktop.png') });
    console.log(`${selected.length} RELEASE DOWNLOADS PASS`);
  } finally {
    await browser.close();
  }
}

module.exports = { buildSessions, groupOf, loadCatalog, parseArgs, selectEntries };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
