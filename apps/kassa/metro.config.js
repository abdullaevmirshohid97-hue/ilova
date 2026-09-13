// pnpm workspace (node-linker=hoisted) monorepo sozlamasi.
// apps/mobile'da o'z node_modules'i yo'q — hammasi ildizga (d:\ilova\node_modules)
// hoisted qilingan. Metro buni standart holatda bilmaydi va "./index"ni
// ildizga nisbatan qidirib, topolmay xato beradi — shu uchun quyidagilar kerak.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
