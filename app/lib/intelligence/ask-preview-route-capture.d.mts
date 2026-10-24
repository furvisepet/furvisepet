export function withAuthenticatedPreviewCapture<T>(authentication: {userId:string;supabase:unknown},action:()=>Promise<T>):Promise<T>;
