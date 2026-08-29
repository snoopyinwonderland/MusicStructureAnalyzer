import { useRef, useState } from 'react';

type Point = { x: number; y: number };
export type ContourGesture = { pitchMidi: number; contourShapeConfidence: number };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

export function gestureContour(points: Point[]): ContourGesture[] {
  if (!points.length) return [];
  const movements = points.slice(1).map((point, index) => points[index].y - point.y);
  const reference = median(movements.map(Math.abs).filter(value => value > 4)) || 8;
  const leapThreshold = Math.max(14, reference * 1.8);
  let pitchMidi = 72;
  return [{ pitchMidi, contourShapeConfidence: 0 }, ...movements.map(movement => {
    const size = Math.abs(movement);
    if (size <= 4) return { pitchMidi, contourShapeConfidence: 0 };
    const leap = size >= leapThreshold;
    pitchMidi += Math.sign(movement) * (leap ? 5 : 2);
    const distanceFromBoundary = Math.abs(size - leapThreshold) / leapThreshold;
    return { pitchMidi, contourShapeConfidence: Math.min(1, .35 + distanceFromBoundary) };
  })];
}

export function ContourPad({ onSearch }: { onSearch: (events: ContourGesture[]) => void }) {
  const [points, setPoints] = useState<Point[]>([]);
  const [future, setFuture] = useState<Point[]>([]);
  const ref = useRef<SVGSVGElement>(null);
  const add = (event: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const point = { x: (event.clientX - rect.left) * 900 / rect.width, y: (event.clientY - rect.top) * 150 / rect.height };
    setPoints(value => [...value, point].sort((a, b) => a.x - b.x));
    setFuture([]);
  };
  const undo = () => setPoints(value => {
    if (!value.length) return value;
    setFuture(next => [value.at(-1)!, ...next]);
    return value.slice(0, -1);
  });
  const redo = () => {
    if (!future.length) return;
    setPoints(value => [...value, future[0]].sort((a, b) => a.x - b.x));
    setFuture(value => value.slice(1));
  };
  return <div className="contour-pad"><div><b>Contour sketch</b><span>S / U / D 방향은 반드시 일치하고, 확실히 큰 움직임의 step / leap 일치는 순위에 가중됩니다.</span><button disabled={!points.length} onClick={undo}>Undo</button><button disabled={!future.length} onClick={redo}>Redo</button><button onClick={() => { setPoints([]); setFuture([]); }}>Clear</button></div><svg ref={ref} viewBox="0 0 900 150" preserveAspectRatio="none" onPointerDown={add}><path d={points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')}/>{points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="5"/>)}</svg><button disabled={points.length < 4} onClick={() => onSearch(gestureContour(points))}>이 contour로 검색</button></div>;
}
