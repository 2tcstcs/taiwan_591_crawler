// App Controller for 591 Housing Watch

// State Management
let allHouses = [];
let filteredHouses = [];
const filters = {
  search: '',
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
  
  // Stats
  statTotal: document.querySelector('#stat-total .stat-value'),
  statAvgPrice: document.querySelector('#stat-avg-price .stat-value'),
  statAvgUnit: document.querySelector('#stat-avg-unit .stat-value'),
  statCheapest: document.querySelector('#stat-cheapest .stat-value')
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
    
    elements.syncTime.textContent = new Date().toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    populateSections();
    applyFilters();
  } catch (error) {
    console.error('Error fetching data:', error);
    
    // If fetch failed but window.crawledData exists, fall back to it
    if (window.crawledData) {
      console.log('Fetch failed, falling back to window.crawledData.');
      allHouses = window.crawledData;
      allHouses.reverse();
      
      elements.syncTime.textContent = new Date().toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
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
      else if (k === 'priceMin' || k === 'priceMax' || k === 'areaMin' || k === 'areaMax') filters[k] = null;
      else filters[k] = '';
    });
    
    // Clear active tags styling
    document.querySelectorAll('.quick-tag-btn').forEach(btn => btn.classList.remove('active'));
    
    applyFilters();
  };

  elements.resetBtn.addEventListener('click', resetAll);
  elements.emptyResetBtn.addEventListener('click', resetAll);

  // Quick Tags
  document.querySelectorAll('.quick-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const min = parseFloat(btn.dataset.min);
      const max = parseFloat(btn.dataset.max);
      
      const isActive = btn.classList.contains('active');
      
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
        btn.classList.add('active');
        if (type === 'price') {
          filters.priceMin = min;
          filters.priceMax = max === 999 ? null : max; // Check for open-ended range
          elements.priceMin.value = min;
          elements.priceMax.value = max === 999 ? '' : max;
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
      if (!typeMatches && filters.type === '住宅' && (house.type.includes('大樓') || house.type.includes('公寓') || house.type.includes('別墅'))) {
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
  const dataset = filteredHouses.length > 0 ? filteredHouses : allHouses;
  
  if (dataset.length === 0) {
    elements.statTotal.textContent = '0';
    elements.statAvgPrice.textContent = '0';
    elements.statAvgUnit.textContent = '0';
    elements.statCheapest.textContent = 'N/A';
    return;
  }
  
  // Total Count
  elements.statTotal.textContent = allHouses.length;
  
  // Average Price (萬)
  const sumPrice = dataset.reduce((sum, h) => sum + h.price, 0);
  const avgPrice = Math.round(sumPrice / dataset.length);
  elements.statAvgPrice.textContent = avgPrice.toLocaleString('zh-TW');
  
  // Average Unit Price (萬/坪)
  // Parse unit price float from string (e.g. "72.96萬/坪")
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
  elements.statCheapest.textContent = minPrice !== Infinity ? `${minPrice} 萬` : '--';
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
      
    // Badges
    const badgeHTML = `
      <div class="card-badges">
        <span class="badge badge-orange">${house.type}</span>
        ${house.age ? `<span class="badge badge-dark">${house.age}年屋齡</span>` : ''}
      </div>
    `;
    
    card.innerHTML = `
      <div class="card-img-wrapper">
        ${imgHTML}
        ${badgeHTML}
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
          <div class="spec-item" title="屋齡">
            <i class="fa-solid fa-calendar-days"></i>
            <span>${house.age ? `${house.age} 年` : '新成屋/不限'}</span>
          </div>
        </div>
        <div class="card-footer">
          <div class="card-price-area">
            <span class="price-main">${house.price} <span style="font-size:0.85rem; font-weight:500;">萬</span></span>
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
