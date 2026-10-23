'use strict';
const fs=require('fs');const version=require(require.resolve('@nestjs/core/package.json',{paths:['/app',process.cwd(),__dirname+'/..']})).version.split('.').map(Number);
if(version[0]>11||(version[0]===11&&(version[1]>1||version[1]===1&&version[2]>=18)))process.exit(0);
const path=require.resolve('@nestjs/core/router/sse-stream',{paths:['/app',process.cwd(),__dirname+'/..']});const before=fs.readFileSync(path,'utf8');
if(before.includes('Invalid multiline SSE metadata'))process.exit(0);
const anchor='        let data = message.type';
if(!before.includes(anchor))throw new Error('SSE backport requires review for this Nest version');
const guard=`        // GHSA-36xv-jgw5-4q75: reject protocol delimiters in SSE metadata.
        for (const field of ['type', 'id', 'retry']) {
            if (message[field] != null && /[\\r\\n]/.test(String(message[field]))) {
                callback(new Error('Invalid multiline SSE metadata'));
                return;
            }
        }
`;
fs.writeFileSync(path,before.replace(anchor,guard+anchor));
