/* Mediawo OS – Verbindung zur Datenbank.
   Der publishable key ist öffentlich und darf im Code stehen.
   Den secret / service_role key NIE hier eintragen. */
window.MW_CONFIG = {
  supabaseUrl: 'https://wwdvilmzkprvzhjflruo.supabase.co',
  supabaseKey: 'sb_publishable_Aaww0dI08A1SvOxOkayTiQ_NGjhuZaF',
  appName: 'Mediawo OS',
  /* Grenzen der Kleinunternehmerregelung (§ 19 UStG, seit 2025) */
  grenzeVorjahr: 25000,
  grenzeLaufend: 100000
};
