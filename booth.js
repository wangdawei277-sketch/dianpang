(() => {
  'use strict';

  const stack = document.getElementById('photoStack');
  const stage = document.getElementById('portraitStage');
  const label = document.getElementById('sceneLabel');
  const caption = document.getElementById('printCaption');
  const message = document.getElementById('sceneAnnounce');
  const replay = document.getElementById('replay');
  const skip = document.getElementById('skipIntro');
  const separator = document.getElementById('controlsSep');
  const left = document.getElementById('actorLeft');
  const right = document.getElementById('actorRight');
  const game = document.getElementById('gamePortrait');
  const flash = document.getElementById('photoFlash');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const seenKey = 'dianpang-home:game-portrait:v1';
  const peopleDescription = stage.getAttribute('aria-label');
  const gameDescription = '点胖的魔兽世界角色戴着斗笠和红色面巾，手提发光的灯笼。';
  const isTool = hash => hash === '#salon' || hash === '#simulator';
  let action = 0;

  left.src = 'assets/hero/hero-left.webp';
  right.src = 'assets/hero/hero-right.webp';
  game.src = 'assets/hero/game-character.webp';
  const loaded = Promise.allSettled([left.decode(), right.decode(), game.decode()]);

  function hasSeen() {
    try { return sessionStorage.getItem(seenKey) === '1'; }
    catch { return false; }
  }

  function showGameCaption() {
    caption.textContent = '点胖 · 魔兽世界';
    stage.setAttribute('aria-label', gameDescription);
  }

  function finish(announce = false) {
    action++;
    if (game.naturalWidth) {
      stack.dataset.scene = 'character';
      showGameCaption();
      label.textContent = '角色照已定格';
    } else {
      stack.dataset.scene = 'portrait';
      caption.textContent = '点胖 × 点胖';
      stage.setAttribute('aria-label', peopleDescription);
      label.textContent = '合照已冲印';
    }
    if (document.activeElement === skip) replay.focus({ preventScroll: true });
    skip.hidden = separator.hidden = true;
    if (announce) message.textContent = label.textContent;
  }

  async function play(firstVisit = false) {
    const request = ++action;
    await loaded;
    if (request !== action) return;
    if (isTool(location.hash)) { finish(); return; }
    if (reduced.matches || !left.naturalWidth || !right.naturalWidth ||
        (firstVisit && (hasSeen() || location.hash === '#works'))) {
      finish();
      return;
    }
    try { sessionStorage.setItem(seenKey, '1'); }
    catch { /* The opening works when session storage is unavailable. */ }
    stack.dataset.scene = 'ready';
    caption.textContent = '点胖 × 点胖';
    stage.setAttribute('aria-label', peopleDescription);
    void stack.offsetWidth;
    stack.dataset.scene = 'approach';
    label.textContent = '正在合拍';
    message.textContent = '';
    skip.hidden = separator.hidden = false;
  }

  left.addEventListener('animationend', event => {
    if (event.animationName !== 'join-portrait' || stack.dataset.scene !== 'approach') return;
    if (!game.naturalWidth || reduced.matches) { finish(true); return; }
    stack.dataset.scene = 'flash';
  });
  flash.addEventListener('animationend', event => {
    if (event.animationName !== 'shutter-white-in' || stack.dataset.scene !== 'flash') return;
    stack.dataset.scene = 'reveal';
    showGameCaption();
    label.textContent = '点胖的角色照';
  });
  game.addEventListener('animationend', event => {
    if (event.animationName === 'character-zoom' && stack.dataset.scene === 'reveal') finish(true);
  });
  replay.addEventListener('click', () => play());
  skip.addEventListener('click', () => {
    finish();
    const album = document.getElementById('galleryTitle');
    album.tabIndex = -1;
    album.focus({ preventScroll: true });
    album.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
  });
  for (const link of document.querySelectorAll('a[href="#works"]')) {
    link.addEventListener('click', () => finish());
  }
  reduced.addEventListener('change', () => { if (reduced.matches) finish(); });
  window.addEventListener('hashchange', event => {
    if (isTool(location.hash)) finish();
    else if (isTool(new URL(event.oldURL).hash)) play(true);
  });
  window.addEventListener('pagehide', () => finish());

  // A visitor may skip to the album before the character photo has decoded.
  loaded.then(() => { if (stack.dataset.scene === 'portrait' && game.naturalWidth) finish(); });
  play(true);
})();
