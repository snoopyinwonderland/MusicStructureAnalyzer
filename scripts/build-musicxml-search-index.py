from __future__ import annotations

import argparse, hashlib, json, math, re, sys, time, zipfile
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
    work=child(root,"work"); title=text(work,"work-title") if work is not None else None
    movement=text(root,"movement-title"); creators=[]
    identification=child(root,"identification")
    if identification is not None:
        creators=[x.text.strip() for x in identification if tag(x)=="creator" and x.text and x.attrib.get("type") in (None,"composer")]
    part_names={}
    part_list=child(root,"part-list")
    if part_list is not None:
        for sp in part_list:
            if tag(sp)=="score-part":part_names[sp.attrib.get("id","")]=text(sp,"part-name","")
    streams=defaultdict(list); measure_meta={}; max_end=Fraction(0); note_count=0
    for part_index,part in enumerate(x for x in root if tag(x)=="part"):
        pid=part.attrib.get("id",f"P{part_index+1}");divisions=1;measure_start=Fraction(0);beats=4;beat_type=4
        for measure_index,measure in enumerate(x for x in part if tag(x)=="measure"):
            cursor=Fraction(0);last_onset=Fraction(0);measure_max=Fraction(0);number=measure.attrib.get("number",str(measure_index+1))
            attributes=child(measure,"attributes")
            if attributes is not None:
                divisions=int(text(attributes,"divisions",str(divisions)))
                ts=child(attributes,"time")
                if ts is not None:beats=int(text(ts,"beats",str(beats)).split("+")[0]);beat_type=int(text(ts,"beat-type",str(beat_type)))
            nominal=Fraction(beats*4,beat_type);measure_meta[(pid,measure_index)]={"number":number,"start":fnum(measure_start),"beats":beats,"beatType":beat_type}
            for element in measure:
                kind=tag(element)
                if kind in ("backup","forward"):
                    amount=Fraction(int(text(element,"duration","0")),divisions);cursor += amount if kind=="forward" else -amount;continue
                if kind!="note":continue
                duration=Fraction(int(text(element,"duration","0")),divisions) if text(element,"duration") else Fraction(0)
                is_chord=child(element,"chord") is not None;onset=last_onset if is_chord else cursor
                if not is_chord:last_onset=onset
                if child(element,"grace") is not None:duration=Fraction(0)
                voice=text(element,"voice","1");staff=text(element,"staff","1");midi,spelling=pitch_midi(element)
                if midi is not None:
                    ties=[x.attrib.get("type") for x in element if tag(x)=="tie"]
                    streams[(pid,staff,voice)].append({"m":measure_index+1,"mn":number,"b":fnum(onset)+1,"o":fnum(measure_start+onset),"d":fnum(duration),"p":midi,"s":spelling,"ts":"start" in ties,"te":"stop" in ties,"g":duration==0})
                    note_count+=1
                if not is_chord:cursor+=duration
                measure_max=max(measure_max,onset+duration)
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
            item={k:n[k] for k in ("m","mn","b","o","d","p","s")};merged.append(item);active=item if n["ts"] else None
        if len(merged)<3:continue
        pitches=[n["p"] for n in merged];durations=[max(n["d"],1/64) for n in merged];intervals=[b-a for a,b in zip(pitches,pitches[1:])];mean_d=sum(durations)/len(durations)
        unique_onsets=len({n["o"] for n in merged});monophony=unique_onsets/max(1,len(notes));avg_pitch=sum(pitches)/len(pitches)
        role=min(1,.35+.25*monophony+.2*min(1,len(merged)/64)+.2*max(0,min(1,(avg_pitch-48)/36)))
        compact.append({"id":f"{pid}:{staff}:{voice}","part":pid,"partName":part_names.get(pid,""),"staff":staff,"voice":voice,"role":round(role,4),"notes":merged,"i":intervals,"c":[contour(i) for i in intervals],"r":[round(d/mean_d,5) for d in durations]})
    compact.sort(key=lambda s:(-s["role"],-len(s["notes"])))
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    return {"v":1,"id":f"work-{digest[:16]}","source":path.name,"hash":digest,"title":title or movement or normalized_title(path.name),"normalizedTitle":normalized_title(title or movement or path.name),"composer":creators[0] if creators else None,"duration":fnum(max_end),"noteCount":note_count,"streams":compact[:4]}

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--inventory",default="K:/Music Analysis/output/corpus_inventory.json");ap.add_argument("--output",default="K:/MusicSearch/data/search-index-v1/works.jsonl");ap.add_argument("--failures",default="K:/MusicSearch/data/search-index-v1/failures.jsonl");ap.add_argument("--limit",type=int);args=ap.parse_args()
    inventory=json.loads(Path(args.inventory).read_text(encoding="utf-8"));root=Path(inventory["root"]);records=[r for r in inventory["files"] if not r.get("duplicate_of")]
    out=Path(args.output);fail=Path(args.failures);out.parent.mkdir(parents=True,exist_ok=True)
    done=set()
    if out.exists():
        with out.open(encoding="utf-8") as f:
            for line in f:
                try:done.add(json.loads(line)["source"])
                except Exception:pass
    pending=[r for r in records if r["relative_path"] not in done]
    if args.limit:pending=pending[:args.limit]
    started=time.time();ok=bad=0
    with out.open("a",encoding="utf-8") as target,fail.open("a",encoding="utf-8") as errors:
        for index,record in enumerate(pending,1):
            source=record["relative_path"]
            try:
                parsed=parse_musicxml(root/source);parsed["source"]=source;target.write(json.dumps(parsed,ensure_ascii=False,separators=(",",":"))+"\n");target.flush();ok+=1
            except Exception as exc:
                errors.write(json.dumps({"source":source,"error":f"{type(exc).__name__}:{exc}"},ensure_ascii=False)+"\n");errors.flush();bad+=1
            if index%25==0:
                rate=index/max(.001,time.time()-started);print(f"{index}/{len(pending)} ok={ok} failed={bad} {rate:.2f} files/s",flush=True)
    manifest={"version":1,"completedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"inventory":str(Path(args.inventory)),"works":len(done)+ok,"newWorks":ok,"failuresThisRun":bad,"outputBytes":out.stat().st_size if out.exists() else 0}
    (out.parent/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8");print(json.dumps(manifest,ensure_ascii=False,indent=2))
if __name__=="__main__":main()
