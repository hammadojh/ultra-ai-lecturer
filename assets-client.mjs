export function sourceAssets(d){return (d.sources||[]).flatMap(s=>(s.import?.assets||[]).map((a,i)=>({...a,id:s.id+':'+i,sourceName:s.name}))).filter(a=>a.kind!=='page'&&/^\/imports\/[0-9a-f-]{36}\/[0-9]+\.(png|jpe?g|gif|webp)$/.test(a.url));}
export function assetFingerprint(d){return JSON.stringify({script:d.script?.markdown,input:d.script?.input,visuals:sourceAssets(d)});}
export function assetsReady(d){return !!d.assets&&d.assets.input===assetFingerprint(d)&&d.assets.items.every(i=>i.status==='reviewed'&&i.brief.trim());}
