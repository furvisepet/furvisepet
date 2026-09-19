import assert from 'node:assert/strict';
import test from 'node:test';
import { observeCompactNavigation } from '../app/lib/navigation/compact-navigation-observer.ts';

function setup(t, mobile = true) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const media = Object.assign(new EventTarget(), { matches: mobile });
  const viewport = Object.assign(new EventTarget(), { scrollY: 0, matchMedia: () => media });
  const page = Object.assign(new EventTarget(), { activeElement: null });
  const states = [];
  const stop = observeCompactNavigation(value => states.push(value), viewport, page);
  t.after(stop);
  const scroll = (y, user = true) => {
    if (user) viewport.dispatchEvent(new Event('touchmove'));
    viewport.scrollY = y;
    viewport.dispatchEvent(new Event('scroll'));
  };
  return { media, viewport, page, states, stop, scroll };
}

test('mobile navigation compacts downwards, expands upwards, and compacts after idle', t => {
  const { scroll, states } = setup(t);
  scroll(100);
  assert.equal(states.at(-1), true);
  scroll(85, false);
  assert.equal(states.at(-1), true);
  scroll(70);
  assert.equal(states.at(-1), false);
  t.mock.timers.tick(1799);
  assert.equal(states.at(-1), false);
  t.mock.timers.tick(1);
  assert.equal(states.at(-1), true);
});

test('layout scroll after idle does not expand the dock into a resize loop', t => {
  const { states, scroll } = setup(t);
  t.mock.timers.tick(1800);
  scroll(20, false);
  scroll(0, false);
  assert.deepEqual(states, [true]);
});

test('keyboard focus keeps navigation expanded until focus leaves', t => {
  const { page, states } = setup(t);
  t.mock.timers.tick(1800);
  page.activeElement = { matches: () => true };
  page.dispatchEvent(new Event('focusin'));
  t.mock.timers.tick(3000);
  assert.equal(states.at(-1), false);
  page.activeElement = null;
  page.dispatchEvent(new Event('focusout'));
  t.mock.timers.tick(1800);
  assert.equal(states.at(-1), true);
});

test('desktop stays expanded and cleanup removes pending idle and scroll updates', t => {
  const { states, media, stop, scroll } = setup(t, false);
  scroll(100);
  t.mock.timers.tick(3000);
  assert.deepEqual(states, []);
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  assert.deepEqual(states, [false]);
  stop();
  scroll(200);
  t.mock.timers.tick(3000);
  assert.deepEqual(states, [false]);
});
