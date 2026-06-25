import type { IncomingMessage, ServerResponse } from "node:http";

type Primitive = string | number | boolean;

type Params = {
  [k: string]: Primitive;
};

export type Handler<P extends Params = {}, S extends Params = {}> = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  url: URL,
  params: P,
  search: S
) => void;

export type WithXYZ<P extends {} = {}> = {
  x: number;
  y: number;
  z: number;
} & P;

export type GLSLModuleFetchQuery = {
  shader: string;
  chunk: boolean;
  chunkfile: string;
  vertfile: string;
  fragfile: string;
  vert: boolean;
  frag: boolean;
};

export type Route = {
  /**
   * @deprecated
   */
  route?: RegExp;
  matcher?: RegExp;
  paramsKeys?: { type: string; name: string }[];
  pathmatch?: string;
  handler: Handler;
  enabled?: boolean;
  init?: () => void;
  getParams?: (url: URL) => Params;
  _getSearch?: (url: URL) => Params;
};

export type Routes = Route[];

declare global {
  namespace __types__ {
    export { WithXYZ, Handler, Route, Routes, GLSLModuleFetchQuery };
  }
}
