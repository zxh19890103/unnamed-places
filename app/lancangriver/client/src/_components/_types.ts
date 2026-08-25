type ComponentStorySpec<P extends {}> = {
  description?: React.ReactNode;
  props?: P;
  run?: React.ComponentType<{}>;
};

export type ComponentStoryBook<P extends {} = {}> =
  | P[]
  | P
  | ComponentStorySpec<P>
  | ComponentStorySpec<P>[];
