/**
 * Enhanced Pattern Recognition Tests for Context Curator
 * 
 * Tests the comprehensive architectural pattern detection system
 * with confidence scoring and evidence collection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextCuratorService } from '../../../services/context-curator-service.js';
import { ConfigLoader } from '../../../../shared/config/config-loader.js';
import { LLMIntegrationService } from '../../../services/llm-integration.js';

describe('Enhanced Pattern Recognition', () => {
  let service: ContextCuratorService;
  let mockConfigLoader: ConfigLoader;
  let mockLLMService: LLMIntegrationService;

  beforeEach(() => {
    mockConfigLoader = {
      loadConfig: () => Promise.resolve({ success: true, config: {} }),
      getLLMModel: () => 'test-model'
    } as unknown as ConfigLoader;

    mockLLMService = {} as unknown as LLMIntegrationService;
    service = new ContextCuratorService(mockConfigLoader, mockLLMService);
  });

  describe('Architectural Pattern Detection', () => {
    it('should detect Layered Architecture pattern', () => {
      const codemap = `
        src/
        ├── presentation/
        │   ├── controllers/
        │   └── views/
        ├── business/
        │   ├── services/
        │   └── models/
        └── data/
            ├── repositories/
            └── entities/
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('Layered Architecture');
      expect(result.confidence['Layered Architecture']).toBeGreaterThan(0);
      expect(result.evidence['Layered Architecture']).toContain('presentation');
      expect(result.evidence['Layered Architecture']).toContain('business');
      expect(result.evidence['Layered Architecture']).toContain('data');
    });

    it('should detect Microservices Architecture pattern', () => {
      const codemap = `
        services/
        ├── user-service/
        ├── order-service/
        ├── payment-service/
        docker-compose.yml
        kubernetes/
        ├── api-gateway.yaml
        └── service-mesh.yaml
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('Microservices Architecture');
      expect(result.confidence['Microservices Architecture']).toBeGreaterThan(0);
      expect(result.evidence['Microservices Architecture']).toContain('service-');
      expect(result.evidence['Microservices Architecture']).toContain('docker');
    });

    it('should detect Event-Driven Architecture pattern', () => {
      const codemap = `
        src/
        ├── events/
        │   ├── user-events.ts
        │   └── order-events.ts
        ├── handlers/
        │   ├── event-handler.ts
        │   └── message-handler.ts
        ├── publishers/
        │   └── event-publisher.ts
        └── subscribers/
            └── event-subscriber.ts
        kafka/
        rabbitmq/
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('Event-Driven Architecture');
      expect(result.confidence['Event-Driven Architecture']).toBeGreaterThan(0);
      expect(result.evidence['Event-Driven Architecture']).toContain('event');
      expect(result.evidence['Event-Driven Architecture']).toContain('kafka');
    });

    it('should detect CQRS pattern', () => {
      const codemap = `
        src/
        ├── commands/
        │   ├── create-user-command.ts
        │   └── update-order-command.ts
        ├── queries/
        │   ├── get-user-query.ts
        │   └── list-orders-query.ts
        ├── handlers/
        │   ├── command-handler.ts
        │   └── query-handler.ts
        └── models/
            ├── read-model.ts
            └── write-model.ts
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('CQRS');
      expect(result.confidence['CQRS']).toBeGreaterThan(0);
      expect(result.evidence['CQRS']).toContain('command');
      expect(result.evidence['CQRS']).toContain('query');
    });

    it('should detect Hexagonal Architecture pattern', () => {
      const codemap = `
        src/
        ├── domain/
        │   ├── entities/
        │   └── services/
        ├── application/
        │   ├── ports/
        │   └── use-cases/
        ├── infrastructure/
        │   ├── adapters/
        │   ├── primary/
        │   └── secondary/
        └── adapters/
            ├── web/
            └── database/
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('Hexagonal Architecture');
      expect(result.confidence['Hexagonal Architecture']).toBeGreaterThan(0);
      expect(result.evidence['Hexagonal Architecture']).toContain('ports');
      expect(result.evidence['Hexagonal Architecture']).toContain('adapters');
    });

    it('should detect Clean Architecture pattern', () => {
      const codemap = `
        src/
        ├── entities/
        │   ├── user.ts
        │   └── order.ts
        ├── use-cases/
        │   ├── create-user.ts
        │   └── process-order.ts
        ├── interface-adapters/
        │   ├── controllers/
        │   ├── presenters/
        │   └── gateways/
        └── frameworks-drivers/
            ├── web/
            └── database/
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('Clean Architecture');
      expect(result.confidence['Clean Architecture']).toBeGreaterThan(0);
      expect(result.evidence['Clean Architecture']).toContain('entities');
      expect(result.evidence['Clean Architecture']).toContain('use-cases');
    });

    it('should detect MVC pattern', () => {
      const codemap = `
        src/
        ├── models/
        │   ├── user-model.ts
        │   └── order-model.ts
        ├── views/
        │   ├── user-view.tsx
        │   └── order-view.tsx
        ├── controllers/
        │   ├── user-controller.ts
        │   └── order-controller.ts
        └── mvc/
            └── base-controller.ts
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('MVC');
      expect(result.confidence['MVC']).toBeGreaterThan(0);
      expect(result.evidence['MVC']).toContain('models/');
      expect(result.evidence['MVC']).toContain('views/');
      expect(result.evidence['MVC']).toContain('controllers/');
    });

    it('should detect MVVM pattern', () => {
      const codemap = `
        src/
        ├── models/
        │   └── user-model.ts
        ├── views/
        │   └── user-view.xaml
        ├── viewmodels/
        │   └── user-viewmodel.ts
        ├── bindings/
        │   └── data-binding.ts
        └── mvvm/
            ├── observable.ts
            └── command.ts
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('MVVM');
      expect(result.confidence['MVVM']).toBeGreaterThan(0);
      expect(result.evidence['MVVM']).toContain('viewmodel');
      expect(result.evidence['MVVM']).toContain('binding');
    });
  });

  describe('Design Pattern Detection', () => {
    it('should detect Singleton pattern', () => {
      const codemap = `
        src/
        ├── singleton/
        │   └── database-connection.ts
        ├── services/
        │   └── config-service.ts // getInstance() method
        └── utils/
            └── logger.ts // static instance
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('Singleton Pattern');
      expect(result.confidence['Singleton Pattern']).toBeGreaterThan(0);
      expect(result.evidence['Singleton Pattern']).toContain('singleton');
    });

    it('should detect Factory pattern', () => {
      const codemap = `
        src/
        ├── factories/
        │   ├── user-factory.ts
        │   └── order-factory.ts
        ├── builders/
        │   └── query-builder.ts
        └── creators/
            └── service-creator.ts
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('Factory Pattern');
      expect(result.confidence['Factory Pattern']).toBeGreaterThan(0);
      expect(result.evidence['Factory Pattern']).toContain('factory');
      expect(result.evidence['Factory Pattern']).toContain('builder');
    });

    it('should detect Observer pattern', () => {
      const codemap = `
        src/
        ├── observers/
        │   └── user-observer.ts
        ├── events/
        │   ├── event-emitter.ts
        │   └── event-listener.ts
        ├── subscribers/
        │   └── notification-subscriber.ts
        └── observables/
            └── data-observable.ts
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('Observer Pattern');
      expect(result.confidence['Observer Pattern']).toBeGreaterThan(0);
      expect(result.evidence['Observer Pattern']).toContain('observer');
      expect(result.evidence['Observer Pattern']).toContain('observable');
    });

    it('should detect Repository pattern', () => {
      const codemap = `
        src/
        ├── repositories/
        │   ├── user-repository.ts
        │   ├── order-repository.ts
        │   └── base-repository.ts
        ├── interfaces/
        │   └── irepository.ts
        └── data/
            └── repository-impl.ts
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      expect(result.patterns).toContain('Repository Pattern');
      expect(result.confidence['Repository Pattern']).toBeGreaterThan(0);
      expect(result.evidence['Repository Pattern']).toContain('repository');
      expect(result.evidence['Repository Pattern']).toContain('repositories');
    });
  });

  describe('Pattern Confidence and Evidence', () => {
    it('should provide confidence scores between 0 and 1', () => {
      const codemap = `
        src/
        ├── models/
        ├── views/
        ├── controllers/
        ├── repositories/
        ├── factories/
        └── observers/
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      Object.values(result.confidence).forEach(confidence => {
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should provide evidence for detected patterns', () => {
      const codemap = `
        src/
        ├── mvc/
        ├── repositories/
        └── factories/
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      result.patterns.forEach(pattern => {
        expect(result.evidence[pattern]).toBeDefined();
        expect(Array.isArray(result.evidence[pattern])).toBe(true);
        expect(result.evidence[pattern].length).toBeGreaterThan(0);
      });
    });

    it('should handle complex codebases with multiple patterns', () => {
      const codemap = `
        microservices/
        ├── user-service/
        │   ├── controllers/
        │   ├── models/
        │   ├── views/
        │   ├── repositories/
        │   └── factories/
        ├── order-service/
        │   ├── commands/
        │   │   └── create-order-command.ts
        │   ├── queries/
        │   │   └── get-order-query.ts
        │   ├── handlers/
        │   │   ├── command-handler.ts
        │   │   └── query-handler.ts
        │   └── events/
        ├── api-gateway/
        ├── event-bus/
        └── docker-compose.yml
      `;

      const result = (service as unknown as { extractArchitecturalPatterns: (codemap: string) => { patterns: string[]; confidence: Record<string, number>; evidence: Record<string, string[]> } }).extractArchitecturalPatterns(codemap);
      
      // Should detect multiple patterns
      expect(result.patterns.length).toBeGreaterThan(3);
      expect(result.patterns).toContain('Microservices Architecture');
      expect(result.patterns).toContain('MVC');
      expect(result.patterns).toContain('CQRS');
      expect(result.patterns).toContain('Repository Pattern');
      expect(result.patterns).toContain('Factory Pattern');
    });
  });
});
