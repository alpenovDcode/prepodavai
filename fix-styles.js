const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

walkDir('./frontend/src/app/workspace', function (filePath) {
    if (filePath.endsWith('.tsx')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let original = content;

        // Remove the invalid trailing ' text-gray-900' and ' placeholder-gray-400'
        content = content.replace(/" text-gray-900/g, '"');
        content = content.replace(/" placeholder-gray-400/g, '"');

        // Some are inside inputs. Let's make sure all bg-gray-50 inputs have text-gray-900 and placeholder-gray-400
        // First, let's remove text-gray-900 from inside so we don't duplicate
        content = content.replace(/ text-gray-900 placeholder-gray-400/g, '');
        content = content.replace(/ text-gray-900/g, '');
        content = content.replace(/ placeholder-gray-400/g, '');

        // Now correctly inject it before the closing quote for classes of interest
        content = content.replace(/className="([^"]*(?:bg-gray-50|bg-white)[^"]*)"/g, (match, classes) => {
            // Skip some elements that aren't inputs (we mostly look for border or form elements)
            if (classes.includes('border-gray-200') && classes.includes('rounded') && !classes.includes('shadow')) {
                return `className="${classes.trim()} text-gray-900 placeholder-gray-400"`;
            }
            return match;
        });

        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Fixed: ${filePath}`);
        }
    }
});
