// App Controller for 591 Housing Watch

// State Management
let allHouses = [];
let filteredHouses = [];
let map = null;
let mapMarkers = [];

const filters = {
  search: '',
  source: 'all',
  view: 'list',
  purpose: 'sale',
  region: '',
  section: '',
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
  type: '',
  rooms: '',
  sort: 'default'
};

// DOM Elements
const elements = {
  themeToggle: document.getElementById('theme-toggle'),
  refreshBtn: document.getElementById('refresh-btn'),
  resetBtn: document.getElementById('reset-filters'),
  emptyResetBtn: document.getElementById('empty-reset-btn'),
  
  search: document.getElementById('filter-search'),
  region: document.getElementById('filter-region'),
  section: document.getElementById('filter-section'),
  priceMin: document.getElementById('filter-price-min'),
  priceMax: document.getElementById('filter-price-max'),
  areaMin: document.getElementById('filter-area-min'),
  areaMax: document.getElementById('filter-area-max'),
  type: document.getElementById('filter-type'),
  rooms: document.getElementById('filter-rooms'),
  sort: document.getElementById('filter-sort'),
  
  grid: document.getElementById('listings-grid'),
  emptyState: document.getElementById('empty-state'),
  filteredCount: document.getElementById('filtered-count'),
  activeChips: document.getElementById('active-chips'),
  syncTime: document.getElementById('sync-time'),
  sourceBtns: document.querySelectorAll('.source-btn'),
  purposeBtns: document.querySelectorAll('.purpose-btn'),
  priceLabel: document.getElementById('price-label'),
  priceQuickTags: document.getElementById('price-quick-tags'),
  viewListBtn: document.getElementById('view-list-btn'),
  viewMapBtn: document.getElementById('view-map-btn'),
  mapContainer: document.getElementById('map-container'),
  
  // Stats
  statTotal: document.querySelector('#stat-total .stat-value'),
  statAvgPrice: document.querySelector('#stat-avg-price .stat-value'),
  statAvgUnit: document.querySelector('#stat-avg-unit .stat-value'),
  statCheapest: document.querySelector('#stat-cheapest .stat-value'),
  statUpdate: document.querySelector('#stat-update .stat-value'),
  statLabelAvgPrice: document.getElementById('stat-label-avg-price'),
  statLabelAvgUnit: document.getElementById('stat-label-avg-unit'),
  statLabelCheapest: document.getElementById('stat-label-cheapest')
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  fetchData();
  setupEventListeners();
});

// Setup Dark/Light Theme
function setupTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.className = savedTheme;
  } else {
    // Check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.className = prefersDark ? 'dark' : 'light';
  }

  elements.themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.className = newTheme;
    localStorage.setItem('theme', newTheme);
  });
}

// Fetch Data from data.json
async function fetchData() {
  showSkeletons();
  try {
    // If running via file:// protocol and we have window.crawledData, use it directly
    if (window.location.protocol === 'file:' && window.crawledData) {
      console.log('Running locally via file:// protocol. Using preloaded window.crawledData.');
      allHouses = window.crawledData;
    } else {
      const timestamp = new Date().getTime();
      // Cache bust with query parameter
      const response = await fetch(`data.json?t=${timestamp}`);
      if (!response.ok) throw new Error('Data file not found');
      allHouses = await response.json();
    }
    
    // Sort initially by ID (newest or order of crawling)
    allHouses.reverse();
    
    populateSections();
    applyFilters();
  } catch (error) {
    console.error('Error fetching data:', error);
    
    // If fetch failed but window.crawledData exists, fall back to it
    if (window.crawledData) {
      console.log('Fetch failed, falling back to window.crawledData.');
      allHouses = window.crawledData;
      allHouses.reverse();
      
      populateSections();
      applyFilters();
      return;
    }
    
    elements.grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="color: hsl(0, 80%, 60%);"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <h3>資料庫載入失敗</h3>
        <p>無法讀取 <code>data.json</code>。請確認爬蟲程式已成功運行，且已生成資料庫檔案。</p>
        <p style="font-size: 0.9rem; margin-top: 10px; opacity: 0.85;">提示：若您是直接雙擊開啟 HTML 檔案，可能會受到瀏覽器 CORS 安全限制。請確認已重新執行爬蟲以產生 <code>data.js</code> 檔案，或是在終端機執行 <code>python -m http.server 8000</code> 開啟本地伺服器。</p>
      </div>
    `;
  }
}

// Show skeleton loading cards
function showSkeletons() {
  elements.emptyState.classList.add('hidden');
  elements.grid.innerHTML = Array(6).fill('<div class="skeleton-card"></div>').join('');
}

// Dynamic dropdown configuration for districts/sections based on selected city
function populateSections() {
  const selectedRegion = elements.region.value;
  elements.section.innerHTML = '<option value="">全部行政區</option>';
  
  if (!selectedRegion) {
    elements.section.disabled = true;
    return;
  }
  
  // Extract unique sections for the selected region
  const sectionsSet = new Set();
  allHouses.forEach(house => {
    if (house.region === selectedRegion && house.section) {
      sectionsSet.add(house.section);
    }
  });
  
  const sections = Array.from(sectionsSet).sort();
  sections.forEach(sec => {
    const opt = document.createElement('option');
    opt.value = sec;
    opt.textContent = sec;
    elements.section.appendChild(opt);
  });
  
  elements.section.disabled = false;
}

// Setup Event Listeners
function setupEventListeners() {
  // Purpose (transaction type) toggle buttons
  elements.purposeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPurpose = btn.dataset.purpose;
      if (filters.purpose === targetPurpose) return;
      
      filters.purpose = targetPurpose;
      elements.purposeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Clear current price filters
      filters.priceMin = null;
      filters.priceMax = null;
      elements.priceMin.value = '';
      elements.priceMax.value = '';
      
      // Update price label and inputs placeholder based on purpose
      if (filters.purpose === 'rent') {
        elements.priceLabel.textContent = '租金範圍 (元 TWD)';
        elements.priceMin.placeholder = '最低 (元)';
        elements.priceMax.placeholder = '最高 (元)';
        
        elements.statLabelAvgPrice.textContent = '平均租金 (元)';
        elements.statLabelAvgUnit.textContent = '平均租金單價 (元/坪)';
        elements.statLabelCheapest.textContent = '最低門檻租金';
        
        elements.priceQuickTags.innerHTML = `
          <button class="quick-tag-btn" data-type="price" data-min="0" data-max="10000">1萬以下</button>
          <button class="quick-tag-btn" data-type="price" data-min="10000" data-max="20000">1萬-2萬</button>
          <button class="quick-tag-btn" data-type="price" data-min="20000" data-max="30000">2萬-3萬</button>
          <button class="quick-tag-btn" data-type="price" data-min="30000" data-max="50000">3萬-5萬</button>
        `;
      } else {
        elements.priceLabel.textContent = '總價範圍 (萬 TWD)';
        elements.priceMin.placeholder = '最低';
        elements.priceMax.placeholder = '最高';
        
        elements.statLabelAvgPrice.textContent = '平均總價 (萬)';
        elements.statLabelAvgUnit.textContent = '平均單價 (萬/坪)';
        elements.statLabelCheapest.textContent = '最低門檻總價';
        
        elements.priceQuickTags.innerHTML = `
          <button class="quick-tag-btn" data-type="price" data-min="0" data-max="1000">1000萬以下</button>
          <button class="quick-tag-btn" data-type="price" data-min="1000" data-max="2000">1000-2000萬</button>
          <button class="quick-tag-btn" data-type="price" data-min="2000" data-max="3000">2000-3000萬</button>
          <button class="quick-tag-btn" data-type="price" data-min="3000" data-max="5000">3000-5000萬</button>
        `;
      }
      
      setupQuickTagsListeners();
      applyFilters();
    });
  });

  // View toggle buttons (list/map)
  elements.viewListBtn.addEventListener('click', () => {
    elements.viewListBtn.classList.add('active');
    elements.viewMapBtn.classList.remove('active');
    elements.grid.classList.remove('hidden');
    elements.mapContainer.classList.add('hidden');
    filters.view = 'list';
  });

  elements.viewMapBtn.addEventListener('click', () => {
    elements.viewMapBtn.classList.add('active');
    elements.viewListBtn.classList.remove('active');
    elements.grid.classList.add('hidden');
    elements.mapContainer.classList.remove('hidden');
    filters.view = 'map';
    
    initMap();
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
    updateMapMarkers();
  });

  // Source filter buttons
  elements.sourceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filters.source = btn.dataset.source;
      elements.sourceBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  });

  // Input filters
  elements.search.addEventListener('input', (e) => {
    filters.search = e.target.value.trim().toLowerCase();
    applyFilters();
  });
  
  elements.region.addEventListener('change', (e) => {
    filters.region = e.target.value;
    filters.section = ''; // reset section when city changes
    populateSections();
    applyFilters();
  });
  
  elements.section.addEventListener('change', (e) => {
    filters.section = e.target.value;
    applyFilters();
  });
  
  const handleRangeInput = (key, element) => {
    element.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      filters[key] = isNaN(val) ? null : val;
      applyFilters();
    });
  };
  
  handleRangeInput('priceMin', elements.priceMin);
  handleRangeInput('priceMax', elements.priceMax);
  handleRangeInput('areaMin', elements.areaMin);
  handleRangeInput('areaMax', elements.areaMax);
  
  elements.type.addEventListener('change', (e) => {
    filters.type = e.target.value;
    applyFilters();
  });
  
  elements.rooms.addEventListener('change', (e) => {
    filters.rooms = e.target.value;
    applyFilters();
  });
  
  elements.sort.addEventListener('change', (e) => {
    filters.sort = e.target.value;
    applyFilters();
  });

  // Action Buttons
  elements.refreshBtn.addEventListener('click', () => {
    fetchData();
  });
  
  const resetAll = () => {
    elements.search.value = '';
    elements.region.value = '';
    elements.section.value = '';
    elements.section.disabled = true;
    elements.priceMin.value = '';
    elements.priceMax.value = '';
    elements.areaMin.value = '';
    elements.areaMax.value = '';
    elements.type.value = '';
    elements.rooms.value = '';
    elements.sort.value = 'default';
    
    // Reset filters object
    Object.keys(filters).forEach(k => {
      if (k === 'sort') filters[k] = 'default';
      else if (k === 'source') filters[k] = 'all';
      else if (k === 'view') filters[k] = 'list';
      else if (k === 'purpose') filters[k] = 'sale';
      else if (k === 'priceMin' || k === 'priceMax' || k === 'areaMin' || k === 'areaMax') filters[k] = null;
      else filters[k] = '';
    });
    
    // Reset source buttons styling
    elements.sourceBtns.forEach(btn => {
      if (btn.dataset.source === 'all') btn.classList.add('active');
      else btn.classList.remove('active');
    });

    // Reset purpose buttons styling
    elements.purposeBtns.forEach(btn => {
      if (btn.dataset.purpose === 'sale') btn.classList.add('active');
      else btn.classList.remove('active');
    });

    // Reset labels back to sale
    elements.priceLabel.textContent = '總價範圍 (萬 TWD)';
    elements.priceMin.placeholder = '最低';
    elements.priceMax.placeholder = '最高';
    
    elements.statLabelAvgPrice.textContent = '平均總價 (萬)';
    elements.statLabelAvgUnit.textContent = '平均單價 (萬/坪)';
    elements.statLabelCheapest.textContent = '最低門檻總價';
    
    elements.priceQuickTags.innerHTML = `
      <button class="quick-tag-btn" data-type="price" data-min="0" data-max="1000">1000萬以下</button>
      <button class="quick-tag-btn" data-type="price" data-min="1000" data-max="2000">1000-2000萬</button>
      <button class="quick-tag-btn" data-type="price" data-min="2000" data-max="3000">2000-3000萬</button>
      <button class="quick-tag-btn" data-type="price" data-min="3000" data-max="5000">3000-5000萬</button>
    `;

    // Reset view buttons active state
    elements.viewListBtn.classList.add('active');
    elements.viewMapBtn.classList.remove('active');
    elements.grid.classList.remove('hidden');
    elements.mapContainer.classList.add('hidden');
    
    setupQuickTagsListeners();
    applyFilters();
  };

  elements.resetBtn.addEventListener('click', resetAll);
  elements.emptyResetBtn.addEventListener('click', resetAll);

  setupQuickTagsListeners();
}

function setupQuickTagsListeners() {
  document.querySelectorAll('.quick-tag-btn').forEach(btn => {
    // Clone node to clear existing listeners and prevent duplicates
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', () => {
      const type = newBtn.dataset.type;
      const min = parseFloat(newBtn.dataset.min);
      const max = parseFloat(newBtn.dataset.max);
      
      const isActive = newBtn.classList.contains('active');
      
      // Deactivate siblings
      document.querySelectorAll(`.quick-tag-btn[data-type="${type}"]`).forEach(b => b.classList.remove('active'));
      
      if (isActive) {
        // Toggle off
        if (type === 'price') {
          filters.priceMin = null;
          filters.priceMax = null;
          elements.priceMin.value = '';
          elements.priceMax.value = '';
        } else {
          filters.areaMin = null;
          filters.areaMax = null;
          elements.areaMin.value = '';
          elements.areaMax.value = '';
        }
      } else {
        // Toggle on
        newBtn.classList.add('active');
        if (type === 'price') {
          filters.priceMin = min;
          filters.priceMax = (max >= 50000 || max === 999) ? null : max;
          elements.priceMin.value = min;
          elements.priceMax.value = (max >= 50000 || max === 999) ? '' : max;
        } else {
          filters.areaMin = min;
          filters.areaMax = max === 999 ? null : max;
          elements.areaMin.value = min;
          elements.areaMax.value = max === 999 ? '' : max;
        }
      }
      applyFilters();
    });
  });
}

// Apply current filter settings to the dataset and refresh layout
function applyFilters() {
  filteredHouses = allHouses.filter(house => {
    // 00. Purpose Filter (sale vs rent)
    const housePurpose = house.purpose || 'sale';
    if (housePurpose !== filters.purpose) {
      return false;
    }

    // 0. Source Filter
    const houseSource = house.source || '591';
    if (filters.source && filters.source !== 'all' && houseSource !== filters.source) {
      return false;
    }

    // 1. Text Search
    if (filters.search) {
      const query = filters.search;
      const matchesText = 
        house.title.toLowerCase().includes(query) ||
        house.address.toLowerCase().includes(query) ||
        house.community.toLowerCase().includes(query) ||
        house.region.toLowerCase().includes(query) ||
        house.section.toLowerCase().includes(query);
      if (!matchesText) return false;
    }
    
    // 2. Region / County
    if (filters.region && house.region !== filters.region) {
      return false;
    }
    
    // 3. Section / District
    if (filters.section && house.section !== filters.section) {
      return false;
    }
    
    // 4. Price range (萬)
    if (filters.priceMin !== null && house.price < filters.priceMin) {
      return false;
    }
    if (filters.priceMax !== null && house.price > filters.priceMax) {
      return false;
    }
    
    // 5. Area range (坪)
    if (filters.areaMin !== null && house.area < filters.areaMin) {
      return false;
    }
    if (filters.areaMax !== null && house.area > filters.areaMax) {
      return false;
    }
    
    // 6. Property Type
    if (filters.type) {
      const typeMatches = house.type && house.type.includes(filters.type);
      if (!typeMatches && filters.type === '住宅' && house.type && (house.type.includes('大樓') || house.type.includes('公寓') || house.type.includes('別墅'))) {
        return false;
      }
      if (!typeMatches && filters.type !== '住宅') {
        return false;
      }
    }
    
    // 7. Rooms
    if (filters.rooms) {
      const roomStr = house.room || '';
      const match = roomStr.match(/(\d+)房/);
      if (!match) return false; // if no rooms data, exclude when filter is active
      
      const numRooms = parseInt(match[1]);
      if (filters.rooms === '4房') {
        if (numRooms < 4) return false;
      } else {
        const targetRooms = parseInt(filters.rooms);
        if (numRooms !== targetRooms) return false;
      }
    }
    
    return true;
  });
  
  applySorting();
  updateStats();
  renderActiveChips();
  renderGrid();

  if (map && filters.view === 'map') {
    updateMapMarkers();
  }
}

// Apply sorting selection to the filtered listings
function applySorting() {
  if (filters.sort === 'price-asc') {
    filteredHouses.sort((a, b) => a.price - b.price);
  } else if (filters.sort === 'price-desc') {
    filteredHouses.sort((a, b) => b.price - a.price);
  } else if (filters.sort === 'area-asc') {
    filteredHouses.sort((a, b) => a.area - b.area);
  } else if (filters.sort === 'area-desc') {
    filteredHouses.sort((a, b) => b.area - a.area);
  } else if (filters.sort === 'age-asc') {
    filteredHouses.sort((a, b) => {
      // Put 0 (N/A or brand new) at the end or handle specifically
      const ageA = a.age === 0 ? 999 : a.age;
      const ageB = b.age === 0 ? 999 : b.age;
      return ageA - ageB;
    });
  }
}

// Recalculate stats for the dashboard based on matching items
function updateStats() {
  const purposeDataset = allHouses.filter(h => (h.purpose || 'sale') === filters.purpose);
  const dataset = filteredHouses.length > 0 ? filteredHouses : purposeDataset;
  
  if (dataset.length === 0) {
    elements.statTotal.textContent = '0';
    elements.statAvgPrice.textContent = '0';
    elements.statAvgUnit.textContent = '0';
    elements.statCheapest.textContent = 'N/A';
    return;
  }
  
  // Total Count (only count matching purpose)
  elements.statTotal.textContent = purposeDataset.length;
  
  // Average Price
  const sumPrice = dataset.reduce((sum, h) => sum + h.price, 0);
  const avgPrice = Math.round(sumPrice / dataset.length);
  elements.statAvgPrice.textContent = avgPrice.toLocaleString('zh-TW');
  
  // Average Unit Price
  let validUnitCount = 0;
  const sumUnit = dataset.reduce((sum, h) => {
    if (!h.unit_price) return sum;
    const match = h.unit_price.match(/([\d\.]+)/);
    if (match) {
      validUnitCount++;
      return sum + parseFloat(match[1]);
    }
    return sum;
  }, 0);
  
  const avgUnit = validUnitCount > 0 ? (sumUnit / validUnitCount).toFixed(1) : '--';
  elements.statAvgUnit.textContent = avgUnit;
  
  // Cheapest house price
  let minPrice = Infinity;
  dataset.forEach(h => {
    if (h.price > 0 && h.price < minPrice) minPrice = h.price;
  });
  const unitText = filters.purpose === 'rent' ? '元' : '萬';
  elements.statCheapest.textContent = minPrice !== Infinity ? `${minPrice.toLocaleString('zh-TW')} ${unitText}` : '--';

  // Crawler Update Info
  if (allHouses.length > 0) {
    const lastCrawlTime = Math.max(...allHouses.map(h => h.last_seen || 0));
    if (lastCrawlTime > 0) {
      const lastCrawlDate = new Date(lastCrawlTime * 1000);
      const formattedTime = lastCrawlDate.toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      // Count items updated within 10 minutes of the last crawl time
      const latestRunCount = allHouses.filter(h => lastCrawlTime - h.last_seen < 600).length;
      if (elements.statUpdate) {
        elements.statUpdate.innerHTML = `${formattedTime} <span style="font-size:0.75rem; font-weight:500; color:var(--text-muted);"> (新爬取 ${latestRunCount} 筆)</span>`;
      }
      if (elements.syncTime) {
        elements.syncTime.textContent = `${lastCrawlDate.toLocaleString('zh-TW')} (本次更新 ${latestRunCount} 筆)`;
      }
    } else {
      if (elements.statUpdate) elements.statUpdate.textContent = '未知';
    }
  } else {
    if (elements.statUpdate) elements.statUpdate.textContent = '--';
  }
}

// Render active filter chips above the grid
function renderActiveChips() {
  elements.activeChips.innerHTML = '';
  
  const createChip = (label, onRemove) => {
    const chip = document.createElement('div');
    chip.className = 'filter-chip';
    chip.innerHTML = `${label} <i class="fa-solid fa-circle-xmark"></i>`;
    chip.querySelector('i').addEventListener('click', onRemove);
    elements.activeChips.appendChild(chip);
  };
  
  if (filters.search) {
    createChip(`搜尋: "${filters.search}"`, () => {
      filters.search = '';
      elements.search.value = '';
      applyFilters();
    });
  }
  
  if (filters.region) {
    createChip(filters.region, () => {
      filters.region = '';
      elements.region.value = '';
      filters.section = '';
      elements.section.value = '';
      elements.section.disabled = true;
      applyFilters();
    });
  }
  
  if (filters.section) {
    createChip(filters.section, () => {
      filters.section = '';
      elements.section.value = '';
      applyFilters();
    });
  }
  
  if (filters.priceMin !== null || filters.priceMax !== null) {
    const minText = filters.priceMin !== null ? `${filters.priceMin}萬` : '不限';
    const maxText = filters.priceMax !== null ? `${filters.priceMax}萬` : '不限';
    createChip(`價格: ${minText}~${maxText}`, () => {
      filters.priceMin = null;
      filters.priceMax = null;
      elements.priceMin.value = '';
      elements.priceMax.value = '';
      document.querySelectorAll('.quick-tag-btn[data-type="price"]').forEach(b => b.classList.remove('active'));
      applyFilters();
    });
  }
  
  if (filters.areaMin !== null || filters.areaMax !== null) {
    const minText = filters.areaMin !== null ? `${filters.areaMin}坪` : '不限';
    const maxText = filters.areaMax !== null ? `${filters.areaMax}坪` : '不限';
    createChip(`坪數: ${minText}~${maxText}`, () => {
      filters.areaMin = null;
      filters.areaMax = null;
      elements.areaMin.value = '';
      elements.areaMax.value = '';
      document.querySelectorAll('.quick-tag-btn[data-type="area"]').forEach(b => b.classList.remove('active'));
      applyFilters();
    });
  }
  
  if (filters.type) {
    createChip(filters.type, () => {
      filters.type = '';
      elements.type.value = '';
      applyFilters();
    });
  }
  
  if (filters.rooms) {
    createChip(filters.rooms, () => {
      filters.rooms = '';
      elements.rooms.value = '';
      applyFilters();
    });
  }
}

// Render property grid dynamically
function renderGrid() {
  elements.filteredCount.textContent = filteredHouses.length;
  
  if (filteredHouses.length === 0) {
    elements.grid.innerHTML = '';
    elements.emptyState.classList.remove('hidden');
    return;
  }
  
  elements.emptyState.classList.add('hidden');
  elements.grid.innerHTML = '';
  
  filteredHouses.forEach(house => {
    const card = document.createElement('article');
    card.className = 'property-card';
    
    // Handle image rendering or fallback
    const imgHTML = house.photo 
      ? `<img class="card-img" src="${house.photo}" alt="${house.title}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
         <div class="img-placeholder" style="display:none;"><i class="fa-solid fa-house"></i><span>無照片</span></div>`
      : `<div class="img-placeholder"><i class="fa-solid fa-house"></i><span>無照片</span></div>`;
      
    const isRent = house.purpose === 'rent';
    const priceUnit = isRent ? '元/月' : '萬';
    const priceStr = isRent ? house.price.toLocaleString('zh-TW') : house.price;
    const ageBadge = (!isRent && house.age) ? `<span class="badge badge-dark">${house.age}年屋齡</span>` : '';

    // Badges
    const badgeHTML = `
      <div class="card-badges">
        <span class="badge badge-orange">${house.type}</span>
        ${ageBadge}
      </div>
    `;
    
    const houseSource = house.source || '591';
    const sourceName = houseSource === 'yungching' ? '永慶房屋' : (houseSource === 'sinyi' ? '信義房屋' : '線上平台');

    const ageLabel = isRent ? '更新時間' : '屋齡';
    const ageIcon = isRent ? 'fa-solid fa-clock-rotate-left' : 'fa-solid fa-calendar-days';
    const ageValue = isRent ? (house.refreshtime || '剛剛') : (house.age ? `${house.age} 年` : '新成屋/不限');

    card.innerHTML = `
      <div class="card-img-wrapper">
        ${imgHTML}
        ${badgeHTML}
        <span class="badge badge-source badge-source-${houseSource}">${sourceName}</span>
      </div>
      <div class="card-content">
        <div class="card-location">
          <i class="fa-solid fa-location-dot"></i>
          <span>${house.region} • ${house.section}</span>
        </div>
        <h3 class="card-title" title="${house.title}">${house.title}</h3>
        <div class="card-specs">
          <div class="spec-item" title="建坪">
            <i class="fa-solid fa-chart-ruler"></i>
            <span>${house.area} 坪</span>
          </div>
          <div class="spec-item" title="格局">
            <i class="fa-solid fa-bed"></i>
            <span>${house.room || '未提供'}</span>
          </div>
          <div class="spec-item" title="社區名稱">
            <i class="fa-solid fa-city"></i>
            <span>${house.community || '無社區資訊'}</span>
          </div>
          <div class="spec-item" title="${ageLabel}">
            <i class="${ageIcon}"></i>
            <span>${ageValue}</span>
          </div>
        </div>
        <div class="card-footer">
          <div class="card-price-area">
            <span class="price-main">${priceStr} <span style="font-size:0.85rem; font-weight:500;">${priceUnit}</span></span>
            <span class="price-unit">${house.unit_price}</span>
          </div>
          <a href="${house.url}" target="_blank" class="card-action-btn">
            看詳情 <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </a>
        </div>
      </div>
    `;
    
    elements.grid.appendChild(card);
  });
}

// 雙北 41 行政區座標資料庫
const DISTRICT_COORDS = {
  // 台北市
  '中正區': [25.0324, 121.5190],
  '萬華區': [25.0354, 121.4997],
  '大同區': [25.0645, 121.5133],
  '中山區': [25.0685, 121.5434],
  '松山區': [25.0592, 121.5574],
  '大安區': [25.0263, 121.5434],
  '信義區': [25.0308, 121.5671],
  '內湖區': [25.0835, 121.5868],
  '南港區': [25.0553, 121.6171],
  '士林區': [25.0903, 121.5245],
  '北投區': [25.1321, 121.4987],
  '文山區': [24.9881, 121.5752],
  
  // 新北市
  '板橋區': [25.0117, 121.4617],
  '新莊區': [25.0360, 121.4326],
  '中和區': [24.9961, 121.4990],
  '永和區': [25.0080, 121.5160],
  '土城區': [24.9734, 121.4426],
  '樹林區': [24.9917, 121.3883],
  '三峽區': [24.9383, 121.3697],
  '鶯歌區': [24.9556, 121.3533],
  '三重區': [25.0640, 121.4900],
  '蘆洲區': [25.0850, 121.4728],
  '五股區': [25.0833, 121.4383],
  '泰山區': [25.0560, 121.4286],
  '林口區': [25.0780, 121.3917],
  '八里區': [25.1472, 121.3983],
  '淡水區': [25.1708, 121.4408],
  '三芝區': [25.2583, 121.5008],
  '石門區': [25.2903, 121.5683],
  '金山區': [25.2217, 121.6367],
  '萬里區': [25.1764, 121.6889],
  '汐止區': [25.0628, 121.6586],
  '深坑區': [24.9983, 121.6156],
  '石碇區': [24.9917, 121.6583],
  '瑞芳區': [25.1089, 121.8058],
  '平溪區': [25.0258, 121.7389],
  '雙溪區': [25.0347, 121.8653],
  '貢寮區': [25.0219, 121.9083],
  '坪林區': [24.9367, 121.7111],
  '烏來區': [24.8639, 121.5508],
  '新店區': [24.9675, 121.5411]
};

// 初始化 Leaflet 地圖
function initMap() {
  if (map) return;
  
  // 預設對焦雙北中心
  map = L.map('map').setView([25.04, 121.53], 12);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

// 更新地圖上的 Markers
function updateMapMarkers() {
  if (!map) return;
  
  // 清除現有 Markers
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];
  
  if (filteredHouses.length === 0) return;
  
  const bounds = [];
  
  filteredHouses.forEach(house => {
    let lat = parseFloat(house.latitude);
    let lng = parseFloat(house.longitude);
    
    // 如果座標為 0，尋找行政區中心並做確定性隨機偏移
    if (isNaN(lat) || isNaN(lng) || (lat === 0.0 && lng === 0.0)) {
      const center = DISTRICT_COORDS[house.section];
      if (center) {
        // 利用唯一 ID 製造確定性的雜湊值偏移 (Deterministic Offset)
        let hash = 0;
        const idStr = String(house.id);
        for (let i = 0; i < idStr.length; i++) {
          hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        // 映射至 [-0.007, +0.007] 度區間，使同行政區房源散開
        const offsetLat = ((hash & 0xFF) / 255.0 - 0.5) * 0.014;
        const offsetLng = (((hash >> 8) & 0xFF) / 255.0 - 0.5) * 0.014;
        lat = center[0] + offsetLat;
        lng = center[1] + offsetLng;
      } else {
        // 預設台北市中心
        lat = 25.04;
        lng = 121.53;
      }
    }
    
    const isRent = house.purpose === 'rent';
    // 依來源與目的賦予 Marker 顏色 (租屋使用冷藍色調分流)
    const sourceColor = isRent 
      ? (house.source === 'sinyi' ? '#06b6d4' : '#0284c7') 
      : (house.source === 'sinyi' ? '#22c55e' : (house.source === 'yungching' ? '#eab308' : '#f97316'));
    
    const marker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: sourceColor,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85
    });
    
    const sourceName = house.source === 'yungching' ? '永慶房屋' : (house.source === 'sinyi' ? '信義房屋' : '線上平台');
    const priceUnit = isRent ? '元/月' : '萬';
    const priceStr = isRent ? house.price.toLocaleString('zh-TW') : house.price;
    const ageText = isRent ? (house.refreshtime || '剛剛') : (house.age ? `${house.age}年` : 'N/A');
    const ageSpecIcon = isRent ? 'fa-clock-rotate-left' : 'fa-calendar-days';
    const ageSpecLabel = isRent ? '更新' : '屋齡';
    
    const popupHTML = `
      <div class="map-popup-card">
        <div class="popup-title">${house.title}</div>
        <div class="popup-price-area">
          <div class="popup-price">${priceStr} <span style="font-size:0.75rem; font-weight:500;">${priceUnit}</span></div>
          <span class="badge badge-source-${house.source || '591'}" style="font-size:0.7rem; padding: 2px 6px; border-radius: 4px; font-weight:600;">${sourceName}</span>
        </div>
        <div class="popup-specs">
          <div class="popup-spec-item"><i class="fa-solid fa-chart-area"></i> <span>建坪: ${house.area} 坪</span></div>
          <div class="popup-spec-item"><i class="fa-solid fa-bed"></i> <span>格局: ${house.room || '未提供'}</span></div>
          <div class="popup-spec-item"><i class="fa-solid ${ageSpecIcon}"></i> <span>${ageSpecLabel}: ${ageText} (${house.type})</span></div>
        </div>
        <a href="${house.url}" target="_blank" class="popup-action-btn">
          看詳情 <i class="fa-solid fa-arrow-up-right-from-square"></i>
        </a>
      </div>
    `;
    
    marker.bindPopup(popupHTML);
    marker.addTo(map);
    mapMarkers.push(marker);
    
    bounds.push([lat, lng]);
  });
  
  // 縮放地圖包圍所有房源 Markers
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }
}

// LINE Notification Settings Modal Logic
const configBtn = document.getElementById('config-btn');
const configModal = document.getElementById('config-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const configForm = document.getElementById('config-form');

if (configBtn && configModal && closeModalBtn && configForm) {
  // Open Modal
  configBtn.addEventListener('click', async () => {
    configModal.classList.remove('hidden');
    
    // Fetch current settings
    try {
      const response = await fetch('/api/config/get');
      if (response.ok) {
        const rules = await response.json();
        
        // Populate inputs
        document.getElementById('cfg-purpose').value = rules.purpose || 'all';
        document.getElementById('cfg-price-min').value = rules.price_min !== null ? rules.price_min : '';
        document.getElementById('cfg-price-max').value = rules.price_max !== null ? rules.price_max : '';
        document.getElementById('cfg-region').value = rules.region || '台北市';
        document.getElementById('cfg-sections').value = Array.isArray(rules.sections) ? rules.sections.join(',') : '';
        document.getElementById('cfg-types').value = Array.isArray(rules.types) ? rules.types.join(',') : '';
        document.getElementById('cfg-rooms').value = Array.isArray(rules.rooms) ? rules.rooms.join(',') : '';
      }
    } catch (error) {
      console.error('Failed to fetch config rules:', error);
    }
  });

  // Close Modal
  closeModalBtn.addEventListener('click', () => {
    configModal.classList.add('hidden');
  });

  // Close on outside click
  window.addEventListener('click', (e) => {
    if (e.target === configModal) {
      configModal.classList.add('hidden');
    }
  });

  // Handle Form Submit
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const priceMinVal = document.getElementById('cfg-price-min').value;
    const priceMaxVal = document.getElementById('cfg-price-max').value;
    
    const rules = {
      purpose: document.getElementById('cfg-purpose').value,
      price_min: priceMinVal !== '' ? parseFloat(priceMinVal) : null,
      price_max: priceMaxVal !== '' ? parseFloat(priceMaxVal) : null,
      region: document.getElementById('cfg-region').value,
      sections: document.getElementById('cfg-sections').value ? document.getElementById('cfg-sections').value.split(',').map(s => s.trim()) : [],
      types: document.getElementById('cfg-types').value ? document.getElementById('cfg-types').value.split(',').map(s => s.trim()) : [],
      rooms: document.getElementById('cfg-rooms').value ? document.getElementById('cfg-rooms').value.split(',').map(r => r.trim()) : []
    };

    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(rules)
      });
      
      const result = await response.json();
      if (response.ok && result.status === 'success') {
        alert('🎉 訂閱條件儲存成功！');
        configModal.classList.add('hidden');
      } else {
        alert('❌ 儲存失敗: ' + (result.message || '未知錯誤'));
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      alert('❌ 無法連線至後端伺服器進行儲存。');
    }
  });
}
