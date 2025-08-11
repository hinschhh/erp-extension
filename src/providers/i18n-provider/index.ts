"use client";
// src/i18nProvider.ts
import type { I18nProvider } from "@refinedev/core";
import de from "../../utils/translations/de";

const i18nProvider: I18nProvider = {
  translate: (
    key: string,
    _options?: Record<string, any>,
    defaultMessage?: string
  ): string => {
    const keys = key.split(".");
    let result: any = de;
    for (const k of keys) {
      result = result?.[k];
      if (result === undefined) break;
    }
    if (typeof result === "string") {
      return result;
    }
    return defaultMessage ?? key;
  },
  changeLocale: async (_lang: string): Promise<void> => {
    // Nur Deutsch benötigt => kein Wechsel
    return;
  },
  getLocale: (): string => {
    return "de";
  },
};

export default i18nProvider;
