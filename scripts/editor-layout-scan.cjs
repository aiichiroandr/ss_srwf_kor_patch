// Layout scan for the patch page and the local editor screen.
//
// One self-contained script without dependencies, network access or storage. It runs
//   * pasted whole into a browser console (it defines `window.srwfLayoutScan`),
//   * evaluated in an automated page (for example the Claude browser pane),
//   * required by Node (CommonJS), where only the pure helpers are useful (the measuring functions need a page).
// The caller sets the window size (or the device emulation). The scan only measures what is on screen right now and
// never edits a value, sends an event or stores anything.
//
//   srwfLayoutScan.scan(options?)          -> { viewport, counts, violations, metrics }        one state of the page
//   srwfLayoutScan.walkEditor(options?)    -> every record of the open editor on every page, scanned   (async)
//   srwfLayoutScan.fontCurve(rows)         -> is the type monotonic over the window sizes that were scanned?
//   srwfLayoutScan.RULES                   -> the rule ids and what each one means
//
// Rules (each violation names the rule, the element and the measured numbers):
//   text-clipped          a box cuts its own text or content (scroll size > client size) without being a list that
//                         scrolls, and is not an allowed name ellipsis; a number box too narrow for its largest value
//                         (the digits of `max`, or of `min` when it is negative: 65535, 9999, 255, 99, 15, -128 ...), which
//                         is measured by writing that value and restoring the old one in the same task, without events
//   ellipsis-no-title     a name cut with an ellipsis that does not carry its full text in a title
//   select-option-clipped the selected option, or the longest option, of a select is wider than the select
//   word-broken           a word of a button, caption or heading is split over two lines (a label that breaks
//                         in the middle of a word, like a tab name cut into two lines)
//   overlap               two different text, control or picture boxes overlap. The one allowed overlap is the small
//                         circled "i" over the top right corner of the control it explains (superscriptZone px each way).
//                         A panel over a dimmed page (options.overlays, e.g. the editor's save progress) covers the
//                         page on purpose: its boxes are not compared with the boxes under it
//   outside-container     a text, control or picture leaves the border box of its parent
//   clipped-by-ancestor   a box is cut by an ancestor that clips (overflow other than visible) and is not a list
//   inner-scroll          an element other than the allowed lists scrolls
//   outside-viewport      a box leaves the window (boxes inside an allowed list are judged by the list)
//   doc-scroll            the document is taller or wider than the window
//   font-floor            computed font size below the floor of its role: weapon names 15px, primary text 14px,
//                         everything else (labels, notes, marks) 12px; nothing at 11px or below
//   visual-too-small      a picture (face, unit image) whose longer side is drawn smaller than its floor
//   card-mismatch         the cards of one desktop row differ in width or height
// A rule that has nothing to measure in the current state is not reported.
//
// Example (console):  srwfLayoutScan.scan().counts
//                     await srwfLayoutScan.walkEditor({ includeUnused: true })   (the editor must be open)

(function (globalScope) {
  "use strict";

  const VERSION = 3;

  const RULES = Object.freeze({
    "text-clipped": "A box cuts its own text, or a number box cannot show its largest value.",
    "ellipsis-no-title": "A name is cut with an ellipsis and does not carry its full text in a title.",
    "select-option-clipped": "A select cannot show its selected or its longest option.",
    "word-broken": "A word of a button, caption or heading is split over two lines.",
    overlap: "Two different text, control or picture boxes overlap.",
    "outside-container": "A box leaves the border box of its parent.",
    "clipped-by-ancestor": "A box is cut by an ancestor that clips and is not a list.",
    "inner-scroll": "An element other than the allowed lists scrolls.",
    "outside-viewport": "A box leaves the window.",
    "doc-scroll": "The document is taller or wider than the window.",
    "font-floor": "Computed font size is below the floor of its role.",
    "visual-too-small": "A picture is drawn smaller than its floor.",
    "card-mismatch": "The cards of one desktop row differ in width or height.",
  });

  // Roles are matched in this order; text that matches none of them is a label (labelMin).
  const DEFAULT_ROLES = Object.freeze([
    {
      name: "weaponName",
      min: 15,
      selector: [
        ".is-weapons .record-option-name",
        ".weapon-entry-name",
        "#weaponEditorPanel .record-title",
      ].join(","),
    },
    {
      name: "primary",
      min: 14,
      selector: [
        ".record-title",
        ".record-option-name",
        ".editor-search",
        ".editor-game-screen input[data-editor-field]",
        ".editor-game-screen select",
        ".owner-chip-name",
        ".pilot-mental-name",
        ".pilot-runtime-skill",
        ".pilot-runtime-skill-name",
        ".pilot-skill-name",
        ".primary-button",
        ".file-button",
        ".editor-primary-button",
        ".editor-tab",
        ".editor-page-button",
        ".mode-switch-button",
        "#gameSelect",
        "#releaseSelect",
        "#fontSelect",
        "h2",
        "h3",
      ].join(","),
    },
  ]);

  // Elements whose font size is recorded per window size for the type curve (the first visible match of each).
  // One fixed element per key, so that every window size measures the same thing.
  const DEFAULT_PROBES = Object.freeze({
    unitValue: "#unitEditorPanel input[data-editor-field=\"armor\"]",
    unitCaption: "#unitEditorPanel .unit-core-grid .editor-field-name",
    pilotValue: "#pilotEditorPanel input[data-editor-field=\"atk\"]",
    weaponValue: "#weaponEditorPanel input[data-editor-field=\"attack\"]",
    panelHeading: "#unitEditorPanel .unit-terrain-panel h4",
    unitListName: "#unitRecordList .record-option-name",
    weaponListName: "#weaponRecordList .record-option-name",
    recordTitle: "#unitStatsHeading",
    tab: "#unitTabButton",
    cardHeading: "#source-heading",
    cardText: "#sourceHelp",
    gameSelect: "#gameSelect",
    patchButton: "#patchButton",
  });

  const DEFAULTS = Object.freeze({
    root: null,
    // Skipped on purpose: the skip link waits outside the window until it is focused.
    exclude: Object.freeze([".skip-link"]),
    tolerance: 1,
    labelMin: 12,
    roles: DEFAULT_ROLES,
    probes: DEFAULT_PROBES,
    // Lists that are meant to scroll (a mouse wheel or a finger moves them); everything else must fit.
    allowedScrollers: Object.freeze([
      ".record-list",
      ".unit-weapon-list",
      ".owner-chip-list",
      ".pilot-skill-schedule",
      ".editor-gameplay-help",
      // the readers: the patch notes window (its text and its row of picture sets) and the picture viewer
      ".patch-note-dialog",
      ".patch-note-body",
      ".patch-note-list",
      ".patch-image-stage",
    ]),
    // Names and filesystem metadata use one stable row; the full text must remain in a title.
    ellipsisNames: Object.freeze([".record-title", ".font-preview > span", ".file-selection strong", ".file-selection div > span"]),
    // Boxes that keep their place while invisible (a revert button) count when they sit over other content.
    reserved: Object.freeze([".editor-diff-reset"]),
    superscript: ".editor-help-button",
    superscriptZone: 10,
    // Panels shown over a dimmed page (the page under them is covered on purpose while they show).
    overlays: Object.freeze([".editor-feedback"]),
    checkMaxValues: true,
    visuals: Object.freeze([
      { selector: "#pilotPreviewImage", minSide: 64 },
      { selector: "#unitPreviewImage", minSide: 64 },
    ]),
    // The cards of one row: the patch mode's three cards and the editor mode's three cards (only a row on screen counts).
    equalCards: Object.freeze([
      Object.freeze(["#releaseRegion", "#sourceRegion", "#patchRegion"]),
      Object.freeze(["#releaseRegion", "#editorSourceRegion", "#editorEntryRegion"]),
    ]),
    maxViolations: 400,
  });

  // Short texts whose words must never break in the middle (buttons, tabs, captions, headings, chips).
  const WORD_SELECTOR = "button, summary, [role=tab], [role=button], label, h1, h2, h3, h4, th, .editor-field-name, .zone-state, .state-chip, .notice-badge";
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "OPTION", "OPTGROUP", "HEAD", "META", "LINK", "TITLE"]);
  const CONTROL_SELECTOR = "button, input:not([type=hidden]), select, textarea, a[href], summary, [role=button], [role=option], [role=listbox], [tabindex]:not([tabindex='-1'])";
  const VISUAL_TAGS = new Set(["CANVAS", "IMG", "SVG", "svg", "PROGRESS"]);

  // ---------- small helpers ----------

  function round(value, digits = 1) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function box(rect) {
    return { l: rect.left, t: rect.top, r: rect.right, b: rect.bottom };
  }

  function r1(b) {
    return [round(b.l), round(b.t), round(b.r), round(b.b)];
  }

  function describe(el) {
    if (!el || !el.tagName) return "?";
    let out = el.tagName.toLowerCase();
    if (el.id) out += `#${el.id}`;
    if (typeof el.className === "string" && el.className.trim()) {
      out += `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`;
    }
    const field = el.getAttribute && (el.getAttribute("data-editor-field") || el.getAttribute("data-grade-field"));
    if (field) out += `[field=${field}]`;
    const holder = el.closest ? el.closest(".game-panel, section[id], .record-pane, .editor-footer, header, footer, dialog") : null;
    if (holder && holder !== el) {
      let h = holder.tagName.toLowerCase();
      if (holder.id) h += `#${holder.id}`;
      else if (typeof holder.className === "string" && holder.className.trim()) h += `.${holder.className.trim().split(/\s+/)[0]}`;
      out = `${h} > ${out}`;
    }
    return out;
  }

  function shortText(el) {
    const value = el.value !== undefined && el.tagName !== "BUTTON" ? String(el.value) : "";
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return (value || text).slice(0, 28);
  }

  function matchesAny(el, selectors) {
    for (const selector of selectors) if (el.matches(selector)) return true;
    return false;
  }

  // Width of a text in the computed font of an element (canvas measurement).
  let sharedContext = null;
  function textWidth(doc, style, text) {
    if (!sharedContext || sharedContext.canvas.ownerDocument !== doc) sharedContext = doc.createElement("canvas").getContext("2d");
    const context = sharedContext;
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if ("letterSpacing" in context) context.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
    return context.measureText(text).width;
  }

  // ---------- pure geometry (no DOM) ----------

  // Does `leaf` stick out of `container` by more than the tolerance (plus an allowance for the superscript i)?
  function leavesBox(leaf, container, tolerance, allowance = 0) {
    return leaf.l < container.l - tolerance - allowance
      || leaf.r > container.r + tolerance + allowance
      || leaf.t < container.t - tolerance - allowance
      || leaf.b > container.b + tolerance + allowance;
  }

  // Overlapping pairs among boxes { r: {l,t,r,b}, ctx, ... }. A sweep over the top edges keeps thousands of boxes
  // cheap. Boxes in different scroll contexts never meet. Callbacks:
  //   same(a, b)        both boxes come from one element (skipped)
  //   holds(a, b)       one box contains the other as its child (skipped)
  //   superscript(box)  the small circled i, which may cover the top right corner of a control
  //   corner(box)       the box is a control (a text box is never a host for the i)
  // Returns [{ a, b, w, h }].
  function findOverlaps(boxes, options) {
    const { tolerance, zone, same, holds, superscript, corner } = options;
    const sorted = [...boxes].sort((a, b) => a.r.t - b.r.t);
    const found = [];
    for (let i = 0; i < sorted.length; i += 1) {
      const a = sorted[i];
      for (let j = i + 1; j < sorted.length; j += 1) {
        const b = sorted[j];
        if (b.r.t >= a.r.b - tolerance) break;
        if (same(a, b) || a.ctx !== b.ctx) continue;
        const w = Math.min(a.r.r, b.r.r) - Math.max(a.r.l, b.r.l);
        const h = Math.min(a.r.b, b.r.b) - Math.max(a.r.t, b.r.t);
        if (w <= tolerance || h <= tolerance) continue;
        if (holds(a, b)) continue;
        const aSup = superscript(a);
        const bSup = superscript(b);
        if (aSup !== bSup) {
          const host = aSup ? b : a;
          const right = Math.min(a.r.r, b.r.r);
          const top = Math.max(a.r.t, b.r.t);
          if (corner(host) && w <= zone && h <= zone && right >= host.r.r - zone && top <= host.r.t + zone) continue;
        }
        found.push({ a, b, w, h });
      }
    }
    return found;
  }

  // The type curve. rows: [{ width, height, sizes: { key: px } }] scanned at different window sizes. A window that is
  // at least as wide AND at least as tall as another never gets smaller type for the same key (a partial order: a
  // short landscape window and a tall narrow one are not compared with each other). Also reports each key's range.
  function fontCurve(rows, tolerance = 0.05) {
    const problems = [];
    const ranges = {};
    for (const row of rows) {
      for (const [key, px] of Object.entries(row.sizes || {})) {
        if (!Number.isFinite(px)) continue;
        const range = ranges[key] || (ranges[key] = { min: Infinity, max: -Infinity, at: {} });
        range.min = Math.min(range.min, px);
        range.max = Math.max(range.max, px);
        range.at[`${row.width}x${row.height}`] = px;
      }
    }
    for (const a of rows) {
      for (const b of rows) {
        if (a === b || a.width > b.width || a.height > b.height) continue;
        if (a.width === b.width && a.height === b.height) continue;
        for (const [key, px] of Object.entries(a.sizes || {})) {
          const other = b.sizes ? b.sizes[key] : undefined;
          if (!Number.isFinite(px) || !Number.isFinite(other)) continue;
          if (other + tolerance < px) {
            problems.push({ key, smaller: `${b.width}x${b.height}`, px: other, than: `${a.width}x${a.height}`, was: px });
          }
        }
      }
    }
    return { monotonic: problems.length === 0, problems, ranges };
  }

  // ---------- the scan ----------

  function resolveRoot(doc, root) {
    if (root && typeof root !== "string") return root;
    if (typeof root === "string") return doc.querySelector(root);
    const dialogs = [...doc.querySelectorAll("dialog[open]")];
    if (dialogs.length) return dialogs[dialogs.length - 1];
    return doc.body;
  }

  function scan(userOptions = {}) {
    const options = { ...DEFAULTS, ...userOptions };
    const doc = options.document || globalScope.document;
    const win = doc.defaultView;
    const root = resolveRoot(doc, options.root);
    if (!root) throw new Error("layout scan: root not found");
    const tol = options.tolerance;
    const roles = options.roles;
    const excludeSelector = options.exclude.length ? options.exclude.join(",") : null;
    const scrollerSelector = options.allowedScrollers.join(",");
    const styleCache = new Map();
    const styleOf = (el) => {
      let style = styleCache.get(el);
      if (!style) {
        style = win.getComputedStyle(el);
        styleCache.set(el, style);
      }
      return style;
    };

    const violations = [];
    const counts = {};
    let total = 0;
    const fail = (rule, el, detail, text) => {
      total += 1;
      counts[rule] = (counts[rule] || 0) + 1;
      if (violations.length < options.maxViolations) {
        violations.push({ rule, target: describe(el), text: text ?? (el ? shortText(el) : ""), detail });
      }
    };

    const innerWidth = win.innerWidth;
    const innerHeight = win.innerHeight;

    // 1. The rendered elements (display:none subtrees are skipped; reserved boxes stay although invisible).
    const elements = [root];
    const walker = doc.createTreeWalker(root, 1 /* SHOW_ELEMENT */, {
      acceptNode(node) {
        if (SKIP_TAGS.has(node.tagName)) return 2;
        if (excludeSelector && node.matches(excludeSelector)) return 2;
        // what a closed <details> holds is not on screen
        if (node.parentElement && node.parentElement.tagName === "DETAILS" && !node.parentElement.open && node.tagName !== "SUMMARY") return 2;
        const style = styleOf(node);
        if (style.display === "none") return 2;
        if (style.visibility === "hidden" && !matchesAny(node, options.reserved)) return 2;
        // a box that clips its content to a pixel or two is visually hidden on purpose (the sr-only pattern)
        if (node !== root && (style.overflowX !== "visible" || style.overflowY !== "visible")) {
          const r = node.getBoundingClientRect();
          if (r.width <= 2 || r.height <= 2) return 2;
        }
        return 1;
      },
    });
    while (walker.nextNode()) elements.push(walker.currentNode);

    // The nearest allowed scroller around an element (a scroller's own box belongs to its parent's context).
    const contextCache = new Map();
    const contextOf = (el) => {
      if (contextCache.has(el)) return contextCache.get(el);
      let result = null;
      if (el.matches(scrollerSelector)) result = el;
      else if (el !== root && el.parentElement) result = contextOf(el.parentElement);
      contextCache.set(el, result);
      return result;
    };
    const boxContextOf = (el) => (el.matches(scrollerSelector) && el !== root && el.parentElement ? contextOf(el.parentElement) : contextOf(el));

    const boxes = []; // overlap candidates
    const leaves = []; // containment candidates
    const fontSizes = {}; // role -> { min, max, count }
    const noteFont = (role, px) => {
      const entry = fontSizes[role] || (fontSizes[role] = { min: Infinity, max: 0, count: 0 });
      entry.min = Math.min(entry.min, px);
      entry.max = Math.max(entry.max, px);
      entry.count += 1;
    };
    const roleOf = (el) => {
      for (const role of roles) if (el.matches(role.selector)) return role;
      return null;
    };

    for (const el of elements) {
      const style = styleOf(el);
      const rect = el.getBoundingClientRect();
      const reservedHidden = style.visibility === "hidden";
      if (rect.width <= 1.5 && rect.height <= 1.5) continue;
      const isControl = el.matches(CONTROL_SELECTOR);
      const isVisual = VISUAL_TAGS.has(el.tagName);
      const fontPx = parseFloat(style.fontSize);

      // rectangles of the element's own rendered text lines
      const textRects = [];
      if (!reservedHidden) {
        for (const node of el.childNodes) {
          if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
          const range = doc.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5) textRects.push(r);
        }
      }
      const insideControl = !isControl && el.parentElement !== null && el.parentElement.closest(CONTROL_SELECTOR) !== null;
      // a word of a short text split over two lines
      if (textRects.length > 1 && el.matches(WORD_SELECTOR)) {
        let broken = null;
        for (const node of el.childNodes) {
          if (broken || node.nodeType !== 3) continue;
          const text = node.nodeValue;
          const words = /[^\s]{2,}/g;
          let match;
          while (!broken && (match = words.exec(text)) !== null) {
            const range = doc.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const tops = [];
            for (const r of range.getClientRects()) {
              if (r.width > 0.5 && !tops.some((top) => Math.abs(top - r.top) < 2)) tops.push(r.top);
            }
            if (tops.length > 1) broken = match[0];
          }
        }
        if (broken) fail("word-broken", el, { word: broken, lines: textRects.length });
      }
      const formControl = el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA";

      // font floor: every element that renders text
      if (!reservedHidden && (textRects.length > 0 || (formControl && el.type !== "checkbox" && el.type !== "radio"))) {
        const role = roleOf(el);
        const floor = role ? role.min : options.labelMin;
        noteFont(role ? role.name : "label", fontPx);
        if (fontPx + 0.01 < floor) fail("font-floor", el, { px: round(fontPx, 2), floor, role: role ? role.name : "label" });
      }

      const context = boxContextOf(el);
      const leafContext = contextOf(el);
      if ((isControl || isVisual) && rect.width > 0 && rect.height > 0) {
        boxes.push({ el, kind: isVisual ? "visual" : "control", r: box(rect), ctx: context, reserved: reservedHidden });
      }
      // The glyph box can be taller than the line box; the line box is what the layout reserves.
      const lineHeight = parseFloat(style.lineHeight);
      // text that its own box clips (an ellipsis) is visible only inside that box
      const clipsOwn = !isControl && (style.overflowX !== "visible" || style.overflowY !== "visible");
      const textBoxes = textRects.map((r) => {
        const b = box(r);
        if (clipsOwn) {
          b.l = Math.max(b.l, rect.left);
          b.r = Math.min(b.r, rect.right);
          b.t = Math.max(b.t, rect.top);
          b.b = Math.min(b.b, rect.bottom);
        }
        if (Number.isFinite(lineHeight) && lineHeight > 0 && r.height > lineHeight) {
          const cut = (r.height - lineHeight) / 2;
          b.t += cut;
          b.b -= cut;
        }
        return b;
      });
      if (textBoxes.length && !isControl && !insideControl) {
        for (const b of textBoxes) boxes.push({ el, kind: "text", r: b, ctx: leafContext, reserved: false });
      }
      if (!reservedHidden && (isControl || isVisual || textBoxes.length)) {
        const own = [];
        if ((isControl || isVisual) && rect.width > 0 && rect.height > 0) own.push(box(rect));
        for (const b of textBoxes) own.push(b);
        leaves.push({ el, own, context: isControl || isVisual ? context : leafContext, superscript: el.matches(options.superscript) });
      } else if (reservedHidden && matchesAny(el, options.reserved) && rect.width > 0) {
        leaves.push({ el, own: [box(rect)], context, superscript: false, reserved: true });
      }
    }

    // 2. Boxes that cut or scroll their content (inputs and selects are measured separately below).
    for (const el of elements) {
      const style = styleOf(el);
      const tag = el.tagName;
      if (style.visibility === "hidden" || tag === "HTML" || tag === "BODY") continue;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || VISUAL_TAGS.has(tag)) continue;
      if (el.matches(scrollerSelector)) continue;
      // overflow: clip cuts without making a scroll container; what it really cuts is reported per box below
      // (clipped-by-ancestor). Its scroll size also counts invisible hit layers, which are not content.
      if (style.overflowX === "clip" && style.overflowY === "clip") continue;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 2 || ch <= 2) continue;
      const sw = el.scrollWidth;
      const sh = el.scrollHeight;
      const overX = style.overflowX !== "visible" && sw - cw > tol;
      const overY = style.overflowY !== "visible" && sh - ch > tol;
      if (!overX && !overY) continue;
      const scrolls = (overX && (style.overflowX === "auto" || style.overflowX === "scroll"))
        || (overY && (style.overflowY === "auto" || style.overflowY === "scroll"));
      const clamp = style.webkitLineClamp !== undefined && String(style.webkitLineClamp) !== "none";
      const ellipsis = style.textOverflow === "ellipsis" || clamp;
      if (ellipsis && matchesAny(el, options.ellipsisNames)) {
        const full = (el.textContent || "").replace(/\s+/g, " ").trim();
        const title = (el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
        if (!title || !title.includes(full)) fail("ellipsis-no-title", el, { shown: [cw, ch], needs: [sw, sh] });
        continue;
      }
      fail(scrolls ? "inner-scroll" : "text-clipped", el, { client: [cw, ch], scroll: [sw, sh], overflow: [style.overflowX, style.overflowY] });
    }

    // 3. Containment: the parent's border box, clipping ancestors, the window.
    const parentOf = (el) => {
      let p = el.parentElement;
      while (p && styleOf(p).display === "contents") p = p.parentElement;
      return p;
    };
    const clipRectCache = new Map();
    const clipRect = (ancestor) => {
      let c = clipRectCache.get(ancestor);
      if (!c) {
        const ar = ancestor.getBoundingClientRect();
        c = {
          l: ar.left + ancestor.clientLeft,
          t: ar.top + ancestor.clientTop,
          r: ar.left + ancestor.clientLeft + ancestor.clientWidth,
          b: ar.top + ancestor.clientTop + ancestor.clientHeight,
        };
        clipRectCache.set(ancestor, c);
      }
      return c;
    };
    const parentRectCache = new Map();
    const parentRect = (p) => {
      let r = parentRectCache.get(p);
      if (!r) {
        r = box(p.getBoundingClientRect());
        parentRectCache.set(p, r);
      }
      return r;
    };
    for (const item of leaves) {
      const { el, own, context, superscript } = item;
      const extra = superscript ? options.superscriptZone : 0;
      const parent = el === root ? null : parentOf(el);
      if (parent && !item.reserved && !parent.matches(scrollerSelector) && parent !== root) {
        const p = parentRect(parent);
        for (const leaf of own) {
          if (leavesBox(leaf, p, tol, extra)) {
            fail("outside-container", el, { leaf: r1(leaf), parent: r1(p), parentTag: describe(parent) });
            break;
          }
        }
      }
      // clipping ancestors: the first one whose clip box cuts a leaf (an allowed list ends the search)
      let ancestor = el.parentElement;
      let reported = false;
      while (ancestor && !reported && !item.reserved) {
        if (ancestor.matches(scrollerSelector)) break;
        const st = styleOf(ancestor);
        const clipsX = st.overflowX !== "visible";
        const clipsY = st.overflowY !== "visible";
        if ((clipsX || clipsY) && ancestor !== doc.documentElement && ancestor !== doc.body) {
          const c = clipRect(ancestor);
          for (const leaf of own) {
            const outX = clipsX && (leaf.l < c.l - tol - extra || leaf.r > c.r + tol + extra);
            const outY = clipsY && (leaf.t < c.t - tol - extra || leaf.b > c.b + tol + extra);
            if (outX || outY) {
              fail("clipped-by-ancestor", el, { leaf: r1(leaf), clip: r1(c), ancestor: describe(ancestor) });
              reported = true;
              break;
            }
          }
        }
        if (ancestor === root) break;
        ancestor = ancestor.parentElement;
      }
      if (!context && !item.reserved) {
        for (const leaf of own) {
          if (leaf.l < -tol || leaf.r > innerWidth + tol || leaf.t < -tol || leaf.b > innerHeight + tol) {
            fail("outside-viewport", el, { leaf: r1(leaf), window: [innerWidth, innerHeight] });
            break;
          }
        }
      }
    }
    // a floating root (dialog, popover) must itself sit inside the window
    if (root !== doc.body && (styleOf(root).position === "fixed" || root.tagName === "DIALOG")) {
      const r = box(root.getBoundingClientRect());
      if (r.l < -tol || r.t < -tol || r.r > innerWidth + tol || r.b > innerHeight + tol) {
        fail("outside-viewport", root, { root: r1(r), window: [innerWidth, innerHeight] });
      }
    }

    // 4. Overlaps
    const overlaySelector = options.overlays && options.overlays.length ? options.overlays.join(",") : null;
    const overlayOf = (el) => (overlaySelector ? el.closest(overlaySelector) : null);
    for (const item of boxes) item.overlay = overlayOf(item.el);
    const overlaps = findOverlaps(boxes, {
      tolerance: tol,
      zone: options.superscriptZone,
      same: (a, b) => a.el === b.el || a.overlay !== b.overlay,
      // the text of a control is not a separate box, and a control holds what is inside it
      holds: (a, b) => (a.kind !== "text" && a.el.contains(b.el)) || (b.kind !== "text" && b.el.contains(a.el)),
      superscript: (item) => item.el.matches(options.superscript),
      corner: (item) => item.kind === "control",
    });
    for (const { a, b, w, h } of overlaps) {
      fail("overlap", a.el, {
        with: describe(b.el),
        withText: shortText(b.el),
        overlap: [round(w), round(h)],
        a: r1(a.r),
        b: r1(b.r),
        kinds: [a.kind, b.kind],
      });
    }

    // 5. Pictures
    for (const visual of options.visuals) {
      for (const el of root.querySelectorAll(visual.selector)) {
        const style = styleOf(el);
        if (el.hidden || style.display === "none" || style.visibility === "hidden" || el.closest("[hidden]")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        // the longer side counts: a wide, flat picture keeps its shape and is still drawn large enough
        const side = Math.max(r.width, r.height);
        if (side + 0.01 < visual.minSide) fail("visual-too-small", el, { width: round(r.width), height: round(r.height), minSide: visual.minSide });
      }
    }

    // 6. Document scroll
    const scrolling = doc.scrollingElement || doc.documentElement;
    const docScroll = { x: scrolling.scrollWidth - innerWidth, y: scrolling.scrollHeight - innerHeight };
    if (docScroll.x > 0.5 || docScroll.y > 0.5) {
      fail("doc-scroll", doc.documentElement, { scrollHeight: scrolling.scrollHeight, innerHeight, scrollWidth: scrolling.scrollWidth, innerWidth }, "document");
    }

    // 7. The cards of one row: same width, same height (a row: every card is shown and their tops line up)
    const cards = {};
    for (const group of options.equalCards) {
      const found = group.map((selector) => doc.querySelector(selector));
      if (found.some((el) => !el)) continue;
      const rects = found.map((el) => el.getBoundingClientRect());
      if (rects.some((r) => r.width === 0 || r.height === 0)) continue;
      if (Math.max(...rects.map((r) => r.top)) - Math.min(...rects.map((r) => r.top)) > 2) continue;
      const widths = rects.map((r) => round(r.width, 2));
      const heights = rects.map((r) => round(r.height, 2));
      cards[group.join(",")] = { widths, heights };
      const spread = (list) => Math.max(...list) - Math.min(...list);
      if (spread(widths) > tol || spread(heights) > tol) fail("card-mismatch", found[0], { widths, heights }, group.join(" "));
    }

    // 8. Inputs and selects, last: the largest value is written into each number box and restored. All writes happen
    // together, then one read pass, then all restores, so the page is laid out twice and never sees an event.
    const numberInputs = [];
    const selectProbes = [];
    for (const el of elements) {
      const tag = el.tagName;
      if (tag !== "INPUT" && tag !== "SELECT") continue;
      const style = styleOf(el);
      if (style.visibility === "hidden" || el.clientWidth === 0) continue;
      const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (tag === "INPUT" && el.type === "number" && options.checkMaxValues) {
        let text = "";
        if (el.max !== "" && Number.isFinite(Number(el.max))) text = String(el.max);
        if (el.min !== "" && Number(el.min) < 0 && String(el.min).length > text.length) text = String(el.min);
        if (text) numberInputs.push({ el, style, text, available, original: el.value });
      } else if (tag === "INPUT" && !["checkbox", "radio", "range", "number", "hidden"].includes(el.type) && el.value) {
        if (el.scrollWidth - el.clientWidth > tol) fail("text-clipped", el, { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
      } else if (tag === "SELECT") {
        const arrow = style.appearance === "none" || style.webkitAppearance === "none" ? 0 : 20;
        const room = available - arrow;
        const selected = el.selectedOptions && el.selectedOptions[0];
        const selectedText = selected ? selected.textContent.trim() : "";
        if (selectedText) {
          const need = textWidth(doc, style, selectedText);
          if (need - room > 0.5) fail("select-option-clipped", el, { which: "selected", room: round(room), needs: round(need) }, selectedText.slice(0, 24));
        }
        let longest = "";
        let longestWidth = 0;
        let longestIndex = -1;
        for (let index = 0; index < el.options.length; index += 1) {
          const text = el.options[index].textContent.trim();
          const width = text ? textWidth(doc, style, text) : 0;
          if (width > longestWidth) {
            longest = text;
            longestWidth = width;
            longestIndex = index;
          }
        }
        if (longest && longest !== selectedText) {
          if (style.fieldSizing === "content") {
            // a select that sizes itself to its selected text may grow and re-flow: choose that option for one pass
            selectProbes.push({ el, style, text: longest, index: longestIndex, original: el.selectedIndex, arrow });
          } else if (longestWidth - room > 0.5) {
            fail("select-option-clipped", el, { which: "longest", room: round(room), needs: round(longestWidth) }, longest.slice(0, 24));
          }
        }
      }
    }
    if (numberInputs.length || selectProbes.length) {
      for (const item of numberInputs) item.el.value = item.text;
      for (const item of selectProbes) item.el.selectedIndex = item.index;
      for (const item of numberInputs) {
        item.scrollOver = item.el.scrollWidth - item.el.clientWidth;
        item.scrollWidth = item.el.scrollWidth;
        item.clientWidth = item.el.clientWidth;
      }
      for (const item of selectProbes) {
        const st = styleOf(item.el);
        item.room = item.el.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) - item.arrow;
      }
      for (const item of numberInputs) item.el.value = item.original;
      for (const item of selectProbes) item.el.selectedIndex = item.original;
      for (const item of selectProbes) {
        const need = textWidth(doc, item.style, item.text);
        if (need - item.room > 0.5) fail("select-option-clipped", item.el, { which: "longest", room: round(item.room), needs: round(need) }, item.text.slice(0, 24));
      }
      for (const item of numberInputs) {
        const need = textWidth(doc, item.style, item.text);
        if (item.scrollOver > 0.5 || need - item.available > 0.5) {
          fail("text-clipped", item.el, { value: item.text, available: round(item.available), needs: round(need), scrollWidth: item.scrollWidth, clientWidth: item.clientWidth }, `max ${item.text}`);
        }
      }
    }

    // 9. Type: the size range of every role, and the size of each probe (its first visible element)
    const fonts = {};
    for (const [name, entry] of Object.entries(fontSizes)) fonts[name] = { min: round(entry.min, 2), max: round(entry.max, 2), count: entry.count };
    const probes = {};
    for (const [name, selector] of Object.entries(options.probes || {})) {
      for (const el of root.querySelectorAll(selector)) {
        if (el.getClientRects().length === 0 || styleOf(el).visibility === "hidden") continue;
        probes[name] = round(parseFloat(styleOf(el).fontSize), 2);
        break;
      }
    }

    return {
      version: VERSION,
      viewport: { width: innerWidth, height: innerHeight, dpr: win.devicePixelRatio },
      root: describe(root),
      counts: { total, ...counts },
      violations,
      metrics: { fonts, probes, docScroll, cards, boxes: boxes.length },
    };
  }

  // ---------- walking the open editor ----------

  // Waits pass messages through a channel instead of a timer: a hidden tab throttles timers to one a second, which would
  // stretch a walk over thousands of records to hours. Message events are not throttled.
  const sleep = (ms) => new Promise((resolve) => {
    if (typeof MessageChannel !== "function") {
      setTimeout(resolve, ms);
      return;
    }
    const end = Date.now() + ms;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      if (Date.now() >= end) {
        channel.port1.close();
        resolve();
      } else channel.port2.postMessage(0);
    };
    channel.port2.postMessage(0);
  });

  // Walks the editor that is open on screen: per tab the list page once, then every record the list shows, on every
  // page the window offers (all panels at once on a wide window; list / values / ... one at a time on a small one).
  // It uses the page's own controls only (tab buttons, list rows, page buttons, the unused-records switch) and never
  // edits a value. Options: types, start, stride, count (every stride-th record from start, at most count of them),
  // include ({ unit: [...], pilot: [...], weapon: [...] } record numbers scanned whatever the stride), includeUnused,
  // settleMs, scanList, scan (options for scan()), onScan(result, context).
  // Returns per tab and page: records scanned, records with violations, counts per rule, the type range and the probe
  // sizes of the first record; every distinct violation once (signatures) with the records that showed it.
  async function walkEditor(userOptions = {}) {
    const doc = userOptions.document || globalScope.document;
    const win = doc.defaultView;
    const types = userOptions.types || ["unit", "pilot", "weapon"];
    const settle = userOptions.settleMs ?? 2;
    const start = userOptions.start ?? 0;
    const stride = Math.max(1, userOptions.stride ?? 1);
    const count = userOptions.count ?? Infinity;
    const scanOptions = { ...(userOptions.scan || {}), document: doc };
    // the long list is scanned once per tab (on its own page), not again with every record
    const recordScanOptions = { ...scanOptions, exclude: [...DEFAULTS.exclude, ...(scanOptions.exclude || []), ".record-list"] };
    const out = { viewport: { width: win.innerWidth, height: win.innerHeight }, tabs: {}, signatures: {}, examples: [], seconds: 0 };
    const note = (result, tab, record) => {
      for (const v of result.violations) {
        const key = `${tab} ${v.rule} ${v.target}`;
        const entry = out.signatures[key] || (out.signatures[key] = { tab, rule: v.rule, target: v.target, scans: 0, records: [], text: v.text, detail: v.detail });
        entry.scans += 1;
        if (entry.records.length < 6 && !entry.records.includes(record)) entry.records.push(record);
      }
    };
    const t0 = Date.now();
    const byId = (id) => doc.getElementById(id);
    const shown = (el) => el.getClientRects().length > 0;
    const tally = (stats, result) => {
      stats.records += 1;
      if (result.counts.total) {
        stats.violating += 1;
        stats.total += result.counts.total;
        for (const [rule, k] of Object.entries(result.counts)) if (rule !== "total") stats.rules[rule] = (stats.rules[rule] || 0) + k;
      }
      for (const [role, entry] of Object.entries(result.metrics.fonts)) {
        const f = stats.fonts[role] || (stats.fonts[role] = { min: Infinity, max: 0 });
        f.min = Math.min(f.min, entry.min);
        f.max = Math.max(f.max, entry.max);
      }
      if (!stats.probes) stats.probes = { ...result.metrics.probes };
    };

    for (const type of types) {
      byId(`${type}TabButton`).click();
      await sleep(settle + 10);
      const panel = byId(`${type}EditorPanel`);
      const switchButtons = [...panel.querySelectorAll("[data-editor-page]")];
      const visibleButtons = switchButtons.filter(shown);
      const chooser = panel.querySelector("[data-editor-part-choice]");
      const nativePaged = chooser && shown(chooser);
      const paged = nativePaged || visibleButtons.length > 0;
      const pages = nativePaged ? [...chooser.options].map((o) => o.value).filter((p) => p !== "list")
        : paged ? visibleButtons.map((b) => b.dataset.editorPage).filter((p) => p !== "list") : ["all"];
      const setPage = (page) => {
        if (nativePaged) { chooser.value = page; chooser.dispatchEvent(new win.Event("change", { bubbles: true })); return; }
        const b = panel.querySelector(`[data-editor-page="${page}"]`);
        if (b && paged) b.click();
      };
      const settleLayout = async (preview = false) => {
        if (!panel.hasAttribute("data-auto-pages")) return;
        const frame = () => new Promise(resolve => win.requestAnimationFrame(resolve));
        await frame(); await frame();
        if (preview) {
          const deadline = Date.now() + 1000;
          while (Date.now() < deadline && byId(`${type}PreviewCaption`)?.textContent.includes("이미지 불러오는 중")) await frame();
          await frame(); await frame();
        }
      };

      if (userOptions.includeUnused) {
        const toggle = byId("unusedToggle");
        const label = byId("unusedToggleLabel");
        if (toggle && label && !label.hidden && !toggle.checked) {
          toggle.click();
          await sleep(settle + 10);
        }
      }

      if (userOptions.scanList !== false && start === 0) {
        setPage("list");
        await sleep(settle);
        const result = scan(scanOptions);
        note(result, `${type}:list`, "list");
        const stats = { records: 0, violating: 0, total: 0, rules: {}, fonts: {} };
        tally(stats, result);
        out.tabs[`${type}:list`] = stats;
        if (result.counts.total && out.examples.length < 60) out.examples.push({ tab: `${type}:list`, violations: result.violations.slice(0, 8) });
      }

      const rows = [...byId(`${type}RecordList`).querySelectorAll("[data-record-index]")];
      const stats = {};
      for (const page of pages) stats[page] = { records: 0, violating: 0, total: 0, rules: {}, fonts: {} };
      const picked = [];
      for (let n = 0, index = start; n < count && index < rows.length; n += 1, index += stride) picked.push(index);
      const wanted = new Set((userOptions.include || {})[type] || []);
      rows.forEach((row, index) => {
        if (wanted.has(Number(row.dataset.recordIndex)) && !picked.includes(index)) picked.push(index);
      });
      for (const index of picked) {
        rows[index].click();
        if (settle) await sleep(settle);
        await settleLayout(true);
        const title = byId(`${type}StatsHeading`).textContent;
        const recordPages = panel.hasAttribute("data-auto-pages") ? [...panel.querySelectorAll("[data-editor-page]")].map(button => button.dataset.editorPage).filter(page => page !== "list") : pages;
        for (const page of recordPages) {
          stats[page] ??= { records: 0, violating: 0, total: 0, rules: {}, fonts: {} };
          setPage(page);
          await settleLayout();
          const result = scan(recordScanOptions);
          note(result, `${type}:${page}`, title);
          tally(stats[page], result);
          if (result.counts.total && stats[page].violating <= 3 && out.examples.length < 60) {
            out.examples.push({ tab: `${type}:${page}`, record: title, violations: result.violations.slice(0, 8) });
          }
          if (userOptions.onScan) userOptions.onScan(result, { type, page, index, title });
        }
      }
      for (const page of Object.keys(stats)) out.tabs[`${type}:${page}`] = stats[page];
      setPage("main");
    }
    out.seconds = round((Date.now() - t0) / 1000, 1);
    return out;
  }

  const api = { VERSION, RULES, DEFAULTS, scan, walkEditor, fontCurve, leavesBox, findOverlaps, textWidth, describe };

  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (globalScope) globalScope.srwfLayoutScan = api;
})(typeof window !== "undefined" ? window : null);
