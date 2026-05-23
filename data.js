// ===== MOCK DATA =====

const CAPES = [
  { id: 'migrator',    name: 'Migrator Cape',      wearers: 8420311, color: '#6366f1', rare: false },
  { id: 'vanilla',    name: 'Vanilla Cape',         wearers: 2140000, color: '#f59e0b', rare: false },
  { id: 'minecon11',  name: 'MineCon 2011',         wearers: 4200,    color: '#10b981', rare: true  },
  { id: 'minecon12',  name: 'MineCon 2012',         wearers: 7800,    color: '#10b981', rare: true  },
  { id: 'minecon13',  name: 'MineCon 2013',         wearers: 11200,   color: '#10b981', rare: true  },
  { id: 'minecon15',  name: 'MineCon 2015',         wearers: 14600,   color: '#10b981', rare: true  },
  { id: 'minecon16',  name: 'MineCon 2016',         wearers: 19800,   color: '#10b981', rare: true  },
  { id: 'earth',      name: 'Minecraft Earth',      wearers: 311000,  color: '#22d3ee', rare: false },
  { id: 'birthday',   name: 'Birthday Cape',        wearers: 95400,   color: '#f472b6', rare: false },
  { id: 'follower',   name: 'Follower Cape',        wearers: 432100,  color: '#a78bfa', rare: false },
  { id: 'mojang',     name: 'Mojang Cape',          wearers: 1240,    color: '#ef4444', rare: true  },
  { id: 'translator', name: 'Translator Cape',      wearers: 3100,    color: '#f97316', rare: true  },
  { id: 'cobalt',     name: 'Cobalt Cape',          wearers: 890,     color: '#3b82f6', rare: true  },
  { id: 'scrolls',    name: 'Scrolls Champion',     wearers: 2240,    color: '#8b5cf6', rare: true  },
  { id: 'turtle',     name: 'Turtle Cape',          wearers: 560400,  color: '#84cc16', rare: false },
  { id: 'cherry',     name: 'Cherry Blossom',       wearers: 287600,  color: '#fb7185', rare: false },
];

const POPULAR_PLAYERS = [
  { name: 'Dream',       uuid: '69e76b14-1d14-4b87-9b5b-01b32e9b6f4c', cape: 'minecon16', followers: '1.2M' },
  { name: 'Technoblade', uuid: 'b876ec32-e396-476b-a115-8438d83c67d4', cape: 'migrator',  followers: '987K' },
  { name: 'TommyInnit',  uuid: 'e94de2df-60c0-4dea-baa2-e4c29d82cbb8', cape: 'vanilla',  followers: '876K' },
  { name: 'Ph1LzA',      uuid: 'a5704282-91f1-400e-9e8e-e57d29562e70', cape: 'minecon15', followers: '654K' },
  { name: 'Skeppy',      uuid: 'd0e05de7-6067-454d-beae-c4dc7ad2ed9c', cape: 'follower', followers: '543K' },
  { name: 'Wilbur',      uuid: '39f6d1b3-6fe2-44cc-8a70-3e5dace3c5d2', cape: 'migrator',  followers: '498K' },
  { name: 'Quackity',    uuid: '5a9a9e45-d9ea-49cf-a23f-a8e27f0e2c26', cape: 'earth',    followers: '412K' },
  { name: 'Sapnap',      uuid: 'cdb5b06a-2a89-4fcd-a4bf-63e0b02f8e84', cape: 'birthday', followers: '387K' },
];

const CAPE_CHANGES = [
  { name: 'Dream',        uuid: '69e76b14', action: 'equipped', cape: 'MineCon 2016',    time: '2 min ago'  },
  { name: 'xXNinja360Xx', uuid: 'aa92b12c', action: 'removed',  cape: 'Migrator Cape',  time: '5 min ago'  },
  { name: 'CrafterKing',  uuid: 'bc441d2e', action: 'equipped', cape: 'Vanilla Cape',   time: '8 min ago'  },
  { name: 'Notch',        uuid: '069a79f4', action: 'equipped', cape: 'Mojang Cape',    time: '11 min ago' },
  { name: 'SkyMaster9',   uuid: 'd3fa88e1', action: 'removed',  cape: 'Earth Cape',     time: '14 min ago' },
  { name: 'LunaPixel',    uuid: 'f1e90bca', action: 'equipped', cape: 'Cherry Blossom', time: '18 min ago' },
  { name: 'BlazeFighter', uuid: 'a0c33d91', action: 'equipped', cape: 'Turtle Cape',    time: '21 min ago' },
  { name: 'IronGolem99',  uuid: 'e7d225f8', action: 'removed',  cape: 'Follower Cape',  time: '25 min ago' },
  { name: 'RedstoneKing', uuid: 'c412ab3e', action: 'equipped', cape: 'Birthday Cape',  time: '29 min ago' },
  { name: 'Hoshi',        uuid: 'b991c044', action: 'equipped', cape: 'Migrator Cape',  time: '33 min ago' },
];

// Name histories per player (keyed by lowercase username)
const NAME_HISTORIES = {
  dream:       [{ name: 'Dream',          changed: null },           { name: 'DreamWasTaken', changed: 'Jan 15, 2020' }, { name: 'Dream_Shorts', changed: 'Mar 2, 2019'  }],
  technoblade: [{ name: 'Technoblade',    changed: null },           { name: 'Techno_Blade',  changed: 'Aug 7, 2015'  }],
  tommyinnit:  [{ name: 'TommyInnit',     changed: null },           { name: 'TommyOut',      changed: 'Dec 1, 2020'  }, { name: 'TomsinoB',    changed: 'Jun 4, 2019'  }],
  notch:       [{ name: 'Notch',          changed: null }],
  ph1lza:      [{ name: 'Ph1LzA',         changed: null },           { name: 'Ph1LzA_',       changed: 'Apr 12, 2018' }],
  skeppy:      [{ name: 'Skeppy',         changed: null },           { name: 'SkeppySix',     changed: 'Sep 3, 2017'  }],
};

const PLAYER_CAPES = {
  dream:       [{ cape: 'MineCon 2016', from: 'Nov 18, 2016', to: 'Present', status: 'active' }],
  technoblade: [{ cape: 'Migrator Cape', from: 'Mar 10, 2022', to: 'Present', status: 'active' }, { cape: 'MineCon 2015', from: 'Jul 2, 2015', to: 'Mar 10, 2022', status: 'inactive' }],
  tommyinnit:  [{ cape: 'Vanilla Cape', from: 'Jun 1, 2021', to: 'Present', status: 'active' }],
  notch:       [{ cape: 'Mojang Cape', from: 'Jan 1, 2012', to: 'Present', status: 'active' }],
  ph1lza:      [{ cape: 'MineCon 2015', from: 'Jul 2, 2015', to: 'Present', status: 'active' }],
  skeppy:      [{ cape: 'Follower Cape', from: 'Dec 11, 2020', to: 'Present', status: 'active' }],
};

// Crafatar base URL for real player head images
function avatarUrl(uuid) {
  return `https://crafatar.com/avatars/${uuid}?size=64&overlay`;
}

function bodyUrl(uuid) {
  return `https://crafatar.com/renders/body/${uuid}?scale=4&overlay`;
}

// Well-known UUIDs for demo players
const KNOWN_UUIDS = {
  dream:       '69e76b14-1d14-4b87-9b5b-01b32e9b6f4c',
  technoblade: 'b876ec32-e396-476b-a115-8438d83c67d4',
  tommyinnit:  'e94de2df-60c0-4dea-baa2-e4c29d82cbb8',
  notch:       '069a79f4-44e9-4726-a5be-fca90e38aaf5',
  ph1lza:      'a5704282-91f1-400e-9e8e-e57d29562e70',
  skeppy:      'd0e05de7-6067-454d-beae-c4dc7ad2ed9c',
  wilbur:      '39f6d1b3-6fe2-44cc-8a70-3e5dace3c5d2',
  quackity:    '5a9a9e45-d9ea-49cf-a23f-a8e27f0e2c26',
  sapnap:      'cdb5b06a-2a89-4fcd-a4bf-63e0b02f8e84',
};

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}
