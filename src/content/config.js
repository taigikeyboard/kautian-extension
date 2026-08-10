// Single source of truth for selectors / URL templates / constants
// (IMPLEMENTATION_PLAN.md §8.2)
export const CONFIG = {
  INPUT_ID: "id_tsha",
  FORM_NAME: "tshiautuann",
  LUI_ENABLED: "tai_su", // enhancement is active only in Taiwanese-word mode
  LOCALES: ["zh-hant", "und-hani"],
  DEFAULT_LOCALE: "zh-hant",
  DATA_URL: "data/kautian.min.json",
  DEBOUNCE_MS: 120,
  LIMIT: 200,
  entryHref(locale, id) {
    return `/${locale}/su/${id}/`;
  },
};
