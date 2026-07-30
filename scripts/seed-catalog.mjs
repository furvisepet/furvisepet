import { createClient } from "@supabase/supabase-js";
import { seedCuratedCatalog } from "../app/lib/catalog/seed.ts";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serverKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serverKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required to seed the catalog.");
}

const supabase = createClient(url, serverKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const result = await seedCuratedCatalog(supabase);
process.stdout.write(`Seeded ${result.products} curated products, ${result.brands} brands, and ${result.retailers} retailers.\n`);
