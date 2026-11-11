import { useEffect, useState } from "react";

// Re-renders on every tick of `ms`, aligned to the wall clock.
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t;
    const tick = () => {
      setNow(new Date());
      t = setTimeout(tick, ms - (Date.now() % ms));
    };
    t = setTimeout(tick, ms - (Date.now() % ms));
    return () => clearTimeout(t);
  }, [ms]);
  return now;
}
