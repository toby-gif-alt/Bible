#!/usr/bin/env node

import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';

const errors = [];
const warnings = [];
const bookStats = {};

// Helper to count words in a string
function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Helper to parse reference like "John 3:16" or "1 John 4:9-10"
function parseReference(ref) {
  const match = ref.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) return null;
  return {
    book: match[1],
    chapter: match[2],
    verseStart: match[3],
    verseEnd: match[4] || match[3]
  };
}

// Validate Bible JSON files
async function validateBibleFiles() {
  console.log('Validating Bible JSON files...');
  
  const biblesDir = 'bibles';
  const translations = await readdir(biblesDir);
  
  for (const translation of translations) {
    const translationPath = join(biblesDir, translation);
    const stat = await readFile(join(translationPath, '.'), { encoding: 'utf-8' }).catch(() => null);
    
    // Skip if not a directory
    try {
      const files = await readdir(translationPath);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const bookName = basename(file, '.json');
        const filePath = join(translationPath, file);
        
        bookStats[bookName] = bookStats[bookName] || { translations: [], issues: 0 };
        bookStats[bookName].translations.push(translation);
        
        try {
          const content = await readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          
          // Check that it's an object
          if (typeof data !== 'object' || Array.isArray(data)) {
            errors.push(`${filePath}: Bible data must be an object`);
            bookStats[bookName].issues++;
            continue;
          }
          
          // Check each chapter
          for (const [chapterNum, verses] of Object.entries(data)) {
            // Chapter number should be a numeric string
            if (!/^\d+$/.test(chapterNum)) {
              errors.push(`${filePath}: Invalid chapter key "${chapterNum}" - must be numeric string`);
              bookStats[bookName].issues++;
            }
            
            // Verses must be an array
            if (!Array.isArray(verses)) {
              errors.push(`${filePath}: Chapter ${chapterNum} must be an array of verses`);
              bookStats[bookName].issues++;
              continue;
            }
            
            // No empty arrays
            if (verses.length === 0) {
              errors.push(`${filePath}: Chapter ${chapterNum} has empty verse array`);
              bookStats[bookName].issues++;
            }
            
            // Each verse should be a string
            verses.forEach((verse, idx) => {
              if (typeof verse !== 'string') {
                errors.push(`${filePath}: Chapter ${chapterNum}, verse ${idx + 1} must be a string`);
                bookStats[bookName].issues++;
              }
            });
          }
        } catch (err) {
          errors.push(`${filePath}: ${err.message}`);
          bookStats[bookName].issues++;
        }
      }
    } catch (err) {
      // Not a directory, skip
    }
  }
}

// Load all Bible data for cross-reference validation
async function loadAllBibleData() {
  const bibleData = {};
  const biblesDir = 'bibles';
  
  try {
    const translations = await readdir(biblesDir);
    
    for (const translation of translations) {
      const translationPath = join(biblesDir, translation);
      
      try {
        const files = await readdir(translationPath);
        
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          
          const bookName = basename(file, '.json');
          const filePath = join(translationPath, file);
          
          try {
            const content = await readFile(filePath, 'utf-8');
            const data = JSON.parse(content);
            
            if (!bibleData[bookName]) {
              bibleData[bookName] = data;
            }
          } catch (err) {
            // Skip files with errors
          }
        }
      } catch (err) {
        // Not a directory, skip
      }
    }
  } catch (err) {
    // bibles directory doesn't exist
  }
  
  return bibleData;
}

// Validate cross-reference files
async function validateXrefs(bibleData) {
  console.log('Validating cross-reference files...');
  
  const xrefsDir = 'xrefs';
  
  try {
    const files = await readdir(xrefsDir);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = join(xrefsDir, file);
      
      try {
        const content = await readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        // Check if it's the newer format (with "reference" and "crossReferences" keys)
        if (data.reference && data.crossReferences) {
          // This is the detailed format, skip validation for now
          continue;
        }
        
        // Old format: object with chapter:verse keys
        if (typeof data !== 'object' || Array.isArray(data)) {
          errors.push(`${filePath}: Cross-reference data must be an object`);
          continue;
        }
        
        for (const [key, refs] of Object.entries(data)) {
          // Key should match chapter:verse format
          if (!/^\d+:\d+$/.test(key)) {
            errors.push(`${filePath}: Invalid key "${key}" - must match format "chapter:verse" (e.g., "3:16")`);
          }
          
          // refs should be an array
          if (!Array.isArray(refs)) {
            errors.push(`${filePath}: Value for key "${key}" must be an array`);
            continue;
          }
          
          // Check each reference
          for (const ref of refs) {
            if (typeof ref !== 'string') {
              errors.push(`${filePath}: Reference in "${key}" must be a string`);
              continue;
            }
            
            // Parse and validate the reference
            const parsed = parseReference(ref);
            if (!parsed) {
              warnings.push(`${filePath}: Could not parse reference "${ref}"`);
              continue;
            }
            
            // Check if the referenced book exists in our Bible data
            const bookData = bibleData[parsed.book];
            if (!bookData) {
              // Book doesn't exist in our data, but that's okay - it might not be included yet
              continue;
            }
            
            // Check if the chapter exists
            const chapter = bookData[parsed.chapter];
            if (!chapter) {
              errors.push(`${filePath}: Reference "${ref}" - chapter ${parsed.chapter} does not exist in ${parsed.book}`);
              continue;
            }
            
            // Check if the verse(s) exist
            const verseStart = parseInt(parsed.verseStart, 10);
            const verseEnd = parseInt(parsed.verseEnd, 10);
            
            if (verseStart < 1 || verseStart > chapter.length) {
              errors.push(`${filePath}: Reference "${ref}" - verse ${verseStart} does not exist in ${parsed.book} ${parsed.chapter}`);
            }
            
            if (verseEnd < 1 || verseEnd > chapter.length) {
              errors.push(`${filePath}: Reference "${ref}" - verse ${verseEnd} does not exist in ${parsed.book} ${parsed.chapter}`);
            }
          }
        }
      } catch (err) {
        errors.push(`${filePath}: ${err.message}`);
      }
    }
  } catch (err) {
    // xrefs directory doesn't exist
    warnings.push('xrefs directory not found');
  }
}

// Validate commentary files
async function validateCommentary() {
  console.log('Validating commentary files...');
  
  const theologyDir = 'theology';
  
  try {
    const files = await readdir(theologyDir);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = join(theologyDir, file);
      
      try {
        const content = await readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        // Check if it's the alternative format (with "reference" and "commentaries" keys)
        if (data.reference && data.commentaries) {
          // This is an alternative format, skip full validation for now
          continue;
        }
        
        // Commentary should be an array
        if (!Array.isArray(data)) {
          errors.push(`${filePath}: Commentary data must be an array`);
          continue;
        }
        
        data.forEach((entry, idx) => {
          const prefix = `${filePath}[${idx}]`;
          
          // Check required fields
          const requiredFields = ['id', 'ref', 'tradition', 'theologian', 'work', 'century', 'mode', 'license', 'summary', 'takeaways', 'citation'];
          for (const field of requiredFields) {
            if (!(field in entry)) {
              errors.push(`${prefix}: Missing required field "${field}"`);
            }
          }
          
          // Check mode
          if (entry.mode && !['excerpt', 'summary'].includes(entry.mode)) {
            errors.push(`${prefix}: mode must be "excerpt" or "summary", got "${entry.mode}"`);
          }
          
          // If mode is "excerpt" and license is "public-domain", check word count
          if (entry.mode === 'excerpt' && entry.license === 'public-domain' && entry.excerpt) {
            const wordCount = countWords(entry.excerpt);
            if (wordCount > 120) {
              errors.push(`${prefix}: excerpt has ${wordCount} words but must be <= 120 words for public-domain license`);
            }
          }
          
          // Check takeaways is an array
          if (entry.takeaways && !Array.isArray(entry.takeaways)) {
            errors.push(`${prefix}: takeaways must be an array`);
          }
        });
      } catch (err) {
        errors.push(`${filePath}: ${err.message}`);
      }
    }
  } catch (err) {
    // theology directory doesn't exist
    warnings.push('theology directory not found');
  }
}

// Print summary table
function printSummary() {
  console.log('\n=== Validation Summary ===\n');
  
  // Print book statistics
  console.log('Book Statistics:');
  console.log('─'.repeat(60));
  console.log(`${'Book'.padEnd(30)} ${'Translations'.padEnd(15)} ${'Issues'}`);
  console.log('─'.repeat(60));
  
  const sortedBooks = Object.keys(bookStats).sort();
  for (const book of sortedBooks) {
    const stat = bookStats[book];
    const translations = stat.translations.join(', ');
    console.log(`${book.padEnd(30)} ${translations.padEnd(15)} ${stat.issues}`);
  }
  console.log('─'.repeat(60));
  
  // Print errors
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    console.log('─'.repeat(60));
    errors.forEach(err => console.log(`  ❌ ${err}`));
  }
  
  // Print warnings
  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    console.log('─'.repeat(60));
    warnings.forEach(warn => console.log(`  ⚠️  ${warn}`));
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✅ All validations passed!');
  }
  
  console.log();
}

// Main execution
async function main() {
  try {
    await validateBibleFiles();
    const bibleData = await loadAllBibleData();
    await validateXrefs(bibleData);
    await validateCommentary();
    
    printSummary();
    
    // Exit with error code if there are errors
    if (errors.length > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
