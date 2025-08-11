import { error } from "console";

// src/translations/de.ts
export default {
  buttons: {
    create: "Erstellen",
    save: "Speichern",
    delete: "Löschen",
    cancel: "Abbrechen",
    edit: "Bearbeiten",
    show: "Anzeigen",
    clone: "Klonen",
    logout: "Abmelden",
  },
  pages: {
    login: {
      title: "Willkommen bei Land & Liebe",
      fields:{
        email: "E-Mail",
        password: "Passwort",
      },
      buttons:{
        rememberMe: "Angemeldet bleiben",
        noAccount: "Kein Konto?",
        forgotPassword: "Passwort vergessen?",
      },
      errors: {
        requiredEmail: "Bitte gib deine E-Mail-Adresse ein.",
        requiredPassword: "Bitte gib dein Passwort ein.",
      },
      signin: "Anmelden",
      signup: "Registrieren",
    },
    register: {
      title: "Wir freuen uns, dass du dich registrieren möchtest!",
      email: "E-Mail",
      fields: {
        password: "Passwort",
        email: "Deine E-Mail-Adresse"
      },
      buttons:{
        submit: "Registrieren",
        rememberMe: "Angemeldet bleiben",
        haveAccount: "Hast du ein Konto?",
        forgotPassword: "Passwort vergessen?",
      },
      errors: {
        requiredEmail: "Bitte gib deine E-Mail-Adresse ein.",
        requiredPassword: "Bitte gib dein Passwort ein.",
      },
      signin: "Anmelden",
      signup: "Registrieren",
    },
    forgotPassword: {
      title: "Nächstes Mal besser aufpassen! Hier gibt es Hilfe.",
      fields: {
        email: "E-Mail",
        password: "Passwort",
      },
      buttons:{
        submit: "Passwort zurücksetzen",
        rememberMe: "Angemeldet bleiben",
        haveAccount: "Hast du ein Konto?",
        forgotPassword: "Passwort vergessen?",
      },
      errors:{
        requiredEmail: "Wo sollen wir ohne Mail-Adresse die Hilfe hinschicken? Bitte eintragen.",
      },
      signin: "Anmelden",
    }
  },
  // Füge hier alle weiteren Keys hinzu, die Refine nutzt:
  // pages: { ... }, notifications: { ... }, etc.
};
