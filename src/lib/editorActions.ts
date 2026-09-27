import type { editor } from 'monaco-editor';
let activeEditor: editor.IStandaloneCodeEditor | null = null;
export function attachEditor(instance:editor.IStandaloneCodeEditor){activeEditor=instance;instance.onDidDispose(()=>{if(activeEditor===instance)activeEditor=null})}
export function insertSnippet(text:string):boolean{const instance=activeEditor;if(!instance||!instance.getModel())return false;const selection=instance.getSelection();if(!selection)return false;instance.executeEdits('ryven-extension',[{range:selection,text,forceMoveMarkers:true}]);instance.focus();return true}
