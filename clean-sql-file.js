const fs = require('fs');

// Read the file
const content = fs.readFileSync('SKILL_INSERT_STATEMENTS.sql', 'utf8');

// Split into lines
const lines = content.split(/\r?\n/);

// Clean the lines
const cleaned = lines
  .map(line => {
    // Remove markdown table formatting
    let cleanedLine = line.trim();
    
    // Remove leading pipe and spaces
    cleanedLine = cleanedLine.replace(/^\|\s*/, '');
    
    // Remove trailing pipe and spaces
    cleanedLine = cleanedLine.replace(/\s*\|\s*$/, '');
    
    return cleanedLine;
  })
  .filter(line => {
    // Remove empty lines and markdown separators
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.match(/^[-|]+$/)) return false; // Markdown separator row
    if (trimmed.toLowerCase() === 'insert_statement') return false; // Header row
    return true;
  });

// Write the cleaned content
fs.writeFileSync('SKILL_INSERT_STATEMENTS.sql', cleaned.join('\n'));

console.log(`Cleaned ${lines.length} lines down to ${cleaned.length} lines`);

