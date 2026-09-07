import {getWork} from '../server/search-api.mjs';
import createModule from 'verovio/wasm';
import {VerovioToolkit} from 'verovio/esm';

const id=process.argv[2],measure=String(process.argv[3]||'1'),work=getWork(id);
if(!work?.xml)throw new Error('Work or XML not found');
let tagged=false,xml=work.xml.replace(new RegExp(`<measure\\b([^>]*\\bnumber=["']${measure}["'][^>]*)>`),(whole,attrs)=>{tagged=true;return `<measure id="inspect-target"${attrs}>`});
if(!tagged)throw new Error(`Measure ${measure} not found`);
const module=await createModule(),tk=new VerovioToolkit(module);
const partCount=(xml.match(/<part\s/g)||[]).length,layout=partCount>=5?{pageWidth:2100,pageHeight:3100,scale:21}:{pageWidth:1900,pageHeight:2700,scale:24};
tk.setOptions({...layout,pageMarginTop:75,pageMarginBottom:210,adjustPageHeight:false,breaks:'encoded',svgViewBox:true,header:'none',footer:'none',mnumInterval:1,spacingStaff:12,spacingSystem:6});
tk.loadData(xml);const targetPage=tk.getPageWithElement('inspect-target'),pages=[];
for(let page=1;page<=tk.getPageCount();page++){const svg=tk.renderToSVG(page),viewBox=svg.match(/viewBox="([^"]+)"/)?.[1],height=svg.match(/height="([^"]+)"/)?.[1];pages.push({page,systems:(svg.match(/class="system"/g)||[]).length,staves:(svg.match(/class="staff"/g)||[]).length,viewBox,height,bytes:svg.length})}
console.log(JSON.stringify({title:work.title,targetMeasure:measure,partCount,layout,targetPage,pageCount:pages.length,pages:pages.slice(Math.max(0,targetPage-3),Math.min(pages.length,targetPage+2))},null,2));
