import fs from 'fs';

const content = fs.readFileSync('pw-out.txt', 'utf16le');
const lines = content.split('\n');
let count = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Error:')) {
    console.log(lines.slice(Math.max(0, i - 1), i + 4).join('\n'));
    count++;
    if (count > 10) break;
  }
}
