(() => {
  'use strict';

  const get = id => document.getElementById(id);
  const homeTitle = document.title;
  const navigation = document.querySelector('.masthead nav');
  const skip = document.querySelector('.skip-link');
  const toTop = document.querySelector('.to-top');
  let previousRoom;

  function mountSimulator() {
    const host = get('simulatorHost');
    if (host.firstElementChild) return;
    const frame = document.createElement('iframe');
    frame.id = 'simulatorFrame';
    frame.title = '魔兽世界无限服角色模拟器';
    const embedded = get('simulatorDocument');
    if (embedded) {
      frame.srcdoc = JSON.parse(embedded.textContent);
      embedded.remove();
    } else {
      frame.src = 'assets/simulator/character.html';
    }
    host.append(frame);
  }

  function route() {
    const hash = location.hash;
    const room = hash === '#simulator' ? 'simulator' : hash === '#salon' ? 'salon' : 'home';
    const isTool = room !== 'home';
    const isSimulator = room === 'simulator';
    const title = isSimulator ? '角色模拟器' : '点胖发型馆';
    document.body.classList.toggle('simulator-open', isSimulator);
    get('booth').hidden = get('works').hidden = isTool;
    get('salon').hidden = room !== 'salon';
    get('simulator').hidden = !isSimulator;
    document.title = isTool ? title + ' · 点胖之家' : homeTitle;
    skip.href = isTool ? hash : '#works';
    skip.textContent = isTool ? '跳到' + title : '跳到作品相册';
    toTop.href = isTool ? hash : '#top';
    for (const link of navigation.querySelectorAll('a')) {
      if (link.hash === (hash && hash !== '#top' ? hash : '#booth')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (isTool) {
      if (isSimulator) mountSimulator();
      else window.dispatchEvent(new Event('dianpang:salon'));
      if (previousRoom !== undefined && previousRoom !== room) {
        get(isSimulator ? 'simulator' : 'salonTitle').focus({ preventScroll: true });
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (previousRoom && previousRoom !== 'home') {
      const target = hash === '#works' ? get('works') : get('top');
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    previousRoom = room;
  }

  window.addEventListener('hashchange', route);
  route();
})();
