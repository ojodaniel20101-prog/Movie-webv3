declare module 'dashjs' {
  export interface MediaPlayerClass {
    initialize(view?: HTMLMediaElement, source?: string, autoPlay?: boolean): void;
    attachView(view: HTMLMediaElement): void;
    attachSource(source: string): void;
    setAutoPlay(autoPlay: boolean): void;
    destroy(): void;
    on(event: string, callback: (...args: any[]) => void, scope?: any): void;
    off(event: string, callback: (...args: any[]) => void, scope?: any): void;
    getDebug(): any;
    getVersion(): string;
    setXHRWithCredentialsForType(type: string, value: boolean): void;
    extend(parentNameString: string, childInstance: object, override: boolean): void;
    getXHRWithCredentialsForType(type: string): boolean;
  }

  export interface MediaPlayerFactory {
    create(): MediaPlayerClass;
  }

  export const MediaPlayer: MediaPlayerFactory;

  export namespace MediaPlayer {
    export function create(): MediaPlayerClass;
  }
}
