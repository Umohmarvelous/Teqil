import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { pid } from "./pid";

const resources = {
  en: { translation: en },
  pid: { translation: pid },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  compatibilityJSON: "v4",
});

export default i18n;
export type Language = "en" | "pid";
