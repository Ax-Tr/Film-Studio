export const editorProtocolVersion = 1 as const;

export type EditorCommand =
  | { readonly type: 'focus-block'; readonly blockId: string }
  | { readonly type: 'set-block-type'; readonly blockId: string; readonly blockType: string }
  | { readonly type: 'request-snapshot'; readonly requestId: string };

export type EditorEvent =
  | { readonly type: 'ready'; readonly protocolVersion: number }
  | { readonly type: 'content-changed'; readonly sceneId: string; readonly revision: number }
  | { readonly type: 'snapshot'; readonly requestId: string; readonly payload: unknown };
