import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAuth} from '../auth.mjs';
test('setup, roles, password hashing, sessions and logout',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ultra-auth-'));try{
 const auth=createAuth(dir);const data={name:'Test Admin',email:'admin@example.test',password:'testing-password-123'};
 assert.equal(await auth.setupRequired(),true);
 const admin=await auth.register(data,true);assert.equal(admin.user.role,'admin');
 await assert.rejects(auth.register({...data,email:'other@example.test'},true));
 const student=await auth.register({...data,email:'student@example.test',role:'admin'});assert.equal(student.user.role,'student');
 assert.ok(!(await readFile(path.join(dir,'users.json'),'utf8')).includes(data.password));
 await assert.rejects(auth.login({...data,password:'wrong'}));
 const login=await auth.login(data);assert.equal(auth.session(login.token).role,'admin');auth.logout(login.token);assert.equal(auth.session(login.token),null);
 assert.equal(await createAuth(dir).setupRequired(),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('concurrent setup cannot create two administrators',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ultra-auth-'));try{const auth=createAuth(dir);const results=await Promise.allSettled(['a','b'].map(name=>auth.register({name,email:name+'@example.test',password:'long-password-123'},true)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);}finally{await rm(dir,{recursive:true,force:true});}
});
