const fs = require('fs');
const content = fs.readFileSync('pw-out.txt', 'utf16le');
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Error:')) {
    console.log(lines.slice(Math.max(0, i - 1), i + 3).join('\n'));
    i += 3;
  }
}
