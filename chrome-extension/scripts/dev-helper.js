#!/usr/bin/env node

/**
 * Development helper script for Chrome extension
 * Provides utilities for development workflow
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const command = process.argv[2];

switch (command) {
  case 'check':
    checkExtensionStructure();
    break;
  case 'clean':
    cleanBuildFiles();
    break;
  case 'info':
    showExtensionInfo();
    break;
  default:
    showHelp();
}

function checkExtensionStructure() {
  console.log('🔍 Checking Chrome extension structure...\n');

  const distPath = path.join(__dirname, '../dist');
  const requiredFiles = [
    'manifest.json',
    'popup/index.html',
    'sidepanel/index.html',
    'options/index.html',
    'background/service-worker.js',
    'content/github-integration.js',
    'content/github-styles.css',
    'assets/icons/icon-16.png',
    'assets/icons/icon-32.png',
    'assets/icons/icon-48.png',
    'assets/icons/icon-128.png'
  ];

  let allGood = true;

  if (!fs.existsSync(distPath)) {
    console.log('❌ dist folder not found. Run "npm run build" first.');
    return;
  }

  requiredFiles.forEach(file => {
    const filePath = path.join(distPath, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file} - MISSING`);
      allGood = false;
    }
  });

  if (allGood) {
    console.log('\n🎉 All required files are present!');
    console.log('\n📋 Next steps:');
    console.log('1. Open Chrome and go to chrome://extensions/');
    console.log('2. Enable "Developer mode"');
    console.log('3. Click "Load unpacked" and select the dist folder');
  } else {
    console.log('\n⚠️  Some files are missing. Run "npm run build" to generate them.');
  }
}

function cleanBuildFiles() {
  console.log('🧹 Cleaning build files...\n');

  const distPath = path.join(__dirname, '../dist');

  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
    console.log('✅ Removed dist folder');
  } else {
    console.log('ℹ️  dist folder already clean');
  }

  console.log('\n🎯 Run "npm run build" to rebuild the extension.');
}

function showExtensionInfo() {
  console.log('📦 Repotools Chrome Extension\n');

  const packagePath = path.join(__dirname, '../package.json');
  const manifestPath = path.join(__dirname, '../dist/manifest.json');

  if (fs.existsSync(packagePath)) {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    console.log(`Name: ${pkg.name}`);
    console.log(`Version: ${pkg.version}`);
    console.log(`Description: ${pkg.description}\n`);
  }

  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log('📋 Extension Manifest:');
    console.log(`  Manifest Version: ${manifest.manifest_version}`);
    console.log(`  Name: ${manifest.name}`);
    console.log(`  Version: ${manifest.version}`);
    console.log(`  Permissions: ${manifest.permissions.join(', ')}`);
    console.log(`  Host Permissions: ${manifest.host_permissions.join(', ')}\n`);
  } else {
    console.log('⚠️  Extension not built yet. Run "npm run build" first.\n');
  }

  console.log('🛠️  Available Scripts:');
  console.log('  npm run dev        - Development build with watch');
  console.log('  npm run build      - Production build');
  console.log('  npm run build:full - Build with icons');
  console.log('  npm run validate   - Type check and lint');
  console.log('  npm run setup      - Full setup from scratch');
}

function showHelp() {
  console.log('🚀 Chrome Extension Development Helper\n');
  console.log('Usage: node scripts/dev-helper.js <command>\n');
  console.log('Commands:');
  console.log('  check  - Check if all required extension files are present');
  console.log('  clean  - Clean build files');
  console.log('  info   - Show extension information');
  console.log('  help   - Show this help message\n');
  console.log('Examples:');
  console.log('  node scripts/dev-helper.js check');
  console.log('  node scripts/dev-helper.js clean');
  console.log('  node scripts/dev-helper.js info');
}
