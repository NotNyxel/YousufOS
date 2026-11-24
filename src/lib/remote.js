// What the person is holding: the laptop version shows controller (Xbox)
// buttons; the Android TV version only mentions buttons its remote has.
import { useEffect, useState } from "react";
import { android, isAndroid, listen } from "./platform";

const PC = { android: false, name: "", color: true, channel: true, menu: true, info: false, media: true, numbers: false, gamepad: true };

function read() {
  if (!isAndroid()) return PC;
  try {
    return { android: true, ...JSON.parse(android().remote()) };
  } catch {
    return { android: true, name: "", color: false, channel: false, menu: false, info: false, media: false, numbers: false, gamepad: false };
  }
}

/** The remote's buttons ({android, color, channel, menu, info, media, gamepad…}); updates when one connects. */
export function useRemote() {
  const [r, setR] = useState(read);
  useEffect(() => {
    if (!isAndroid()) return;
    const off = listen("remote-changed", () => setR(read()));
    return () => off.then((f) => f());
  }, []);
  return r;
}

/**
 * The button that does Y's job: "Y" on a controller, "Hold OK" on a TV remote
 * (OK held down sends Y). X's job (small window) is Play/Pause on a remote.
 */
export function keyLabel(key, t) {
  if (!isAndroid()) return key.toUpperCase();
  if (key === "y") return t("Hold OK");
  if (key === "x") return t("Play/Pause");
  return key.toUpperCase();
}
