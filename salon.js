(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const salon = byId('salon');
  const canvas = byId('hairCanvas');
  const mini = byId('hairMiniCanvas');
  const save = byId('hairSave');
  const compare = byId('hairCompare');
  const status = byId('hairStatus');
  const defaults = Object.freeze({
    mode: 'original', primary: '#82553c', secondary: '#ccaa8d',
    lightness: 0, saturation: 100, gloss: 0, volume: 100
  });
  const palette = [
    ['墨黑', '#28232a'], ['栗棕', '#82553c'], ['蜂蜜金', '#ce9c55'],
    ['酒红', '#a23447'], ['银灰', '#b0b0ba'], ['雾蓝', '#4c7093'], ['浅玫瑰', '#ccaa8d']
  ];
  const structureFields = [
    ['hairLength', 'length'], ['hairCurl', 'curl'], ['hairFringe', 'fringe'],
    ['hairPart', 'part'], ['hairTie', 'tie'], ['hairSides', 'sides']
  ];
  const numericFields = [
    ['hairVolume', 'volumeValue', 'volume', '%'],
    ['hairGloss', 'glossValue', 'gloss', '%'],
    ['hairLightness', 'lightValue', 'lightness', ''],
    ['hairSaturation', 'satValue', 'saturation', '%']
  ];
  const tabs = Array.from(salon.querySelectorAll('[role="tab"]'));
  let series = 'hairclip';
  let selectedId = 'hc01';
  const lastStyle = { hairclip: selectedId, original: 'original' };
  let conditions = [];
  let settings = { ...defaults };
  let comparing = false;
  let initialized = false;
  let version = 0;
  let frame = 0;
  let styles = [];

  function chosen() {
    return styles.find(style => style.id === selectedId);
  }

  function openTab(tab) {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      byId(item.getAttribute('aria-controls')).hidden = !active;
    }
  }

  function setOptions(select, entries) {
    select.replaceChildren(...entries.map(([value, label]) => new Option(label, value)));
  }

  function refreshControls() {
    const style = chosen();
    byId('hairStyle').value = style.id;
    for (const [id, key] of structureFields) byId(id).value = style[key];
    byId('hairMode').value = settings.mode;
    byId('hairPrimary').value = settings.primary;
    byId('hairSecondary').value = settings.secondary;
    const originalColor = settings.mode === 'original';
    byId('hairSecondaryRow').hidden = originalColor || settings.mode === 'solid';
    byId('hairColorTuning').disabled = originalColor;
    byId('hairColorHelp').hidden = !originalColor;
    for (const [id, outputId, key, suffix] of numericFields) {
      byId(id).value = settings[key];
      byId(outputId).textContent = settings[key] + suffix;
    }
    for (const button of salon.querySelectorAll('.salon-swatch')) {
      const swatch = button.dataset.color;
      button.setAttribute('aria-pressed', String(!originalColor && settings[button.dataset.channel] === swatch));
    }
    for (const card of salon.querySelectorAll('.salon-look')) {
      card.setAttribute('aria-pressed', String(card.dataset.style === selectedId));
    }
    compare.setAttribute('aria-pressed', String(comparing));
    compare.textContent = comparing ? '返回当前造型' : '对比原生短发';
  }

  function redraw() {
    refreshControls();
    const current = ++version;
    cancelAnimationFrame(frame);
    save.disabled = true;
    canvas.setAttribute('aria-busy', 'true');
    status.textContent = '';
    frame = requestAnimationFrame(async () => {
      const previewId = comparing ? 'original' : selectedId;
      const name = comparing ? '原生短发' : chosen().title;
      try {
        const painted = await window.PointSalon.render(canvas, previewId, comparing ? defaults : { ...settings });
        if (current !== version || painted === false) return;
        byId('hairPrintTitle').textContent = name;
        byId('hairPrintState').textContent = comparing ? '对比照' : '试发照';
        canvas.setAttribute('aria-label', '点胖的' + name + (comparing ? '对比照' : '试发照'));
        mini.getContext('2d').drawImage(canvas, 0, 0, mini.width, mini.height);
        save.disabled = false;
      } catch {
        if (current !== version) return;
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        mini.getContext('2d').clearRect(0, 0, mini.width, mini.height);
        status.textContent = '这张试发照暂时无法载入，可以点选样片重试。';
      } finally {
        if (current === version) canvas.removeAttribute('aria-busy');
      }
    });
  }

  function seriesStyles() {
    return styles.filter(style => (style.english ? 'hairclip' : 'original') === series);
  }

  function selectStyle(id) {
    selectedId = lastStyle[series] = id;
    comparing = false;
    redraw();
  }

  function chooseExplicit(id) {
    const next = styles.find(style => style.id === id);
    conditions = conditions.filter(([key, value]) => next[key] === value);
    selectStyle(id);
    filterLookbook();
  }

  function chooseStructure(key, value) {
    const previous = chosen();
    let eligible = seriesStyles().filter(style => style[key] === value);
    const kept = [[key, value]];
    // Keep compatible earlier decisions, most recent first.
    for (const [other, wanted] of conditions) {
      if (other === key) continue;
      const narrowed = eligible.filter(style => style[other] === wanted);
      if (narrowed.length) {
        eligible = narrowed;
        kept.push([other, wanted]);
      }
    }
    conditions = kept;
    const score = style => structureFields.reduce((n, [, field]) => n + Number(style[field] === previous[field]), 0);
    const nearest = eligible.reduce((best, style) => score(style) > score(best) ? style : best);
    selectStyle(nearest.id);
    filterLookbook();
  }

  function useSeries(name) {
    if (name === series) return;
    series = name;
    conditions = [];
    byId('hairQuery').value = '';
    populateSeries();
    selectStyle(lastStyle[name]);
    filterLookbook();
  }

  function populateSeries() {
    const group = seriesStyles();
    byId('hairSeries').value = series;
    setOptions(byId('hairStyle'), group.map(s => [s.id, s.title + (s.english ? ' · ' + s.english : '')]));
    for (const [id, key] of structureFields) {
      setOptions(byId(id), [...new Set(group.map(s => s[key]))].map(value => [value, value]));
    }
    for (const button of byId('salon').querySelectorAll('[data-hair-series]')) {
      button.setAttribute('aria-pressed', String(button.dataset.hairSeries === series));
    }
  }

  function searchable(text) {
    return text.toLowerCase().replace(/hairstyle/g, '').replace(/[\s_-]+/g, '');
  }

  function filterLookbook() {
    const group = seriesStyles();
    const query = searchable(byId('hairQuery').value.trim());
    const compatible = group.filter(style => conditions.every(([key, value]) => style[key] === value));
    const hits = new Set(compatible.filter(style =>
      searchable([style.title, style.english || '', ...structureFields.map(([,key]) => style[key])].join(' ')).includes(query)
    ).map(s => s.id));
    for (const card of byId('hairLookbook').children) card.hidden = !hits.has(card.dataset.style);
    byId('hairNoResults').hidden = hits.size !== 0;
    byId('hairStyleCount').textContent = '显示 ' + hits.size + ' / ' + group.length + ' 款';
    byId('hairMatchBar').hidden = byId('hairAllMatches').hidden = !conditions.length;
    byId('hairMatchDetails').textContent = conditions.length
      ? conditions.map(([,value]) => value).join(' · ') + '，共匹配 ' + compatible.length + ' 款'
      : '';
  }

  function setValue(key, value) {
    settings[key] = value;
    if (key === 'primary' && settings.mode === 'original') settings.mode = 'solid';
    comparing = false;
    redraw();
  }

  function jumpToPhoto() {
    byId('tryOn').scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function makeLookbook() {
    const fragment = document.createDocumentFragment();
    for (const style of styles) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'salon-look';
      button.dataset.style = style.id;
      button.setAttribute('aria-label', '试用' + style.title);
      const image = new Image();
      image.alt = '';
      image.loading = 'lazy';
      image.src = style.src;
      const name = document.createElement('strong');
      name.textContent = style.title;
      button.append(image, name);
      if (style.english) {
        const english = document.createElement('small');
        english.textContent = style.english;
        english.lang = 'en';
        button.append(english);
      }
      button.addEventListener('click', () => {
        chooseExplicit(style.id);
        if (byId('tryOn').getBoundingClientRect().bottom < 90) jumpToPhoto();
      });
      fragment.append(button);
    }
    byId('hairLookbook').append(fragment);
    filterLookbook();
  }

  function makeSwatches(group, channel) {
    for (const [name, color] of palette) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'salon-swatch';
      button.dataset.channel = channel;
      button.dataset.color = color;
      button.title = name;
      button.setAttribute('aria-label', (channel === 'primary' ? '主色' : '辅色') + '，' + name);
      const sample = document.createElement('i');
      sample.style.setProperty('--swatch', color);
      button.append(sample);
      button.addEventListener('click', () => setValue(channel, color));
      group.append(button);
    }
  }

  function savePhoto() {
    if (save.disabled) return;
    const fileName = '点胖-' + byId('hairPrintTitle').textContent + '-' + byId('hairPrintState').textContent + '.png';
    canvas.toBlob(blob => {
      if (!blob) { status.textContent = '照片保存失败，请再试一次。'; return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }, 'image/png');
  }

  function initialize() {
    if (initialized) return;
    styles = window.PointSalon && window.PointSalon.styles;
    if (!styles || !styles.length) {
      status.textContent = '暂时无法加载发型样片。';
      return;
    }
    initialized = true;
    populateSeries();
    for (const [id, key] of structureFields) {
      byId(id).addEventListener('change', event => chooseStructure(key, event.target.value));
    }
    byId('hairSeries').addEventListener('change', event => useSeries(event.target.value));
    for (const button of salon.querySelectorAll('[data-hair-series]')) {
      button.addEventListener('click', () => useSeries(button.dataset.hairSeries));
    }
    byId('hairQuery').addEventListener('input', filterLookbook);
    for (const id of ['hairClearMatch', 'hairAllMatches']) {
      byId(id).addEventListener('click', () => { conditions = []; filterLookbook(); });
    }
    makeLookbook();
    makeSwatches(byId('hairSwatches'), 'primary');
    makeSwatches(byId('hairSecondarySwatches'), 'secondary');
    for (const [id, , key] of numericFields) {
      byId(id).addEventListener('input', event => setValue(key, Number(event.target.value)));
    }
    byId('hairStyle').addEventListener('change', event => chooseExplicit(event.target.value));
    byId('hairMode').addEventListener('change', event => setValue('mode', event.target.value));
    byId('hairPrimary').addEventListener('input', event => setValue('primary', event.target.value));
    byId('hairSecondary').addEventListener('input', event => setValue('secondary', event.target.value));
    byId('hairReset').addEventListener('click', () => { settings = { ...defaults }; comparing = false; redraw(); });
    compare.addEventListener('click', () => { comparing = !comparing; redraw(); });
    save.addEventListener('click', savePhoto);
    byId('hairMiniButton').addEventListener('click', jumpToPhoto);
    for (const [index, tab] of tabs.entries()) {
      tab.addEventListener('click', () => openTab(tab));
      tab.addEventListener('keydown', event => {
        const target = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length,
          Home: 0, End: tabs.length - 1 }[event.key];
        if (target === undefined) return;
        event.preventDefault();
        openTab(tabs[target]);
        tabs[target].focus();
      });
    }
    redraw();
  }

  window.addEventListener('dianpang:salon', initialize);
})();
