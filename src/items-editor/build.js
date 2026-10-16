// Assembles lore-preview.html from page.html + logic.js + ui.js + example.yml + mcdata.json (CRLF output).
const fs = require('fs');
const path = require('path');
const here = __dirname;
const out = process.argv[2];
const read = f => fs.readFileSync(path.join(here, f), 'utf8').replace(/\r\n/g, '\n');
const indent = (s, pad) => s.replace(/\n$/, '').split('\n').map(l => (l ? pad + l : l)).join('\n');
const data = fs.readFileSync(path.join(here, 'mcdata.json'), 'utf8').replace(/<\//g, '<\\/');
let html = read('page.html');
html = html.replace('__MCDATA__', () => data)
  .replace('__EXAMPLE__', () => '\n' + read('example.yml'))
  .replace('__LOGIC__', () => indent(read('logic.js'), '  '))
  .replace('__UI__', () => indent(read('ui.js'), '  '));
if (/<\/script/i.test(read('example.yml'))) throw new Error('example.yml cannot contain </script');
fs.writeFileSync(out, html.replace(/\n/g, '\r\n'));
console.log('wrote', out, html.length);
