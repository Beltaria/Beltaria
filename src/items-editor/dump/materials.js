// Parses Bukkit 1.8.8 Material.java enum constants into [name, id, maxStack, durability].
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const body = src.slice(src.indexOf('public enum Material'), src.indexOf('private final int id;'));
const re = /^\s{4}([A-Z0-9_]+)\(([^)]*)\)[,;]/gm;
const out = [];
let m;
while ((m = re.exec(body))) {
  const args = m[2].split(',').map(s => s.trim());
  const nums = args.filter(a => /^-?\d+$/.test(a)).map(Number);
  const id = nums[0];
  const stack = nums.length > 1 ? nums[1] : 64;
  const dur = nums.length > 2 ? nums[2] : 0;
  out.push([m[1], id, stack, dur]);
}
fs.writeFileSync(process.argv[3], JSON.stringify(out));
console.log(out.length, out.slice(0, 3), out.slice(-2));
