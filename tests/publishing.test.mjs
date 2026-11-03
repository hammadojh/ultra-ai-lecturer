import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationSnapshot} from '../src/server/publishing.mjs';
test('unapproved drafts cannot be published',()=>{assert.throws(()=>publicationSnapshot({id:'test'}),/Confirm/);});
