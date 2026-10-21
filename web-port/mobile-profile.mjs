// Device identity, not viewport size: narrow windows and touch laptops keep
// the existing desktop path. iPadOS can identify itself as a Mac.
export function isMobileDevice(nav = {}) {
  return nav.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod/i.test(nav.userAgent || '')
    || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

export function executionProfile(nav, enabled = true) {
  const mobile = isMobileDevice(nav);
  return {mobile, optimized: mobile && enabled,
    name: mobile && enabled ? 'mobile-clock-v13' : 'standard'};
}
