export function capturePreviewEvidence(stage: string, value: unknown): void;
export function withPreviewCapture<T>(binding: {requestId:string;deploymentId:string;sourceSha256:string;mode?:'raw'|'semantic'}, sink:(record:Readonly<{requestId:string;deploymentId:string;sourceSha256:string;requestSha256:string|null;sequence:number;stage:string;payload:string;payloadSha256:string}>)=>void|Promise<unknown>, action:()=>T):T;

export function flushPreviewEvidence():Promise<void>;

export function captureHistoryPublication(value:unknown):void;
export function flushHistoryPublication():Promise<void>;
export function previewObservationStatus():{complete:boolean;reasons:string[];persisted:boolean}|null;
