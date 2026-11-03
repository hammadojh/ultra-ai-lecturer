import {mountNotifications} from './notifications.mjs';
const response=await fetch('/api/auth/me');
const {user}=await response.json();
if(!user){location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search));throw Error('Sign-in required');}
export {user};
const badge=document.querySelector('.student');
if(badge){badge.replaceChildren();const name=document.createElement('span');name.textContent=user.name;const role=document.createElement('small');role.textContent=user.role==='admin'?'Administrator':'Student';name.append(role);badge.append(name);}
if(user.role!=='admin')document.querySelectorAll('a[href="/admin.html"],a[href="/studio.html"]').forEach(a=>a.remove());
const logout=document.createElement('button');logout.textContent='Sign out';logout.className='control account-logout';logout.style.cssText='font:inherit;padding:7px 12px;cursor:pointer';logout.onclick=async()=>{const r=await fetch('/api/auth/logout',{method:'POST'});if(r.ok)location.replace('/login.html');};
const accountActions=document.querySelector('.studio-header-actions')||document.querySelector('.topbar')||document.querySelector('header')||document.body;
accountActions.append(logout);

if(user.role==='admin')mountNotifications(accountActions);
