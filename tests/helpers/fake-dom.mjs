// A small DOM for the editor screen tests: enough of the element API for assets/app.mjs to build lists, selects and chips,
// to route clicks and key presses, and to answer the selectors the page code uses. It is not a browser: no layout, no CSS.
// Layout facts (sizes, fonts, hit areas) are measured in a real browser, not here.

class ClassList {
  #owner;
  constructor(owner) {
    this.#owner = owner;
  }

  #values() {
    return new Set((this.#owner.attributes.get("class") ?? "").split(/\s+/).filter(Boolean));
  }

  #write(values) {
    this.#owner.attributes.set("class", [...values].join(" "));
  }

  add(...names) {
    const values = this.#values();
    for (const name of names) values.add(name);
    this.#write(values);
  }

  remove(...names) {
    const values = this.#values();
    for (const name of names) values.delete(name);
    this.#write(values);
  }

  toggle(name, force) {
    const values = this.#values();
    const enabled = force ?? !values.has(name);
    if (enabled) values.add(name);
    else values.delete(name);
    this.#write(values);
    return enabled;
  }

  contains(name) {
    return this.#values().has(name);
  }
}

// ---- selectors: comma lists of compound selectors (tag, #id, .class, [attr], [attr=value]) joined by spaces -------

function parseCompound(text) {
  const compound = { tag: null, id: null, classes: [], attrs: [] };
  const pattern = /^([a-zA-Z][\w-]*|\*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/y;
  let rest = text;
  while (rest.length > 0) {
    pattern.lastIndex = 0;
    const match = pattern.exec(rest);
    if (!match) throw new Error(`fake-dom: unsupported selector part ${rest}`);
    if (match[1]) compound.tag = match[1] === "*" ? null : match[1].toUpperCase();
    else if (match[2]) compound.id = match[2];
    else if (match[3]) compound.classes.push(match[3]);
    else compound.attrs.push({ name: match[4], value: match[5] ?? match[6] ?? match[7] ?? null });
    rest = rest.slice(match[0].length);
  }
  return compound;
}

function compoundMatches(node, compound) {
  if (!(node instanceof FakeElement)) return false;
  if (compound.tag && node.tagName !== compound.tag) return false;
  if (compound.id && node.id !== compound.id) return false;
  for (const name of compound.classes) if (!node.classList.contains(name)) return false;
  for (const { name, value } of compound.attrs) {
    if (!node.hasAttribute(name)) return false;
    if (value !== null && node.getAttribute(name) !== value) return false;
  }
  return true;
}

function parseSelector(selector) {
  return selector.split(",").map((part) => part.trim().split(/\s+/).map(parseCompound));
}

function selectorMatches(node, chains) {
  return chains.some((chain) => {
    if (!compoundMatches(node, chain.at(-1))) return false;
    let current = node.parentNode;
    for (let index = chain.length - 2; index >= 0; index -= 1) {
      while (current && !compoundMatches(current, chain[index])) current = current.parentNode;
      if (!current) return false;
      current = current.parentNode;
    }
    return true;
  });
}

// ---- elements --------------------------------------------------------------------------------------------------------

export class FakeElement {
  constructor(tagName = "div", document = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = document;
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this._data = {};
    this.dataset = new Proxy(this._data, {
      set: (target, key, value) => {
        target[key] = String(value);
        this.attributes.set(`data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, String(value));
        return true;
      },
      deleteProperty: (target, key) => {
        delete target[key];
        this.attributes.delete(`data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
        return true;
      },
    });
    this.classList = new ClassList(this);
    this.style = { removeProperty() {}, setProperty() {} };
    this.hidden = false;
    this.disabled = false;
    this._value = "";
    this._text = "";
    this.scrollTop = 0;
    this.clientHeight = 0;
    this.offsetTop = 0;
    this.offsetHeight = 0;
    this.focusCount = 0;
  }

  // open reflects the attribute, as on a dialog, so "dialog[open]" matches an opened one.
  get open() {
    return this.attributes.has("open");
  }

  set open(value) {
    if (value) this.attributes.set("open", "");
    else this.attributes.delete("open");
  }

  get id() {
    return this.attributes.get("id") ?? "";
  }

  set id(value) {
    this.attributes.set("id", String(value));
  }

  get className() {
    return this.attributes.get("class") ?? "";
  }

  set className(value) {
    this.attributes.set("class", String(value));
  }

  get type() {
    return this.attributes.get("type") ?? "";
  }

  set type(value) {
    this.attributes.set("type", String(value));
  }

  // attributes the page code sets as properties (they reflect, as in a browser)
  get min() { return this.attributes.get("min") ?? ""; }
  set min(value) { this.attributes.set("min", String(value)); }
  get max() { return this.attributes.get("max") ?? ""; }
  set max(value) { this.attributes.set("max", String(value)); }
  get step() { return this.attributes.get("step") ?? ""; }
  set step(value) { this.attributes.set("step", String(value)); }
  get scope() { return this.attributes.get("scope") ?? ""; }
  set scope(value) { this.attributes.set("scope", String(value)); }

  get title() {
    return this.attributes.get("title") ?? "";
  }

  set title(value) {
    this.attributes.set("title", String(value));
  }

  get childNodes() {
    return this.children;
  }

  get lastChild() {
    return this.children.at(-1) ?? null;
  }

  get textContent() {
    return this.children.map((child) => child.textContent ?? "").join("");
  }

  // Like a DOM element: setting the text replaces the children by one text node that later children follow.
  set textContent(value) {
    this.children = [];
    this._text = "";
    const text = String(value);
    if (text !== "") this.append({ children: [], textContent: text, nodeType: 3 });
  }

  // A select shows its first option until something else is chosen; choosing nothing (a value without an option, or
  // selectedIndex -1) leaves it blank, as in a browser.
  get value() {
    if (this.tagName === "SELECT") {
      const options = this.options;
      const selected = options.find((option) => option._selected) ?? (this._blank ? null : options[0] ?? null);
      return selected ? selected.value : "";
    }
    return this._value;
  }

  set value(next) {
    if (this.tagName === "OPTION") this.attributes.set("value", String(next));
    const text = String(next);
    if (this.tagName === "SELECT") {
      let found = false;
      for (const option of this.options) {
        option._selected = !found && option.value === text;
        found ||= option._selected;
      }
      this._blank = !found;
      return;
    }
    this._value = text;
  }

  get valueAsNumber() {
    return this._value === "" ? Number.NaN : Number(this._value);
  }

  get options() {
    return this.children.flatMap((child) => child.tagName === "OPTION" ? [child] : child.tagName === "OPTGROUP" ? child.children.filter(option => option.tagName === "OPTION") : []);
  }

  get selectedOptions() {
    const index = this.selectedIndex;
    return index >= 0 ? [this.options[index]] : [];
  }

  get selectedIndex() {
    const options = this.options;
    const index = options.findIndex((option) => option._selected);
    return index >= 0 ? index : this._blank || options.length === 0 ? -1 : 0;
  }

  set selectedIndex(index) {
    this.options.forEach((option, position) => {
      option._selected = position === index;
    });
    this._blank = index < 0;
  }

  get validity() {
    return { valid: this._customValidity === "" || this._customValidity === undefined };
  }

  setCustomValidity(message) {
    this._customValidity = String(message);
  }

  reportValidity() {
    return this.validity.valid;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith("data-")) {
      this._data[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith("data-")) {
      delete this._data[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    }
  }

  append(...items) {
    // like the DOM, a string argument becomes a text node
    const nodes = items.map((item) => (typeof item === "string" ? { children: [], textContent: item, nodeType: 3 } : item));
    for (const node of nodes) {
      if (node && typeof node === "object") {
        node.parentNode?.removeChild?.(node);
        node.parentNode = this;
        this.children.push(node);
      }
    }
    if (nodes.length > 0) this._text = "";
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  prepend(...nodes) {
    for (const node of [...nodes].reverse()) {
      node.parentNode?.removeChild?.(node);
      node.parentNode = this;
      this.children.unshift(node);
    }
  }

  removeChild(node) {
    this.children = this.children.filter((child) => child !== node);
    node.parentNode = null;
    return node;
  }

  insertBefore(node, reference) {
    node.parentNode?.removeChild?.(node);
    const index = this.children.indexOf(reference);
    node.parentNode = this;
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
    return node;
  }

  replaceChild(next, previous) {
    const index = this.children.indexOf(previous);
    if (index < 0) return previous;
    next.parentNode?.removeChild?.(next);
    next.parentNode = this;
    this.children[index] = next;
    previous.parentNode = null;
    return previous;
  }

  replaceWith(next) {
    this.parentNode?.replaceChild(next, this);
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._text = "";
    this.append(...nodes);
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  matches(selector) {
    if (selector === ':popover-open') return Boolean(this.popoverOpen);
    return selectorMatches(this, parseSelector(selector));
  }

  closest(selector) {
    const chains = parseSelector(selector);
    for (let node = this; node; node = node.parentNode) {
      if (selectorMatches(node, chains)) return node;
    }
    return null;
  }

  querySelectorAll(selector) {
    const chains = parseSelector(selector);
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (!(child instanceof FakeElement)) continue;
        if (selectorMatches(child, chains)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  // Bubbling dispatch: the event's target is this element, then every ancestor and finally the document.
  dispatchEvent(event) {
    event.target ??= this;
    event.defaultPrevented ??= false;
    event.preventDefault ??= () => {
      event.defaultPrevented = true;
    };
    for (let node = this; node; node = node.parentNode ?? node.ownerDocument) {
      for (const listener of node.listeners?.get(event.type) ?? []) listener.call(node, event);
      if (node === node.ownerDocument) break;
    }
    return !event.defaultPrevented;
  }

  click() {
    if (this.disabled) return;
    this.dispatchEvent({ type: "click" });
  }

  focus() {
    this.focusCount += 1;
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  getBoundingClientRect() {
    return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }

  showPopover() { this.popoverOpen = true; }
  hidePopover() { this.popoverOpen = false; }

  getContext() {
    return { clearRect() {}, putImageData() {} };
  }
}

export class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.listeners = new Map();
    this.activeElement = null;
    this.body = new FakeElement("body", this);
    this.nodes = [];
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createTextNode(text) {
    return { children: [], textContent: String(text), nodeType: 3 };
  }

  getElementById(id) {
    if (!this.elements.has(id)) {
      const element = new FakeElement("div", this);
      element.id = id;
      this.elements.set(id, element);
    }
    return this.elements.get(id);
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  querySelectorAll(selector) {
    return this.root ? this.root.querySelectorAll(selector) : [];
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  dispatchEvent(event) {
    event.target ??= this;
    event.preventDefault ??= () => {
      event.defaultPrevented = true;
    };
    event.defaultPrevented ??= false;
    for (const listener of this.listeners.get(event.type) ?? []) listener.call(this, event);
    return !event.defaultPrevented;
  }
}

// Installs the globals the page module needs and returns the document.
export function installFakeDom() {
  const document = new FakeDocument();
  globalThis.document = document;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
  globalThis.window = {
    addEventListener() {},
    isSecureContext: false,
    location: { origin: "null" },
  };
  globalThis.fetch = async () => {
    throw new Error("synthetic fetch disabled");
  };
  globalThis.requestAnimationFrame = (callback) => callback();
  return document;
}

// Puts a select element's options in place (the page builds most of its selects itself).
export function makeSelect(document, values) {
  const select = document.createElement("select");
  for (const value of values) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    select.append(option);
  }
  return select;
}

// ---- loading the page's own markup ----------------------------------------------------------------------------------

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "wbr"]);
const RAW_TEXT = new Set(["script", "style", "noscript", "textarea", "title"]);

// Parses the well-formed markup of index.html into the fake document, so a test can look at the real ids, roles,
// labels and structure. Only what that file uses is supported (double-quoted attributes, no entities but &amp;).
export function loadHtml(document, html) {
  const root = new FakeElement("html", document);
  document.root = root;
  const stack = [root];
  const tag = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/gy;
  let index = 0;
  const addText = (text) => {
    const collapsed = text.replace(/\s+/g, " ");
    if (collapsed.trim() === "") return;
    stack.at(-1).append(document.createTextNode(collapsed.replace(/&amp;/g, "&")));
  };
  while (index < html.length) {
    tag.lastIndex = index;
    const match = tag.exec(html);
    if (!match) {
      const next = html.indexOf("<", index + 1);
      addText(html.slice(index, next < 0 ? html.length : next));
      index = next < 0 ? html.length : next;
      continue;
    }
    index = tag.lastIndex;
    if (match[0].startsWith("<!")) continue;
    if (match[1]) {
      const name = match[1].toLowerCase();
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth].tagName.toLowerCase() === name) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }
    const name = match[2].toLowerCase();
    const element = document.createElement(name);
    for (const attribute of match[3].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const value = (attribute[2] ?? attribute[3] ?? attribute[4] ?? "").replace(/&amp;/g, "&");
      if (attribute[1] === "hidden") element.hidden = true;
      element.setAttribute(attribute[1], value);
      if (attribute[1] === "disabled") element.disabled = true;
    }
    if (element.hasAttribute("id")) document.elements.set(element.id, element);
    stack.at(-1).append(element);
    if (VOID.has(name) || match[4]) continue;
    if (RAW_TEXT.has(name)) {
      const close = html.indexOf(`</${name}`, index);
      const body = html.slice(index, close < 0 ? html.length : close);
      if (body.trim() !== "") element.append(document.createTextNode(body));
      index = close < 0 ? html.length : html.indexOf(">", close) + 1;
      continue;
    }
    stack.push(element);
  }
  return root;
}
