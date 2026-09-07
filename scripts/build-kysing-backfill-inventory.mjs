import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const recordsPath=resolve(process.argv[2]||'data/kysing-metadata/kumyoung-official-backfill.json');
const xmlRoot=resolve(process.argv[3]||'U:/KYSing_MusicXML');
const output=resolve(process.argv[4]||'data/kysing-metadata/kumyoung-official-backfill-inventory.json');
const records=JSON.parse(await readFile(recordsPath,'utf8')),files=[];
for(const item of Object.values(records).sort((a,b)=>Number(a.no)-Number(b.no))){
  const filename=`${String(Number(item.no)).padStart(5,'0')}.xml`,path=resolve(xmlRoot,filename);
  if(!Number.isFinite(Number(item.no))||!item.title?.trim()||!existsSync(path))continue;
  files.push({relative_path:filename,source_id:`kysing/${filename}`,metadata:{catalog:'kumyoung',songNumber:String(Number(item.no)),title:item.title.trim(),singer:String(item.singer||'').trim(),composer:'',lyricist:'',release:'',accessPolicy:'research-preview',metadataSource:item.source,metadataVerifiedAt:item.verifiedAt}});
}
const inventory={version:1,root:xmlRoot,accessPolicy:'research-preview',files,summary:{records:Object.keys(records).length,indexable:files.length,missingXml:Object.keys(records).length-files.length}};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(inventory,null,2)+'\n');
console.log(JSON.stringify({output,...inventory.summary},null,2));
