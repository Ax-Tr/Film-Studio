export const editorProtocolVersion = 1 as const;

export { default as History } from '@tiptap/extension-history';

export type EditorCommand =
  | { readonly type: 'focus-block'; readonly blockId: string }
  | { readonly type: 'set-block-type'; readonly blockId: string; readonly blockType: string }
  | { readonly type: 'request-snapshot'; readonly requestId: string };

export type EditorEvent =
  | { readonly type: 'ready'; readonly protocolVersion: number }
  | { readonly type: 'content-changed'; readonly sceneId: string; readonly revision: number }
  | { readonly type: 'snapshot'; readonly requestId: string; readonly payload: unknown };

export * from './schema';
export * from './keyboard';
export * from './composition';
export * from './navigator';
export * from './save-adapter';
export * from './virtualization';
