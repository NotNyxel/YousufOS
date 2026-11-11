import { createContext, useContext } from "react";

export const NewsCtx = createContext({ items: [], bySource: {}, status: "idle" });
export const useNews = () => useContext(NewsCtx);
