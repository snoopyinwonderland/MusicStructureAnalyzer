from __future__ import annotations

import argparse, hashlib, json, math, os, re, sys, time, zipfile
from concurrent.futures import ProcessPoolExecutor
from collections import defaultdict
from fractions import Fraction
from pathlib import Path
from xml.etree import ElementTree as ET

NS_RE = re.compile(r"\{[^}]+\}")
ARRANGEMENT_RE = re.compile(r"\b(?:piano\s+solo|melody|violin|viola|cello|contrabass|duet|trio|quartet|string\s+orchestra|piano\s+quintet)\b", re.I)
STEP = {"C":0,"D":2,"E":4,"F":5,"G":7,"A":9,"B":11}

def tag(e): return NS_RE.sub("", e.tag)
def child(e, name): return next((x for x in e if tag(x)==name), None)
def text(e, name, default=None):
    x=child(e,name); return x.text.strip() if x is not None and x.text else default
def repair_metadata_text(value):
    """Repair UTF-8/CJK bytes that an XML declaration exposed as Latin-1."""
    if not value: return value
    latin_accents = re.findall(r"[\u00c0-\u024f]", value)
    if latin_accents and len(latin_accents) <= max(2, len(value) * .15) and not re.search(r"[ÃÂÐÑ\x00-\x1f\x7f-\x9f]", value):
        return value
    # Some converters interpreted UTF-8 bytes as a multibyte East-Asian
    # encoding first (for example, é became 챕). Reverse that decode before
    # falling back to the older Latin-1-byte repair path.
    for encoding in ("cp949", "shift_jis", "gb18030", "big5"):
        try:
            candidate=value.encode(encoding).decode("utf-8")
            if candidate != value: return candidate
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    try: raw=value.encode("latin-1")
    except UnicodeEncodeError: return value # already genuine Unicode
    def quality(candidate):
        hangul=sum("\uac00" <= c <= "\ud7a3" for c in candidate)
        kana=sum("\u3040" <= c <= "\u30ff" for c in candidate)
        han=sum("\u3400" <= c <= "\u9fff" for c in candidate)
        chinese_hints=sum(c in "简体标题汉语乐曲谱爱国门听见这为与后里发广风云繁體標題漢語樂曲譜愛國門聽見這為與後裡發廣風雲" for c in candidate)
        controls=sum(ord(c)<32 and c not in "\t\r\n" for c in candidate)
        mixed_penalty=12*min(hangul,han) if not kana else 0
        return 10*(hangul+kana)+4*han+12*chinese_hints-20*controls-mixed_penalty
    candidates=[]
    for encoding in ("utf-8","cp949","shift_jis","gb18030","big5"):
        try:
            candidate=raw.decode(encoding)
            if "\ufffd" not in candidate:candidates.append((quality(candidate),candidate))
        except UnicodeDecodeError: pass
    if not candidates:return value
    score,repaired=max(candidates,key=lambda item:item[0])
    return repaired if score>quality(value) and score>0 else value
def frac(n, d=1): return Fraction(int(n), int(d))
def fnum(x): return float(x.numerator/x.denominator)
def normalized_title(name):
    name=re.sub(r"\.(?:musicxml(?:\.xml)?|xml|mxl)$","",Path(name).name,flags=re.I)
    name=re.sub(r"^\s*\d+\.?\s*","",name);name=ARRANGEMENT_RE.sub(" ",name)
    return re.sub(r"[,_\s]+"," ",name).strip(" .-_")
def read_root(path):
    if path.suffix.lower()==".mxl":
        with zipfile.ZipFile(path) as z:
            names=[n for n in z.namelist() if n.lower().endswith((".xml",".musicxml")) and "container.xml" not in n.lower()]
            if not names: raise ValueError("empty_mxl")
            return ET.fromstring(z.read(names[0]))
    return ET.parse(path).getroot()
def pitch_midi(note):
    p=child(note,"pitch")
    if p is None: return None, None
    step=text(p,"step"); octave=int(text(p,"octave","4")); alter=int(float(text(p,"alter","0")))
    midi=(octave+1)*12+STEP[step]+alter
    spelling=f"{step}{'#'*alter if alter>0 else 'b'*(-alter)}{octave}"
    return midi,spelling
def contour(interval):
    if interval==0:return "SAME"
    if interval>0:return "SU" if interval<=2 else "LU"
    return "SD" if interval>=-2 else "LD"

def parse_musicxml(path:Path):
    root=read_root(path)
    if tag(root)!="score-partwise": raise ValueError(f"unsupported_root:{tag(root)}")
    work=child(root,"work"); title=repair_metadata_text(text(work,"work-title")) if work is not None else None
    movement=repair_metadata_text(text(root,"movement-title")); creators=[]
    identification=child(root,"identification")
    if identification is not None:
        creators=[repair_metadata_text(x.text.strip()) for x in identification if tag(x)=="creator" and x.text and x.attrib.get("type") in (None,"composer")]
    part_names={}
    part_list=child(root,"part-list")
    if part_list is not None:
        for sp in part_list:
            if tag(sp)=="score-part":part_names[sp.attrib.get("id","")]=repair_metadata_text(text(sp,"part-name",""))
    streams=defaultdict(list); measure_meta={}; max_end=Fraction(0); note_count=0
    for part_index,part in enumerate(x for x in root if tag(x)=="part"):
        pid=part.attrib.get("id",f"P{part_index+1}");divisions=1;measure_start=Fraction(0);beats=4;beat_type=4
        measures=[x for x in part if tag(x)=="measure"]
        pickup_shift=0
        for measure_index,measure in enumerate(measures):
            cursor=Fraction(0);last_onset=Fraction(0);measure_max=Fraction(0);declared_number=measure.attrib.get("number",str(measure_index+1))
            attributes=child(measure,"attributes")
            if attributes is not None:
                divisions=int(text(attributes,"divisions",str(divisions)))
                ts=child(attributes,"time")
                if ts is not None:beats=sum(int(x) for x in text(ts,"beats",str(beats)).split("+"));beat_type=int(text(ts,"beat-type",str(beat_type)))
            nominal=Fraction(beats*4,beat_type)
            pending=[]
            for element in measure:
                kind=tag(element)
                if kind in ("backup","forward"):
                    amount=Fraction(int(text(element,"duration","0")),divisions);cursor += amount if kind=="forward" else -amount;continue
                if kind!="note":continue
                duration=Fraction(int(text(element,"duration","0")),divisions) if text(element,"duration") else Fraction(0)
                is_chord=child(element,"chord") is not None;onset=last_onset if is_chord else cursor
                if not is_chord:last_onset=onset
                if child(element,"grace") is not None:duration=Fraction(0)
                voice=text(element,"voice",None) or (pending[-1][0] if is_chord and pending else "1");staff=text(element,"staff",None) or (pending[-1][1] if is_chord and pending else "1");midi,spelling=pitch_midi(element)
                if midi is not None:
                    ties=[x.attrib.get("type") for x in element if tag(x)=="tie"]
                    pending.append((voice,staff,{"m":measure_index+1,"b":fnum(onset)+1,"o":fnum(measure_start+onset),"d":fnum(duration),"p":midi,"s":spelling,"ts":"start" in ties,"te":"stop" in ties,"g":duration==0,"u":child(element,"cue") is not None}));note_count+=1
                if not is_chord:cursor+=duration
                measure_max=max(measure_max,onset+duration)
            if measure_index==0 and (measure.attrib.get("implicit","").lower()=="yes" or (measure_max>0 and measure_max<nominal)):
                try: pickup_shift=int(declared_number)
                except ValueError: pickup_shift=0
            try:number=str(int(declared_number)-pickup_shift)
            except ValueError:number="0" if measure_index==0 and pickup_shift else declared_number
            measure_meta[(pid,measure_index)]={"number":number,"start":fnum(measure_start),"beats":beats,"beatType":beat_type}
            for voice,staff,item in pending:item["mn"]=number;streams[(pid,staff,voice)].append(item)
            measure_start+=max(nominal,measure_max);max_end=max(max_end,measure_start)
    compact=[]
    for (pid,staff,voice),notes in streams.items():
        notes.sort(key=lambda n:(n["o"],-n["p"]));onsets=defaultdict(list)
        for n in notes:onsets[n["o"]].append(n)
        # A search melody stream is monophonic: retain the upper attack at simultaneous chord onsets.
        mono=[max((n for n in group if n["d"]>0),key=lambda n:n["p"]) for _,group in sorted(onsets.items()) if any(n["d"]>0 for n in group)]
        merged=[];active=None
        for n in mono:
            if active and n["te"] and active["p"]==n["p"]:
                active["d"]=round((n["o"]+n["d"])-active["o"],6);active["tm"]=n["m"]
                if not n["ts"]:active=None
                continue
            item={k:n[k] for k in ("m","mn","b","o","d","p","s")};
            # Preserve attack provenance. The merged sounding event is used for
            # search, while the notated tie pieces remain recoverable from XML.
            if n.get("ts"):item["ts"]=True
            if n.get("u"):item["u"]=True
            merged.append(item);active=item if n["ts"] else None
        if len(merged)<3:continue
        pitches=[n["p"] for n in merged];durations=[max(n["d"],1/64) for n in merged];intervals=[b-a for a,b in zip(pitches,pitches[1:])];mean_d=sum(durations)/len(durations)
        unique_onsets=len({n["o"] for n in merged});monophony=unique_onsets/max(1,len(notes));avg_pitch=sum(pitches)/len(pitches)
        role=min(1,.35+.25*monophony+.2*min(1,len(merged)/64)+.2*max(0,min(1,(avg_pitch-48)/36)))
        compact.append({"id":f"{pid}:{staff}:{voice}","part":pid,"partName":part_names.get(pid,""),"staff":staff,"voice":voice,"role":round(role,4),"notes":merged,"i":intervals,"c":[contour(i) for i in intervals],"r":[round(d/mean_d,5) for d in durations]})
        # Some editions explicitly engrave accompaniment/figuration as cue-sized
        # notes while leaving the structural melody at normal size (e.g. Chopin
        # Op.25 No.1). Only this strong source evidence justifies a sparse stream.
        pillars=[n for n in merged if not n.get("u")]
        auxiliaries=[n for n in merged if n.get("u")]
        if len(pillars)>=3 and len(auxiliaries)>=2*len(pillars):
            pp=[n["p"] for n in pillars];dd=[max(n["d"],1/64) for n in pillars];ii=[b-a for a,b in zip(pp,pp[1:])];md=sum(dd)/len(dd)
            compact.append({"id":f"{pid}:{staff}:{voice}:structural","part":pid,"partName":part_names.get(pid,""),"staff":staff,"voice":voice,"role":round(min(1,role+.15),4),"structuralStream":True,"notes":pillars,"i":ii,"c":[contour(i) for i in ii],"r":[round(d/md,5) for d in dd]})
    compact.sort(key=lambda s:(-s["role"],-len(s["notes"])))
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    return {"v":1,"id":f"work-{digest[:16]}","source":path.name,"hash":digest,"title":title or movement or normalized_title(path.name),"normalizedTitle":normalized_title(title or movement or path.name),"composer":creators[0] if creators else None,"duration":fnum(max_end),"noteCount":note_count,"streams":compact}

def parse_inventory_record(payload):
    root_text,record=payload;source=record["relative_path"]
    try:
        parsed=parse_musicxml(Path(root_text)/source);parsed["source"]=record.get("source_id",source)
        metadata=record.get("metadata")
        if metadata:
            parsed["metadata"]=metadata
            parsed["title"]=metadata.get("title") or parsed["title"]
            parsed["normalizedTitle"]=normalized_title(parsed["title"])
            # The UI's secondary credit is performer for karaoke and composer for scores.
            # Preserve the actual composer separately in metadata.
            parsed["composer"]=metadata.get("singer") or metadata.get("composer") or parsed.get("composer")
        pdmx=record.get("pdmx")
        if pdmx:
            parsed["pdmx"]=pdmx
            parsed["title"]=pdmx.get("song_name") or pdmx.get("title") or parsed["title"]
            parsed["normalizedTitle"]=normalized_title(parsed["title"])
            parsed["composer"]=pdmx.get("composer_name") or pdmx.get("artist_name") or parsed.get("composer")
        return True,source,parsed
    except Exception as exc:
        return False,source,f"{type(exc).__name__}:{exc}"

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--inventory",default="K:/Music Analysis/output/corpus_inventory.json");ap.add_argument("--output",default="K:/MusicSearch/data/search-index-v1/works.jsonl");ap.add_argument("--failures",default="K:/MusicSearch/data/search-index-v1/failures.jsonl");ap.add_argument("--limit",type=int);ap.add_argument("--workers",type=int,default=max(1,min(8,(os.cpu_count() or 2)-1)));args=ap.parse_args()
    inventory=json.loads(Path(args.inventory).read_text(encoding="utf-8"));root=Path(inventory["root"]);records=[r for r in inventory["files"] if not r.get("duplicate_of")]
    out=Path(args.output);fail=Path(args.failures);out.parent.mkdir(parents=True,exist_ok=True)
    done=set()
    if out.exists():
        with out.open(encoding="utf-8") as f:
            for line in f:
                try:done.add(json.loads(line)["source"])
                except Exception:pass
    pending=[r for r in records if r.get("source_id",r["relative_path"]) not in done]
    if args.limit:pending=pending[:args.limit]
    started=time.time();ok=bad=0
    with out.open("a",encoding="utf-8") as target,fail.open("a",encoding="utf-8") as errors:
        payloads=((str(root),record) for record in pending)
        with ProcessPoolExecutor(max_workers=args.workers) as executor:
          for index,(success,source,result) in enumerate(executor.map(parse_inventory_record,payloads,chunksize=8),1):
            if success:target.write(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n");ok+=1
            else:errors.write(json.dumps({"source":source,"error":result},ensure_ascii=False)+"\n");bad+=1
            if index%25==0:
                target.flush();errors.flush();rate=index/max(.001,time.time()-started);print(f"{index}/{len(pending)} ok={ok} failed={bad} workers={args.workers} {rate:.2f} files/s",flush=True)
    manifest={"version":1,"completedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"inventory":str(Path(args.inventory)),"works":len(done)+ok,"newWorks":ok,"failuresThisRun":bad,"outputBytes":out.stat().st_size if out.exists() else 0}
    (out.parent/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8");print(json.dumps(manifest,ensure_ascii=False,indent=2))
if __name__=="__main__":main()
