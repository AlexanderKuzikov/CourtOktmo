let a = '368220, Республика Дагестан, г. Буйнакск, ул. Шамхалова, д. 1';

// Test \b vs lookbehind
console.log('\\b     :', a.replace(/\bг\.(?=\s)/g, 'Г!'));
console.log('\\b+u   :', a.replace(/\bг\.(?=\s)/gu, 'Г!'));
console.log('lookbh :', a.replace(/(?<![а-яёА-ЯЁ])г\.(?=\s)/g, 'Г!'));

// With unicode property escapes
console.log('\\p{L}+u:', a.replace(/(?<!\p{L})г\.(?=\s)/gu, 'Г!'));

// Full normalize test with lookbehind
let result = a;
for (const p of ['г','ул','д','с','п','пр','пер','р-н','наб','ш','б-р','пл','обл','край','респ','авт','пгт','гп','кп','сл','аллея','пр-кт','пр-д','зд','стр','влд','соор','к','корп','литер','бульв','ал','бул','туп','тракт','мкр','лн','км','спуск','проезд','дор','тер','просп','пр-т']) {
    result = result.replace(new RegExp(`(?<!\\p{L})${p}\\.(?=\\s|,|$|\\d)`, 'gu'), p);
}
console.log('\nFull fix:', result);
