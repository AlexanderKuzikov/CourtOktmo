import { readFileSync } from 'fs';
const courts = JSON.parse(readFileSync('../CourtHarvest2/data/courts.json','utf8')).courts;
const c = courts.find(x => x.code === '05MS0046');
console.log('Address:', c.address);

// Печатаем все шаги normalize + extractLocality
let a = c.address;
for (const p of ['г','ул','д','с','п','пр','пер','р-н','наб','ш','б-р','пл','обл','край','респ','авт','пгт','гп','кп','сл','аллея','пр-кт','пр-д','зд','стр','влд','соор','к','корп','литер','бульв','ал','бул','туп','тракт','мкр','лн','км','спуск','проезд','дор','тер','просп','пр-т']) {
  a = a.replace(new RegExp('\\b' + p + '\\.(?=\\s|,|$|\\d)', 'g'), p);
}
a = a.replace(/\bст\.(?=\s+[А-ЯЁ])/g, 'ст-ца');
a = a.replace(/\bа\.(?=\s+[А-ЯЁ])/g, 'аул');
a = a.replace(/д\.(\d+)/g, 'д $1');
a = a.replace(/\bРеспублика\s+(?=[А-ЯЁ])/g, 'Респ ');

console.log('Normalized:', a);

let noIdx = a.replace(/^\d{3,6}\s*,?\s*/, '').trim();
console.log('No idx:', noIdx);

const parts = noIdx.split(',').map(s => s.trim());
console.log('Parts:', JSON.stringify(parts));

for (const part of parts) {
  const m = part.match(/^(г\.?)\s+([А-ЯЁ][а-яё\-\d]+)/);
  if (m) console.log('  Match г:', m[0], '->', m[2]);
}
