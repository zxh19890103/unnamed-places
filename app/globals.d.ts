declare namespace NodeJS {
  interface ProcessVersions {
    chrome: () => string;
    node: () => string;
    electron: () => string;
  }
}

declare const versions: NodeJS.ProcessVersions;

interface Window {
  versions?: typeof versions;
}
