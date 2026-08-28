/// <reference types="vite/client" />
declare module '*.css';
declare module 'verovio/wasm' { const createVerovioModule: () => Promise<unknown>; export default createVerovioModule; }
declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: unknown);
    setOptions(options: Record<string, unknown>): void;
    loadData(data: string): boolean;
    renderToSVG(page: number, xmlDeclaration?: boolean): string;
  }
}
