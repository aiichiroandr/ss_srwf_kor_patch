// Independent backdrop and content selectors; shared by the static same-origin pages.
const key = 'srwf-saturn-appearance';
const menu = document.querySelector('[data-theme-menu]');
const inputs = menu ? [...menu.querySelectorAll('input[type="radio"]')] : [];
const root = document.documentElement;
const sanitize = value => value === 'graphite' || value === 'beige' ? value : null;
const apply = (saved = {}) => {
  root.dataset.srwfBackdrop = sanitize(saved?.backdrop) ?? 'graphite';
  root.dataset.srwfTheme = sanitize(saved?.content) ?? 'beige';
  for (const input of inputs) {
    const value = input.name === 'saturn-backdrop' ? root.dataset.srwfBackdrop : root.dataset.srwfTheme;
    input.checked = input.value === value;
  }
};
const parse = source => { try { return JSON.parse(source); } catch { return null; } };
try {
  const saved = parse(localStorage.getItem(key));
  const content = sanitize(localStorage.getItem('srwf-saturn-theme'));
  apply(saved ?? { content });
} catch { apply(); }
menu?.addEventListener('change', event => {
  const input = event.target;
  if (!inputs.includes(input) || !input.checked) return;
  const saved = { backdrop: root.dataset.srwfBackdrop, content: root.dataset.srwfTheme };
  saved[input.name === 'saturn-backdrop' ? 'backdrop' : 'content'] = input.value;
  apply(saved);
  try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* current tab still works */ }
});
document.addEventListener('click', event => {
  if (menu?.open && !menu.contains(event.target)) menu.open = false;
});
// Keep the disclosure out of the way once keyboard focus leaves its controls.
menu?.addEventListener('focusout', event => {
  if (menu.open && event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
});
menu?.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !menu.open) return;
  event.stopPropagation();
  menu.open = false;
  menu.querySelector('summary')?.focus();
});
addEventListener('storage', event => { if (event.key === key) apply(parse(event.newValue)); });
