/** Immutable owner identity; never derive authorization from editable metadata. */
export const FURVISE_OWNER_ID = "bd23dda6-b423-443a-9081-89b47955ca39";
export function isFurviseOwner(user: { id?: string; is_anonymous?: boolean } | null | undefined) {
  return user?.id === FURVISE_OWNER_ID && user.is_anonymous !== true;
}
