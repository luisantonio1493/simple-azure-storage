const { writeFileSync } = require('fs');
const { join } = require('path');

const targetPath = join(__dirname, 'dist', 'esm', 'package.json');
const content = JSON.stringify({ type: 'module' }, null, 2) + '\n';

writeFileSync(targetPath, content, 'utf8');
