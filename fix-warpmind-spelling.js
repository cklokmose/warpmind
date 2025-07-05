#!/usr/bin/env node

/**
 * Script to replace "Warpmind" with "WarpMind" throughout the project
 */

const fs = require('fs');
const path = require('path');

// Files to exclude from replacement
const excludeFiles = [
  'package.json',
  'package-lock.json',
  'dist/warpmind.js',
  'node_modules',
  '.git',
  'fix-warpmind-spelling.js'
];

// File extensions to process
const includeExtensions = ['.js', '.html', '.md', '.json'];

function shouldProcessFile(filePath) {
  const relativePath = path.relative(process.cwd(), filePath);
  
  // Skip excluded files/directories
  for (const exclude of excludeFiles) {
    if (relativePath.includes(exclude)) {
      return false;
    }
  }
  
  // Only process certain file types
  const ext = path.extname(filePath);
  return includeExtensions.includes(ext);
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Replace various forms of "Warpmind"
    let newContent = content
      .replace(/\bWarpmind\b/g, 'WarpMind')
      .replace(/\bwarpmind\b/g, 'warpMind')
      .replace(/WarpmindUtils/g, 'WarpMindUtils');
    
    // Special case for package.json - keep the package name as "warpmind"
    if (filePath.endsWith('package.json')) {
      newContent = newContent.replace(/"name": "warpMind"/, '"name": "warpmind"');
    }
    
    // Write back if changed
    if (newContent !== content) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`Updated: ${path.relative(process.cwd(), filePath)}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

function walkDirectory(dir) {
  let filesUpdated = 0;
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        filesUpdated += walkDirectory(fullPath);
      } else if (entry.isFile() && shouldProcessFile(fullPath)) {
        if (processFile(fullPath)) {
          filesUpdated++;
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return filesUpdated;
}

// Run the replacement
console.log('Starting Warpmind -> WarpMind replacement...\n');

const startTime = Date.now();
const filesUpdated = walkDirectory(process.cwd());
const endTime = Date.now();

console.log(`\nCompleted in ${endTime - startTime}ms`);
console.log(`Files updated: ${filesUpdated}`);
