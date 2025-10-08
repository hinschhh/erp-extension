// ====================================================================================
// 1) utils/actions/types.ts
// ====================================================================================
export type ActionId = string;

export interface RpcConfig<TInput = any> {
  rpcName: string;
  /** Map UI input into DB/RPC parameter names */
  mapToDbParams: (input: TInput) => Record<string, any>;
}

export interface ActionConfig<TInput = any> {
  id: ActionId;
  resource: string; // Refine resource key, used for invalidation
  rpc: RpcConfig<TInput>;
  successKey: string; // i18n key
  errorKey: string;   // i18n key
  optimisticUpdate?: (params: {
    input: TInput;
    invalidate: () => Promise<void>;
  }) => Promise<void> | void;
  canExecute?: (ctx: { record?: unknown; role?: string[] }) => boolean;
}

export type BatchResult = {
  ok: boolean;
  succeeded?: string[];
  failed?: { id: string; reason: string }[];
};