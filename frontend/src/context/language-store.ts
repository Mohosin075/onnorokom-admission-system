import { createContext, useContext } from "react";
import { bangla } from "./translations";

export type Language = "en" | "bn";
type Values = Record<string, string | number>;
export function translator(language: Language) {
  const numbers = new Intl.NumberFormat(language === "bn" ? "bn-BD" : "en-US");
  return (message: string, values: Values = {}) => {
    const translated =
      language === "bn" ? (bangla[message] ?? message) : message;
    return translated.replace(/\{(\w+)\}/g, (token, key: string) => {
      const value = values[key];
      if (value === undefined) return token;
      return typeof value === "number" ? numbers.format(value) : value;
    });
  };
}
export const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  t: ReturnType<typeof translator>;
}>({ language: "en", setLanguage: () => {}, t: translator("en") });

export function useLanguage() {
  return useContext(LanguageContext);
}
