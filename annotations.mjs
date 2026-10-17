export function imageBounds(width,height,imageWidth,imageHeight){const scale=Math.min(width/imageWidth,height/imageHeight),w=imageWidth*scale,h=imageHeight*scale;return {x:(width-w)/2,y:(height-h)/2,width:w,height:h};}
export function normalizedPoint(x,y,b){return {x:Math.max(0,Math.min(1,(x-b.x)/b.width)),y:Math.max(0,Math.min(1,(y-b.y)/b.height))};}
export function annotationActive(a,time){return time>=a.start&&time<a.start+a.duration;}
export function annotationKey(d,clip,slide){return JSON.stringify([d.presentation.sourceId,d.direction.markdown,clip.id,clip.text,slide]);}
