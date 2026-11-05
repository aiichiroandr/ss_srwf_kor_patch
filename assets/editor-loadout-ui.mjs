import { scrollTopToReveal } from './editor-list.mjs?v=20261105-part3';

// Keep every slot available in one bounded, scrollable grid.
export function createUnitWeaponScroller({ list }) {
  let key = null;
  return { refresh({ recordKey = key, focusField = null } = {}) {
    if (recordKey !== key) { key = recordKey; list.scrollTop = 0; }
    if (!focusField) return;
    const target = list.querySelector(`[data-unit-weapon-field="${focusField}"]`);
    if (!target) return;
    const item = target.closest('.unit-weapon-row') ?? target;
    const bounds = list.getBoundingClientRect(), rect = item.getBoundingClientRect();
    list.scrollTop = scrollTopToReveal(list.scrollTop, list.clientHeight,
      rect.top - bounds.top + list.scrollTop, rect.height);
  }};
}
