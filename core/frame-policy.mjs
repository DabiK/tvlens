// Provider/platform independent selection policy. Visual deltas are measured by the capture adapter.
export function selectFrameCandidates(frames,{count=6,maxGapMs=2000}={}){
 if(frames.length<=count)return frames;
 const chosen=new Set([0,frames.length-1]);
 while(chosen.size<count){const order=[...chosen].sort((a,b)=>a-b);let pair=null,gap=maxGapMs;for(let i=1;i<order.length;i++){const d=frames[order[i]].atMs-frames[order[i-1]].atMs;if(d>gap){gap=d;pair=[order[i-1],order[i]];}}if(!pair)break;const mid=Math.round((pair[0]+pair[1])/2);if(chosen.has(mid))break;chosen.add(mid);}
 const ranked=frames.map((f,i)=>({i,score:f.change||0})).sort((a,b)=>b.score-a.score||a.i-b.i);
 for(const {i,score}of ranked){if(score<0.012)break;for(const index of [Math.max(0,i-1),i])if(chosen.size<count)chosen.add(index);}
 while(chosen.size<count){let index=-1,distance=-1;for(let i=0;i<frames.length;i++)if(!chosen.has(i)){const d=Math.min(...[...chosen].map(j=>Math.abs(frames[i].atMs-frames[j].atMs)));if(d>distance){index=i;distance=d;}}if(index<0)break;chosen.add(index);}
 return [...chosen].sort((a,b)=>a-b).map(i=>frames[i]);
}
export function visualChange(previous,current,width=64){
 if(!previous||previous.length!==current.length)return 1;
 let total=0,edge=0,maxTile=0;const tiles=new Map();for(let i=0;i<current.length;i+=4){const d=(Math.abs(current[i]-previous[i])+Math.abs(current[i+1]-previous[i+1])+Math.abs(current[i+2]-previous[i+2]))/(3*255);total+=d;const pixel=i/4,key=Math.floor(pixel/width/8)*8+Math.floor(pixel%width/8);tiles.set(key,(tiles.get(key)||0)+d);if(pixel%width>0)edge+=Math.abs(Math.abs(current[i]-current[i-4])-Math.abs(previous[i]-previous[i-4]))/255;}
 for(const value of tiles.values())maxTile=Math.max(maxTile,value/64);return Math.max(total/(current.length/4),maxTile*.5,edge/(current.length/4)*.7);
}
