// ===== RENDER HELPERS =====

function renderCapeChangeFeed(container, changes, limit) {
  const items = changes.slice(0, limit || changes.length);
  container.innerHTML = items.map(c => {
    const isEquip = c.action === 'equipped';
    return `
      <div class="feed-item">
        <img class="avatar" src="https://crafatar.com/avatars/${c.uuid}?size=64&overlay"
             onerror="this.src='https://crafatar.com/avatars/8667ba71-b85a-4004-af54-457a9734eed7?size=64'"
             alt="${c.name}" />
        <div class="feed-info">
          <div class="feed-name">
            <a href="profile.html?name=${encodeURIComponent(c.name)}">${c.name}</a>
          </div>
          <div class="feed-detail">
            ${isEquip ? 'Equipped' : 'Removed'}
            <span class="cape-name-inline">${c.cape}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <span class="badge ${isEquip ? 'badge-green' : 'badge-red'}">
            ${isEquip ? '+ Equipped' : '- Removed'}
          </span>
          <span class="feed-time">${c.time}</span>
        </div>
      </div>`;
  }).join('');
}

function renderPopularPlayers(container, players) {
  container.innerHTML = players.map(p => `
    <a href="profile.html?name=${encodeURIComponent(p.name)}" class="player-card">
      <img class="avatar"
           src="https://crafatar.com/avatars/${p.uuid}?size=64&overlay"
           onerror="this.src='https://crafatar.com/avatars/8667ba71-b85a-4004-af54-457a9734eed7?size=64'"
           alt="${p.name}" />
      <div class="player-info">
        <div class="player-name">${p.name}</div>
        <div class="player-meta"><i class="fa fa-users" style="font-size:10px;"></i> ${p.followers} followers</div>
      </div>
      <span class="badge badge-blue" style="margin-left:auto;flex-shrink:0;">${p.cape.replace(/minecon/,'MC')}</span>
    </a>`).join('');
}

function renderFeaturedCapes(container, capes) {
  container.innerHTML = capes.map(c => `
    <div class="cape-card" onclick="window.location.href='capes.html#${c.id}'">
      <div class="cape-preview">
        <div style="
          width: 64px; height: 96px;
          background: linear-gradient(135deg, ${c.color}33, ${c.color}66);
          border-radius: 6px;
          border: 2px solid ${c.color}88;
          display:flex; align-items:center; justify-content:center;
          font-size: 28px;
        ">🎭</div>
        ${c.rare ? '<span class="badge badge-yellow" style="position:absolute;top:8px;right:8px;">Rare</span>' : ''}
      </div>
      <div class="cape-body">
        <div class="cape-name">${c.name}</div>
        <div class="cape-wearers"><i class="fa fa-users" style="font-size:10px;"></i> ${formatNumber(c.wearers)} wearers</div>
      </div>
    </div>`).join('');
}

// ===== SEARCH =====

function setupSearch(inputId, dropdownId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { dropdown.classList.remove('show'); return; }

    const matches = POPULAR_PLAYERS.filter(p =>
      p.name.toLowerCase().startsWith(q)
    ).slice(0, 5);

    if (!matches.length) { dropdown.classList.remove('show'); return; }

    dropdown.innerHTML = matches.map(p => `
      <div class="search-result-item" onclick="window.location.href='profile.html?name=${encodeURIComponent(p.name)}'">
        <img src="https://crafatar.com/avatars/${p.uuid}?size=64&overlay"
             onerror="this.src='https://crafatar.com/avatars/8667ba71-b85a-4004-af54-457a9734eed7?size=64'"
             alt="${p.name}" />
        <div>
          <div class="sr-name">${p.name}</div>
          <div class="sr-sub">${p.followers} followers</div>
        </div>
      </div>`).join('');

    dropdown.classList.add('show');
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = input.value.trim();
      if (q) window.location.href = `profile.html?name=${encodeURIComponent(q)}`;
    }
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });
}

// ===== TAB SWITCHING =====

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('[data-tabs]') || btn.parentElement.parentElement;
      group.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === target);
      });
    });
  });
}

// ===== COPY TO CLIPBOARD =====
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa fa-check"></i>';
    setTimeout(() => btn.innerHTML = orig, 1500);
  });
}
