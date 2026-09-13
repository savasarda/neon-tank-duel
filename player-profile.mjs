export const TANK_COLORS = [
  {value:'#17e6ff',label:'Turkuaz'}, {value:'#ff3fb4',label:'Pembe'},
  {value:'#ffe04b',label:'Sarı'}, {value:'#71ff6b',label:'Yeşil'},
  {value:'#b18aff',label:'Mor'}, {value:'#ff924b',label:'Turuncu'},
  {value:'#eeeeff',label:'Beyaz'}, {value:'#508dff',label:'Mavi'},
];
export const BADGES = [
  {value:'★',label:'Yıldız'}, {value:'◆',label:'Elmas'}, {value:'⚡',label:'Şimşek'},
  {value:'♛',label:'Taç'}, {value:'✿',label:'Çiçek'}, {value:'☄',label:'Meteor'},
];

export function assignProfile(raw, players = []) {
  const profile=raw && typeof raw==='object' ? raw : {};
  const clean=typeof profile.name==='string' ? profile.name.normalize('NFC').replace(/[^\p{L}\p{N} _-]/gu,'').replace(/\s+/g,' ').trim().slice(0,12) : '';
  const base=clean || `Oyuncu ${players.length+1}`;
  let name=base,suffix=2;
  while(players.some(player=>player.name?.toLocaleLowerCase('tr')===name.toLocaleLowerCase('tr'))){
    const ending=` ${suffix++}`;name=base.slice(0,12-ending.length)+ending;
  }
  const requested=TANK_COLORS.some(color=>color.value===profile.color)?profile.color:TANK_COLORS[players.length%TANK_COLORS.length].value;
  const color=players.some(player=>player.color===requested)?TANK_COLORS.find(color=>!players.some(player=>player.color===color.value)).value:requested;
  return {name,color,badge:BADGES.some(badge=>badge.value===profile.badge)?profile.badge:BADGES[0].value};
}
