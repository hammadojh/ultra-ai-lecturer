import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
const scrypt=promisify(scryptCallback);
const publicUser=({id,name,email,role})=>({id,name,email,role});
export function createAuth(directory){
 const sessions=new Map(),attempts=new Map();let queue=Promise.resolve();
 const file=path.join(directory,'users.json');
 const users=async()=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}};
 const digest=token=>createHash('sha256').update(token).digest('hex');
 const issue=user=>{const token=randomBytes(32).toString('hex');sessions.set(digest(token),{user:publicUser(user),expires:Date.now()+86400000});return {token,user:publicUser(user)};};
 return {
  async setupRequired(){return !(await users()).length;},
  async register({name,email,password},setup=false){
   const job=queue.then(async()=>{
    const list=await users();
    if(setup&&list.length)throw Error('Administrator setup is already complete.');
    if(!setup&&!list.length)throw Error('Set up the administrator first.');
    email=String(email||'').trim().toLowerCase();name=String(name||'').trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!name||name.length>60)throw Error('Enter a valid name and email.');
    if(typeof password!=='string'||password.length<12||password.length>128)throw Error('Use a password between 12 and 128 characters.');
    if(list.some(u=>u.email===email))throw Error('Unable to create this account. Try signing in.');
    const salt=randomBytes(16).toString('hex');const hash=(await scrypt(password,salt,64)).toString('hex');
    const user={id:randomBytes(16).toString('hex'),name,email,salt,hash,role:setup?'admin':'student'};
    await mkdir(directory,{recursive:true,mode:0o700});await writeFile(file+'.tmp',JSON.stringify([...list,user]),{mode:0o600});await rename(file+'.tmp',file);
    return issue(user);
   });queue=job.catch(()=>{});return job;
  },
  async login({email,password}){
   const user=(await users()).find(u=>u.email===String(email||'').trim().toLowerCase());
   if(typeof password!=='string'||password.length>128)throw Error('Email or password is incorrect.');
   const hash=await scrypt(password,user?.salt||'invalid-account-padding',64);
   if(!user||!timingSafeEqual(hash,Buffer.from(user.hash,'hex')))throw Error('Email or password is incorrect.');
   return issue(user);
  },
  session(token=''){const key=digest(token),s=sessions.get(key);if(!s||s.expires<Date.now()){sessions.delete(key);return null;}return s.user;},
  logout(token=''){sessions.delete(digest(token));},
  limited(key){const now=Date.now();for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);const v=attempts.get(key)||{count:0,until:now+600000};v.count++;attempts.set(key,v);return v.count>15;}
 };
}
export function sessionToken(req){return /(?:^|;\s*)ultra_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1]||'';}
export const sessionCookie=token=>`ultra_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token?86400:0}`;
