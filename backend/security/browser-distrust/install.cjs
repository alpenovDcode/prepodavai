'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const user=process.argv[2];if(!['nestjs','worker'].includes(user))throw Error('Unexpected browser service user');
const uid=Number(execFileSync('id',['-u',user],{encoding:'utf8'}).trim()),gid=Number(execFileSync('id',['-g',user],{encoding:'utf8'}).trim());
const home='/home/'+user,pki=path.join(home,'.pki'),db=path.join(pki,'nssdb');fs.mkdirSync(db,{recursive:true,mode:0o700});
if(!fs.existsSync(path.join(db,'cert9.db')))execFileSync('certutil',['-N','--empty-password','-d','sql:'+db]);
const certs=JSON.parse(fs.readFileSync(path.join(__dirname,'impacted-intermediates.json'),'utf8'));if(certs.length<12)throw Error('Incomplete compromised-intermediate list');
const tmp=fs.mkdtempSync('/tmp/emudhra-public-');let n=0;
try{for(const item of certs){const cert=new crypto.X509Certificate(item.pem);const fingerprint=cert.fingerprint256.replaceAll(':','').toUpperCase();const spki=crypto.createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('hex').toUpperCase();if(fingerprint!==item.sha256.toUpperCase()||spki!==item.spki_sha256.toUpperCase())throw Error('Public certificate fingerprint mismatch');const file=path.join(tmp,fingerprint+'.pem');fs.writeFileSync(file,item.pem+'\n',{mode:0o600});execFileSync('certutil',['-A','-d','sql:'+db,'-n','blocked-emudhra-'+fingerprint,'-t','p,p,p','-i',file]);n++}}finally{fs.rmSync(tmp,{recursive:true,force:true})}
for(const dir of [home,pki,db]){fs.chownSync(dir,uid,gid);fs.chmodSync(dir,0o700)}for(const name of fs.readdirSync(db)){const file=path.join(db,name);fs.chownSync(file,uid,gid);fs.chmodSync(file,0o600)}
console.log('BROWSER_NSS_INTERMEDIATES_BLOCKED '+n);
