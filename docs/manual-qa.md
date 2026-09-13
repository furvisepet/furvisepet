# Manual QA

## Supabase Test User

Use this path when local QA needs a signed-in account and the Supabase project requires email confirmation.

1. Open the Supabase dashboard for the project configured by `NEXT_PUBLIC_SUPABASE_URL`.
2. Go to Authentication > Users.
3. Create a test user with a developer-owned email address.
4. Mark the email as confirmed.
5. Set a password for the user.
6. Store the password outside the repo, such as in a local password manager.
7. Sign in locally at `http://localhost:3000/login` or `http://127.0.0.1:3000/login`.

Do not commit real credentials. Do not add service-role keys to any `NEXT_PUBLIC_*` environment variable. Do not disable production email confirmation for QA. If email confirmation is temporarily disabled in a local-only Supabase project, turn it back on before using production settings.

## Ask Furvise Rocky Recall Test

Ask Furvise interprets "last week" as the previous calendar week, Monday through Sunday. Create the first care entry with an `occurred_at` date in that previous calendar week.

Create or use this saved pet profile through the local app:

- Name: Rocky
- Species: Dog
- Age: 4
- Main concern: scratching

Add these care entries through the app UI. Valid categories for this test are Food, Symptom, and General.

| Timing | Category | Title | Detail |
| --- | --- | --- | --- |
| Previous calendar week | Food | Switched from chicken food | Scratching seemed worse after chicken-based food. |
| This week | Symptom | Licked paws after dinner | Licked paws more than usual in the evening. |
| Today | General | Ate normally | Finished dinner and drank water normally. |

Then open Ask Furvise and verify:

| Question | Expected result |
| --- | --- |
| What did I log for Rocky last week? | Mentions the previous-week Food entry with its date, category, title, and detail. |
| Summarize recent changes. | Mentions only saved facts from the profile and care entries, including the chicken food note, paw licking, and normal appetite when those rows exist in the saved data window. |
| Did Rocky vomit? | Says no saved vomiting logs were found, unless a saved vomiting entry exists. |
| What food notes do we have? | Mentions the saved Food care entry and profile food only if profile food exists. |

Record the signed-in account owner, dates used, and pass/fail result in the QA notes for the release. Do not record the password.
