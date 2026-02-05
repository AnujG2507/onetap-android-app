// LANGUAGE SUPPORT TEMPORARILY DISABLED
// This component was used to show a loading spinner while translations loaded.
// For the English-only launch, translations are bundled and load instantly.
// Do not delete. Will be re-enabled in a future update.

export function TranslationLoader() {
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
