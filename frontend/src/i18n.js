import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import uk from './locales/uk.json';
import ru from './locales/ru.json';
import de from './locales/de.json';
import en from './locales/en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      uk: { translation: uk },
      ru: { translation: ru },
      de: { translation: de },
      en: { translation: en },
    },
    fallbackLng: 'uk',
    supportedLngs: ['uk', 'ru', 'de', 'en'],
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'nursia_lang',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
