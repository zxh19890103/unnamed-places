import type { IncomingMessage, ServerResponse } from "node:http";

type Params = {
  [k: string]: string | number | boolean;
};

type Primitive = string | number | boolean;

export type Handler<P extends Params = {}> = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  url: URL,
  params: P
) => void;

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
};

export type Routes = Route[];
