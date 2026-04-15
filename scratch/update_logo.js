import fs from 'fs';
import path from 'path';

const constantsPath = '/Users/alpewa/Downloads/prorivnie-tehnologii (5)/PREPODAVAI/backend/src/modules/generations/generation.constants.ts';
const logoPath = '/Users/alpewa/Downloads/prorivnie-tehnologii (5)/PREPODAVAI/logo.b64';

try {
  const logoBase64 = fs.readFileSync(logoPath, 'utf8').trim();
  let content = fs.readFileSync(constantsPath, 'utf8');

  // Replace LOGO_BASE64 constant value
  // This regex looks for LOGO_BASE64 = '...'; including multi-line strings if necessary
  const regex = /export const LOGO_BASE64 =\s+'[^']*';/;
  const newValue = `export const LOGO_BASE64 =\n  'data:image/png;base64,${logoBase64}';`;
  
  if (regex.test(content)) {
    content = content.replace(regex, newValue);
    fs.writeFileSync(constantsPath, content);
    console.log('Successfully updated LOGO_BASE64 in generation.constants.ts');
  } else {
    console.error('Could not find LOGO_BASE64 constant in file.');
  }
} catch (error) {
  console.error('Error updating file:', error);
}
