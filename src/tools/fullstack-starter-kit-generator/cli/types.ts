export interface InitOptions {
  name: string;
  description?: string;
  template?: string;
  features?: string[];
  packages?: string[];
}

export interface PackageOptions {
  name: string;
  version: string;
  type: 'frontend' | 'backend' | 'library';
  path: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface FrontendOptions {
  name: string;
  version: string;
  language: string;
  framework: {
    name: string;
    version: string;
  };
  styling?: {
    framework: string;
    version: string;
  };
}

export interface BackendOptions {
  name: string;
  version: string;
  language: string;
  framework: {
    name: string;
    version: string;
  };
  database?: {
    type: string;
    version: string;
  };
  orm?: {
    name: string;
    version: string;
  };
}
