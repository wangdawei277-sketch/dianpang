(() => {
  const categoryNames = { sticker: '表情包', motion: '动图', poster: '魔兽海报' };

  function startGallery() {
    const grid = document.getElementById('workGrid');
    const viewer = document.getElementById('viewer');
    if (!grid || !viewer) return;

    const works = Array.isArray(window.DIANPANG_WORKS) ? window.DIANPANG_WORKS : [];
    const filters = Array.from(document.querySelectorAll('.filter[data-category]'));
    const count = document.getElementById('resultCount');
    const image = document.getElementById('viewImage');
    const heading = document.getElementById('viewTitle');
    const meta = document.getElementById('viewMeta');
    const download = document.getElementById('viewDownload');
    const close = document.getElementById('viewClose');
    const previous = document.getElementById('viewPrevious');
    const next = document.getElementById('viewNext');
    let visible = [];
    let position = -1;
    let opener = null;

    const defaultDownloadText = download.firstChild.textContent;
    let offlineDownload = null;

    function releaseDownload() {
      if (!offlineDownload) return;
      const { script, url, used } = offlineDownload;
      offlineDownload = null;
      script.onload = script.onerror = null;
      script.remove();
      if (url) {
        // Let the browser finish accepting a download started just before closing.
        if (used) setTimeout(() => URL.revokeObjectURL(url), 1000);
        else URL.revokeObjectURL(url);
      }
    }

    function prepareDownload(work) {
      releaseDownload();
      const filename = work.filename || work.src.split('/').pop();
      download.firstChild.textContent = defaultDownloadText;
      download.href = work.src;
      download.download = filename;
      download.removeAttribute('target');
      download.removeAttribute('aria-busy');
      download.setAttribute('aria-label', '下载《' + work.title + '》原文件');
      if (location.protocol !== 'file:' || /^(?:data|blob):/i.test(work.src)) return;

      // Local file documents cannot fetch sibling images as readable bytes. Each
      // original has a small loader contract, requested only while its viewer is open.
      const script = document.createElement('script');
      const state = { script, url: null, queued: false, used: false };
      offlineDownload = state;
      download.setAttribute('aria-busy', 'true');

      function useOriginalLink() {
        if (offlineDownload !== state) return;
        releaseDownload();
        download.removeAttribute('aria-busy');
        download.removeAttribute('download');
        download.target = '_blank';
        download.rel = 'noopener';
        download.firstChild.textContent = '打开原文件 ';
        download.setAttribute('aria-label', '打开《' + work.title + '》原文件后另存为');
        meta.textContent += ' · 打开原文件后可另存为';
      }

      script.onload = () => {
        if (offlineDownload !== state) return;
        try {
          const encoded = script.originalBytes;
          if (typeof encoded !== 'string' || !encoded.length) throw new Error('Missing bytes');
          let bytes;
          if (typeof Uint8Array.fromBase64 === 'function') {
            bytes = Uint8Array.fromBase64(encoded);
          } else {
            const binary = atob(encoded);
            bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          }
          if (work.bytes && bytes.length !== work.bytes) throw new Error('Incomplete original');
          const type = fileType(work).toLowerCase();
          state.url = URL.createObjectURL(new Blob([bytes], { type: 'image/' + (type === 'jpg' ? 'jpeg' : type) }));
        } catch {
          useOriginalLink();
          return;
        } finally {
          delete script.originalBytes;
          script.remove();
        }
        download.href = state.url;
        download.removeAttribute('aria-busy');
        if (state.queued && viewer.open) download.click();
      };
      script.onerror = useOriginalLink;
      script.src = 'assets/offline/' + encodeURIComponent(work.id) + '.js';
      document.head.append(script);
    }

    download.addEventListener('click', event => {
      if (!offlineDownload) return;
      if (offlineDownload.url) {
        offlineDownload.used = true;
      } else {
        event.preventDefault();
        offlineDownload.queued = true;
      }
    });

    const span = (className, label) => {
      const element = document.createElement('span');
      element.className = className;
      if (label) element.textContent = label;
      return element;
    };

    function fileType(work) {
      const filename = work.filename || work.src.split('/').pop();
      const extension = filename.match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
      return extension ? extension[1].toUpperCase() : '';
    }

    function createCard(work, index) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'work-card';
      card.dataset.category = work.category;
      card.dataset.id = work.id;
      card.setAttribute('aria-label', '查看' + categoryNames[work.category] + '《' + work.title + '》');
      card.setAttribute('aria-haspopup', 'dialog');

      const frame = span('work-image');
      const thumbnail = document.createElement('img');
      thumbnail.alt = '';
      thumbnail.decoding = 'async';
      thumbnail.loading = 'lazy';
      thumbnail.addEventListener('error', () => {
        thumbnail.hidden = true;
        frame.append(span('work-missing', '预览图暂不可用'));
      }, { once: true });
      thumbnail.src = work.thumb || work.src;
      frame.append(thumbnail);
      if (work.category === 'motion') {
        const play = span('work-play', '▶');
        play.setAttribute('aria-hidden', 'true');
        frame.append(play);
      }

      const info = span('work-info');
      info.append(span('work-name', work.title), span('work-type', fileType(work)));
      card.append(frame, info);
      card.addEventListener('click', () => {
        opener = card;
        showWork(index);
        viewer.showModal();
        close.focus({ preventScroll: true });
      });
      return card;
    }

    function filterWorks(category) {
      visible = works.filter(work => category === 'all' || work.category === category);
      for (const filter of filters) {
        const active = filter.dataset.category === category;
        filter.classList.toggle('is-active', active);
        filter.setAttribute('aria-pressed', String(active));
      }
      const cards = document.createDocumentFragment();
      visible.forEach((work, index) => cards.append(createCard(work, index)));
      if (!visible.length) {
        const message = document.createElement('p');
        message.className = 'gallery-empty';
        message.textContent = '暂时没有作品。';
        cards.append(message);
      }
      grid.replaceChildren(cards);
      if (count) count.textContent = '共 ' + visible.length + ' 件作品';
    }

    function showWork(index) {
      position = index;
      const work = visible[index];
      const dimensions = work.width && work.height ? work.width + ' × ' + work.height : '';
      const details = [categoryNames[work.category], fileType(work), dimensions].filter(Boolean).join(' · ');
      heading.textContent = work.title;
      meta.textContent = details;
      image.hidden = false;
      image.alt = work.title;
      image.onerror = () => {
        image.onerror = null;
        if (work.thumb && work.thumb !== work.src) {
          meta.textContent = details + ' · 原图载入失败，显示缩略图';
          image.onerror = () => {
            image.hidden = true;
            meta.textContent = details + ' · 图片载入失败';
          };
          image.src = work.thumb;
        } else {
          image.hidden = true;
          meta.textContent = details + ' · 图片载入失败';
        }
      };
      image.src = work.src;
      prepareDownload(work);
      previous.disabled = next.disabled = visible.length < 2;
    }

    function step(offset) {
      if (!viewer.open || visible.length < 2) return;
      showWork((position + offset + visible.length) % visible.length);
    }

    for (const filter of filters) {
      filter.addEventListener('click', () => filterWorks(filter.dataset.category));
    }
    previous.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    close.addEventListener('click', () => viewer.close());
    viewer.addEventListener('keydown', event => {
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      step(event.key === 'ArrowLeft' ? -1 : 1);
    });
    viewer.addEventListener('click', event => {
      if (event.target !== viewer) return;
      const box = viewer.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right ||
          event.clientY < box.top || event.clientY > box.bottom) viewer.close();
    });
    viewer.addEventListener('close', () => {
      // A previous close event can arrive after the viewer has already reopened.
      if (viewer.open) return;
      releaseDownload();
      image.onerror = null;
      image.removeAttribute('src');
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      opener = null;
      position = -1;
    });

    filterWorks('all');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGallery, { once: true });
  } else {
    startGallery();
  }
})();