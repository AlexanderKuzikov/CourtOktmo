let a = '368220, Республика Дагестан, г. Буйнакск, ул. Шамхалова, д. 1';
console.log('Char codes:');
for (let i = 0; i < a.length; i++) {
    if (a[i] === '.' || a[i] === 'г' || a[i] === 'Г') {
        console.log(`  [${i}] '${a[i]}' = ${a.charCodeAt(i)} context: ...${a.slice(Math.max(0,i-3), i+4)}...`);
    }
}

// Direct test
const re = /\bг\.(?=\s)/g;
console.log('\nDirect test result:', a.replace(re, 'г!'));

// Test with just \b
const re2 = /\bг/g;
console.log('Word boundary test:', JSON.stringify(a.match(re2)));
