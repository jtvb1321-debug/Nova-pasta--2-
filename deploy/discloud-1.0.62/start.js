const fs = require('node:fs');
const path = require('node:path');
console.log('[GTS DEPLOY R3] iniciando; raiz:', __dirname);
if (!fs.existsSync(path.join(__dirname, 'dist', 'BUILD_ID'))) {
  console.error('[GTS DEPLOY R3] dist/BUILD_ID ausente no ambiente de execucao. O build nao foi disponibilizado neste diretorio.');
  process.exit(1);
}
process.chdir(__dirname);
process.argv = [process.execPath, require.resolve('next/dist/bin/next'), 'start', '-H', '0.0.0.0', '-p', '8080'];
require('next/dist/bin/next');
