import { useEffect } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";

// Shown when LT / RT change the volume.
export default function VolumeHud({ level, onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, 1600);
    return () => clearTimeout(id);
  }, [onDone]);
  const Icon = level === 0 ? VolumeX : level < 50 ? Volume1 : Volume2;
  return (
    <div className="glass-strong fixed end-[3rem] top-[2.5rem] z-[95] flex items-center gap-[1rem] rounded-full px-[1.5rem] py-[0.9rem] shadow-2xl fade-up" dir="ltr">
      <Icon className="h-[1.7rem] w-[1.7rem] text-accent" />
      <div className="h-[0.5rem] w-[12rem] overflow-hidden rounded-full bg-ink/15">
        <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${level}%` }} />
      </div>
      <div className="tabular w-[3rem] text-end text-[1.15rem] font-semibold">{level}%</div>
    </div>
  );
}
