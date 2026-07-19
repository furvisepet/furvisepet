import { AppPage } from "../components/app-page";

export default function PrivacyPage() {
  return (
    <AppPage>
      <section className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-[var(--pw-heading)]">Privacy</h1>
        <div className="mt-6 grid gap-5 leading-7 text-[var(--pw-muted)]">
          <p>
            Furvise stores the account and pet care details you choose to save so your care history,
            product feedback, and guidance context stay connected to your signed-in account.
          </p>
          <p>
            We detect your approximate country to show relevant regional product suggestions. You can
            change this anytime in account settings.
          </p>
          <p>
            Furvise does not use browser geolocation permission for product country detection.
          </p>
        </div>
      </section>
    </AppPage>
  );
}
