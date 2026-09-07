const SORTS = [
  { key: 'warehouse', label: '倉位', col: 0, type: 'text' },
  { key: 'asset', label: '資產', col: 1, type: 'text' },
  { key: 'market', label: '市值', col: 6, type: 'number' },
  { key: 'pnl', label: '未實現', col: 7, type: 'number' }
];

let current = { key: null, dir: 'desc' };

function parseNumber(text) {
  const cleaned = String(text || '')
    .replace(/[,+U\s]/g, '')
    .replace(/—/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

function valueOf(row, sort) {
  const cell = row.cells[sort.col];
  if (!cell) return sort.type === 'number' ? Number.NEGATIVE_INFINITY : '';
  const text = cell.textContent.trim();
  return sort.type === 'number' ? parseNumber(text) : text;
}

function findAllHoldingsCard() {
  return [...document.querySelectorAll('#dashboard .card.section')]
    .find(card => card.querySelector('h2')?.textContent.trim() === '全部持倉');
}

function sortTable(card, sort, dir) {
  const tbody = card?.querySelector('table tbody');
  if (!tbody) return;
  const rows = [...tbody.rows];
  rows.sort((a, b) => {
    const av = valueOf(a, sort);
    const bv = valueOf(b, sort);
    let cmp;
    if (sort.type === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv), 'zh-Hant', { numeric: true });
    return dir === 'asc' ? cmp : -cmp;
  });
  rows.forEach(row => tbody.appendChild(row));
}

function updateButtons(toolbar) {
  toolbar.querySelectorAll('[data-holding-sort]').forEach(btn => {
    const active = btn.dataset.holdingSort === current.key;
    btn.classList.toggle('primary', active);
    const sort = SORTS.find(s => s.key === btn.dataset.holdingSort);
    btn.textContent = active ? `${sort.label} ${current.dir === 'asc' ? '↑' : '↓'}` : sort.label;
  });
}

function mountSortControls() {
  const card = findAllHoldingsCard();
  if (!card || card.querySelector('.holdings-sort')) return;
  const heading = card.querySelector('h2');
  if (!heading) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar holdings-sort';
  toolbar.style.margin = '0 0 12px';
  toolbar.style.gap = '8px';
  toolbar.innerHTML = `<span class="muted">排序</span>${SORTS.map(s => `<button type="button" class="btn" data-holding-sort="${s.key}">${s.label}</button>`).join('')}<button type="button" class="btn" data-holding-reset>原始順序</button>`;
  heading.insertAdjacentElement('afterend', toolbar);

  toolbar.querySelectorAll('[data-holding-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.holdingSort;
      if (current.key === key) current.dir = current.dir === 'asc' ? 'desc' : 'asc';
      else {
        current.key = key;
        current.dir = ['market', 'pnl'].includes(key) ? 'desc' : 'asc';
      }
      const sort = SORTS.find(s => s.key === current.key);
      sortTable(card, sort, current.dir);
      updateButtons(toolbar);
    });
  });

  toolbar.querySelector('[data-holding-reset]').addEventListener('click', () => {
    current = { key: null, dir: 'desc' };
    // Dashboard re-render restores the calculation/display order without touching records.
    document.querySelector('#tabs [data-tab="dashboard"]')?.click();
    const refresh = document.querySelector('#refreshPrices');
    if (refresh) {
      // Do not trigger a price fetch; just rebuild controls on the next normal dashboard render.
      const cardNow = findAllHoldingsCard();
      if (cardNow) {
        const rows = [...cardNow.querySelectorAll('tbody tr')];
        rows.sort((a,b) => Number(a.dataset.originalIndex || 0) - Number(b.dataset.originalIndex || 0));
      }
    }
  });

  [...card.querySelectorAll('tbody tr')].forEach((row, i) => row.dataset.originalIndex = i);
}

const observer = new MutationObserver(() => mountSortControls());
observer.observe(document.documentElement, { childList: true, subtree: true });
mountSortControls();
