const preference='ultra-desktop-notifications';
function enabled(){try{return localStorage.getItem(preference)==='on';}catch{return false;}}
export function startNotificationTask(label){
 const started=Date.now();let finished=false;
 return (error=null)=>{
  if(finished)return;finished=true;
  if(error?.name==='AbortError'||Date.now()-started<10000||!enabled()||!('Notification' in window)||Notification.permission!=='granted')return;
  try{const notice=new Notification(error?`${label} needs attention`:`${label} ready`,{body:error?'Return to Ultra to review the issue and retry.':'Return to Ultra to review the result.',tag:'ultra-'+label});notice.onclick=()=>{window.focus();notice.close();};}catch{}
 };
}
export function mountNotifications(parent){
 if(!parent)return;
 const button=document.createElement('button');button.type='button';button.className='control';
 const update=()=>{const supported='Notification' in window;button.disabled=!supported;button.textContent=!supported?'Notifications unavailable':Notification.permission==='denied'?'Notifications blocked':enabled()&&Notification.permission==='granted'?'Notifications on':'Enable notifications';button.title='Notify when AI tasks lasting more than 10 seconds finish. Keep this tab open.';button.setAttribute('aria-pressed',String(enabled()&&supported&&Notification.permission==='granted'));};
 button.onclick=async()=>{
  if(Notification.permission==='denied'){status.textContent='Allow notifications for this site in your browser settings, then try again.';return;}
  if(enabled()&&Notification.permission==='granted'){localStorage.setItem(preference,'off');status.textContent='Desktop notifications turned off.';update();return;}
  try{const permission=await Notification.requestPermission();localStorage.setItem(preference,permission==='granted'?'on':'off');status.textContent=permission==='granted'?'Notifications enabled. Keep this tab open while AI tasks run.':'Notifications were not enabled. You can still follow progress here.';}catch{status.textContent='Your browser could not enable notifications.';}update();
 };
 const status=document.createElement('span');status.setAttribute('role','status');status.style.cssText='font-size:12px;max-width:260px';parent.append(button,status);update();window.addEventListener('focus',update);
}
