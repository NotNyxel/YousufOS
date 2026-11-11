import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../lib/settings-store";

// A photo sent from a phone (admin panel → Watch → Photo). Any key closes it.
export default function CastPhoto({ src, onClose }) {
  const { t } = useI18n();
  useEffect(() => {
    const close = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    const id = setTimeout(onClose, 5 * 60000);
    const arm = setTimeout(() => window.addEventListener("keydown", close, true), 400);
    return () => {
      clearTimeout(id);
      clearTimeout(arm);
      window.removeEventListener("keydown", close, true);
    };
  }, [src, onClose]);
  return createPortal(
    <div data-nav-scope className="fixed inset-0 z-[97] flex items-center justify-center bg-black fade-up">
      <img src={src} alt="" className="max-h-full max-w-full object-contain" />
      <div className="absolute bottom-[2rem] start-1/2 -translate-x-1/2 rounded-full bg-black/60 px-[1.4rem] py-[0.5rem] text-[1.05rem] text-white/80 rtl:translate-x-1/2">
        {t("From your phone · any button closes")}
      </div>
    </div>,
    document.body,
  );
}
