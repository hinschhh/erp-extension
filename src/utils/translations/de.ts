// src/utils/translations/de.ts
const translationsDe = {
  buttons: {
    create: "Erstellen",
    save: "Speichern",
    delete: "Löschen",
    cancel: "Abbrechen",
    edit: "Bearbeiten",
    show: "Anzeigen",
    clone: "Klonen",
    logout: "Abmelden",
    login: "Anmelden",
    register: "Registrieren",
    resetPassword: "Passwort zurücksetzen",
  },
  notifications: {
    created: "Eintrag erfolgreich erstellt",
    updated: "Änderungen gespeichert",
    deleted: "Eintrag gelöscht",
    error: "Es ist ein Fehler aufgetreten",
  },
  errors: {
    required: "Pflichtfeld darf nicht leer sein",
    invalidEmail: "Bitte eine gültige E-Mail-Adresse eingeben",
    passwordTooShort: "Das Passwort muss mindestens 8 Zeichen lang sein",
    unknown: "Ein unbekannter Fehler ist aufgetreten",
  },
  pages: {
    login: {
      title: "Willkommen bei Land & Liebe",
      fields: {
        email: "E-Mail",
        password: "Passwort",
      },
      buttons: {
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
      fields: {
        email: "Deine E-Mail-Adresse",
        password: "Passwort",
      },
      buttons: {
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
      },
      buttons: {
        submit: "Passwort zurücksetzen",
        haveAccount: "Hast du ein Konto?",
        backToLogin: "Zurück zum Login",
      },
      errors: {
        requiredEmail:
          "Wo sollen wir ohne Mail-Adresse die Hilfe hinschicken? Bitte eintragen.",
      },
      signin: "Anmelden",
    },
  },
  labels: {
    email: "E-Mail",
    password: "Passwort",
    rememberMe: "Angemeldet bleiben",
    account: "Konto",
  },
};

export default translationsDe;
