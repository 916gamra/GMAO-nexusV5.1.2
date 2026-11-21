interface ContainerBinding {
  factory: () => any;
  singleton: boolean;
  instance: any;
}

export class Container {
  static instance: Container | null = null;
  static bindings = new Map<string, ContainerBinding>();

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  /**
   * Register binding
   */
  static register(key: string, factory: any, singleton = true): void {
    const factoryFn = typeof factory === 'function' ? factory : () => factory;
    Container.bindings.set(key, {
      factory: factoryFn,
      singleton,
      instance: null,
    });
  }

  /**
   * Resolve dependency
   */
  static resolve(key: string): any {
    const binding = Container.bindings.get(key);

    if (!binding) {
      throw new Error(`Binding not found: ${key}`);
    }

    if (binding.singleton && binding.instance) {
      return binding.instance;
    }

    const instance = binding.factory();

    if (binding.singleton) {
      binding.instance = instance;
    }

    return instance;
  }
}
