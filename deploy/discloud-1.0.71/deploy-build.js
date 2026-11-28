const { spawnSync } = require('node:child_process');
const path = require('node:path');

process.chdir(__dirname);
console.log('[GTS DEPLOY R3] raiz unica; Prisma antes do Next');
console.log('[GTS DEPLOY R3] diretorio:', process.cwd());

function run(moduleName, args) {
  const result = spawnSync(process.execPath, [require.resolve(moduleName), ...args], {
    cwd: __dirname, stdio: 'inherit', env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

// This generates code only; it does not modify the database.
run('prisma', ['generate', '--schema', path.join(__dirname, 'prisma/schema.prisma')]);
const client = require('@prisma/client');
for (const name of ['UserRole', 'CategoriaEstoque', 'StatusEquipe']) {
  if (!client[name]) throw new Error(`Prisma Client sem ${name} apos generate. Verifique a instalacao de @prisma/client.`);
}
console.log('[GTS DEPLOY R3] enums do Prisma confirmados');
run('next/dist/bin/next', ['build', __dirname]);

const fs = require('node:fs');
const buildId = path.join(__dirname, 'dist', 'BUILD_ID');
if (!fs.existsSync(buildId)) throw new Error('Build concluido sem dist/BUILD_ID');
console.log('[GTS DEPLOY R3] build confirmado em dist/BUILD_ID');
