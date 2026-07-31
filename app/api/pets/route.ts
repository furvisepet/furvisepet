import { saveProfile } from "../../lib/pet-profile-api-server";

export async function POST(request: Request) {
  return saveProfile(request, null);
}
