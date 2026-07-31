-- Do not rely on project-level default privileges: clean databases created by
-- current Supabase tooling intentionally do not grant authenticated CRUD on
-- tables created by the postgres migration role.

revoke all privileges on table
  public.dog_profiles,
  public.dog_memories,
  public.dog_product_feedback,
  public.pet_care_entries,
  public.user_profiles,
  public.ask_furvise_usage,
  public.product_ai_usage,
  public.shop_search_usage,
  public.shop_query_interpretations,
  public.product_question_usage,
  public.species,
  public.product_brands,
  public.product_categories,
  public.products,
  public.product_species,
  public.product_markets,
  public.product_variants,
  public.retailers,
  public.product_sources,
  public.product_images,
  public.ingredients,
  public.product_ingredients,
  public.product_warnings,
  public.product_directions,
  public.product_offers,
  public.product_ingestion_batches,
  public.product_ingestion_records,
  public.product_ingestion_events
from anon, authenticated;

grant select, insert, update, delete on table
  public.dog_profiles,
  public.dog_memories,
  public.dog_product_feedback,
  public.pet_care_entries
to authenticated;

grant select, insert, update on table
  public.user_profiles,
  public.ask_furvise_usage,
  public.product_ai_usage,
  public.shop_search_usage,
  public.shop_query_interpretations,
  public.product_question_usage
to authenticated;

grant select on table
  public.species,
  public.product_brands,
  public.product_categories,
  public.products,
  public.product_species,
  public.product_markets,
  public.product_variants,
  public.retailers,
  public.product_images,
  public.ingredients,
  public.product_ingredients,
  public.product_warnings,
  public.product_directions,
  public.product_offers
to authenticated;

grant all privileges on table
  public.dog_profiles,
  public.dog_memories,
  public.dog_product_feedback,
  public.pet_care_entries,
  public.user_profiles,
  public.ask_furvise_usage,
  public.product_ai_usage,
  public.shop_search_usage,
  public.shop_query_interpretations,
  public.product_question_usage,
  public.species,
  public.product_brands,
  public.product_categories,
  public.products,
  public.product_species,
  public.product_markets,
  public.product_variants,
  public.retailers,
  public.product_sources,
  public.product_images,
  public.ingredients,
  public.product_ingredients,
  public.product_warnings,
  public.product_directions,
  public.product_offers,
  public.product_ingestion_batches,
  public.product_ingestion_records,
  public.product_ingestion_events
to service_role;
