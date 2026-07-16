import { readFileSync } from 'fs';

// Тест нормализации — паттерны по одному
let a = '368220, Республика Дагестан, г. Буйнакск, ул. Шамхалова, д. 1';
console.log('Input:', a);

// Тест каждого патерна
const p = 'г';
const re = new RegExp('\\b' + p + '\\.(?=\\s|,|$|\\d)', 'g');
console.log('Regex:', re);
console.log('Flags:', re.flags);
let result = a.replace(re, p);
console.log('After г dot remove:', result);

const re2 = /\bг\.(?=\s|,|$|\d)/g;
console.log('\nLiteral regex:', re2);
result = a.replace(re2, 'г');
console.log('After literal г dot remove:', result);

// Республика
const re3 = /\bРеспублика\s+(?=[А-ЯЁ])/g;
result = a.replace(re3, 'Респ ');
console.log('After Республика:', result);
