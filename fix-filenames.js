#!/usr/bin/env node

/**
 * Script to fix incorrect filename references after renaming
 */

const fs = require('fs');
const glob = require('glob');

// Fix the require statements in test files
const testFiles = glob.sync('tests/**/*.js');

for (const testFile of testFiles) {
  try {
    let content = fs.readFileSync(testFile, 'utf8');
    
    // Fix incorrect filename references
    content = content.replace(/require\('\.\.\/src\/warpMind\.js'\)/g, "require('../src/warpmind.js')");
    content = content.replace(/require\('\.\/dist\/warpMind\.js'\)/g, "require('./dist/warpmind.js')");
    
    fs.writeFileSync(testFile, content, 'utf8');
    console.log(`Fixed: ${testFile}`);
  } catch (error) {
    console.error(`Error fixing ${testFile}:`, error.message);
  }
}

// Fix webpack config
try {
  let webpackContent = fs.readFileSync('webpack.config.js', 'utf8');
  webpackContent = webpackContent.replace(/entry: '\.\/src\/warpMind\.js'/, "entry: './src/warpmind.js'");
  webpackContent = webpackContent.replace(/filename: 'warpMind\.js'/, "filename: 'warpmind.js'");
  fs.writeFileSync('webpack.config.js', webpackContent, 'utf8');
  console.log('Fixed: webpack.config.js');
} catch (error) {
  console.error('Error fixing webpack.config.js:', error.message);
}

// Fix HTML files
const htmlFiles = glob.sync('examples/**/*.html');
for (const htmlFile of htmlFiles) {
  try {
    let content = fs.readFileSync(htmlFile, 'utf8');
    
    // Fix script src references
    content = content.replace(/src="\.\.\/dist\/warpMind\.js"/g, 'src="../dist/warpmind.js"');
    
    fs.writeFileSync(htmlFile, content, 'utf8');
    console.log(`Fixed: ${htmlFile}`);
  } catch (error) {
    console.error(`Error fixing ${htmlFile}:`, error.message);
  }
}

console.log('Filename fixes completed!');
