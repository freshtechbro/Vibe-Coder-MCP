import { z } from 'zod';
export declare const codeStubInputSchema: z.ZodObject<
  {
    language: z.ZodString;
    stubType: z.ZodEnum<['function', 'class', 'interface', 'method', 'module']>;
    name: z.ZodString;
    description: z.ZodString;
    parameters: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            name: z.ZodString;
            type: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
          },
          'strip',
          z.ZodTypeAny,
          {
            name: string;
            type?: string | undefined;
            description?: string | undefined;
          },
          {
            name: string;
            type?: string | undefined;
            description?: string | undefined;
          }
        >,
        'many'
      >
    >;
    returnType: z.ZodOptional<z.ZodString>;
    classProperties: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            name: z.ZodString;
            type: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
          },
          'strip',
          z.ZodTypeAny,
          {
            name: string;
            type?: string | undefined;
            description?: string | undefined;
          },
          {
            name: string;
            type?: string | undefined;
            description?: string | undefined;
          }
        >,
        'many'
      >
    >;
    methods: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
          },
          'strip',
          z.ZodTypeAny,
          {
            name: string;
            description?: string | undefined;
          },
          {
            name: string;
            description?: string | undefined;
          }
        >,
        'many'
      >
    >;
    contextFilePath: z.ZodOptional<z.ZodString>;
  },
  'strip',
  z.ZodTypeAny,
  {
    description: string;
    name: string;
    language: string;
    stubType: 'function' | 'class' | 'interface' | 'method' | 'module';
    parameters?:
      | {
          name: string;
          type?: string | undefined;
          description?: string | undefined;
        }[]
      | undefined;
    returnType?: string | undefined;
    classProperties?:
      | {
          name: string;
          type?: string | undefined;
          description?: string | undefined;
        }[]
      | undefined;
    methods?:
      | {
          name: string;
          description?: string | undefined;
        }[]
      | undefined;
    contextFilePath?: string | undefined;
  },
  {
    description: string;
    name: string;
    language: string;
    stubType: 'function' | 'class' | 'interface' | 'method' | 'module';
    parameters?:
      | {
          name: string;
          type?: string | undefined;
          description?: string | undefined;
        }[]
      | undefined;
    returnType?: string | undefined;
    classProperties?:
      | {
          name: string;
          type?: string | undefined;
          description?: string | undefined;
        }[]
      | undefined;
    methods?:
      | {
          name: string;
          description?: string | undefined;
        }[]
      | undefined;
    contextFilePath?: string | undefined;
  }
>;
export type CodeStubInput = z.infer<typeof codeStubInputSchema>;
