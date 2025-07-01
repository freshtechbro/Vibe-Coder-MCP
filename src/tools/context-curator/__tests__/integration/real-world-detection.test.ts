import { describe, it, expect, beforeEach } from 'vitest';
import { ContextCuratorService } from '../../services/context-curator-service.js';
import { ContextCuratorConfig } from '../../types/context-curator-types.js';
import { ProjectTypeAnalysisResult } from '../../types/llm-tasks.js';

/**
 * Real-world codebase detection tests
 * Tests the language-agnostic detection with realistic project structures
 */
describe('Real-World Codebase Detection', () => {
  let service: ContextCuratorService;
  let config: ContextCuratorConfig;

  beforeEach(() => {
    config = {
      allowedReadDirectory: '/test',
      outputDirectory: '/test/output',
      tokenBudget: 100000,
      outputFormat: 'json',
      taskType: 'bug_fix',
      securityMode: 'strict'
    };
    service = new ContextCuratorService(config);
  });

  describe('Popular Open Source Projects', () => {
    it('should detect Next.js application correctly', () => {
      const nextjsCodemap = `
        # Next.js Application Structure
        
        ## Root Files
        - package.json
        - next.config.js
        - tsconfig.json
        - tailwind.config.js
        
        ## Source Structure
        src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx
        │   ├── globals.css
        │   └── api/
        │       └── users/
        │           └── route.ts
        ├── components/
        │   ├── ui/
        │   │   ├── button.tsx
        │   │   └── input.tsx
        │   └── layout/
        │       ├── header.tsx
        │       └── footer.tsx
        ├── lib/
        │   ├── utils.ts
        │   └── auth.ts
        └── hooks/
            └── useAuth.ts
        
        ## Dependencies
        node_modules/
        ├── next/
        ├── react/
        ├── react-dom/
        ├── typescript/
        └── tailwindcss/
      `;

      const result = (service as Record<string, unknown> & { detectProjectType: (codemap: string) => ProjectTypeAnalysisResult }).detectProjectType(nextjsCodemap);
      
      expect(result.projectType).toBe('Web Application');
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.frameworkStack).toContain('React');
      expect(result.developmentEnvironment).toContain('TypeScript');
      expect(result.developmentEnvironment).toContain('npm');
    });

    it('should detect Django REST API correctly', () => {
      const djangoCodemap = `
        # Django REST API Structure
        
        ## Root Files
        - requirements.txt
        - manage.py
        - Dockerfile
        - docker-compose.yml
        
        ## Project Structure
        myproject/
        ├── settings/
        │   ├── __init__.py
        │   ├── base.py
        │   ├── development.py
        │   └── production.py
        ├── urls.py
        └── wsgi.py
        
        ## Apps
        apps/
        ├── users/
        │   ├── models.py
        │   ├── views.py
        │   ├── serializers.py
        │   └── urls.py
        ├── api/
        │   ├── v1/
        │   │   ├── urls.py
        │   │   └── views.py
        │   └── permissions.py
        └── core/
            ├── models.py
            └── utils.py
        
        ## Dependencies
        venv/
        └── lib/
            └── python3.9/
                └── site-packages/
                    ├── django/
                    ├── djangorestframework/
                    └── psycopg2/
      `;

      const result = (service as Record<string, unknown> & { detectProjectType: (codemap: string) => ProjectTypeAnalysisResult }).detectProjectType(djangoCodemap);
      
      expect(result.projectType).toBe('Python Backend');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.frameworkStack).toContain('Django');
      expect(result.developmentEnvironment).toContain('pip');
      expect(result.developmentEnvironment).toContain('Docker');
    });

    it('should detect Flutter mobile app correctly', () => {
      const flutterCodemap = `
        # Flutter Mobile Application
        
        ## Root Files
        - pubspec.yaml
        - pubspec.lock
        - analysis_options.yaml
        
        ## Flutter Structure
        lib/
        ├── main.dart
        ├── app.dart
        ├── screens/
        │   ├── home/
        │   │   ├── home_screen.dart
        │   │   └── home_controller.dart
        │   ├── profile/
        │   │   └── profile_screen.dart
        │   └── auth/
        │       ├── login_screen.dart
        │       └── register_screen.dart
        ├── widgets/
        │   ├── common/
        │   │   ├── custom_button.dart
        │   │   └── loading_indicator.dart
        │   └── forms/
        │       └── input_field.dart
        ├── models/
        │   ├── user.dart
        │   └── api_response.dart
        ├── services/
        │   ├── api_service.dart
        │   └── auth_service.dart
        └── utils/
            ├── constants.dart
            └── helpers.dart
        
        ## Platform Specific
        android/
        ├── app/
        │   └── src/
        │       └── main/
        │           ├── AndroidManifest.xml
        │           └── kotlin/
        ios/
        ├── Runner/
        │   ├── Info.plist
        │   └── AppDelegate.swift
        └── Runner.xcodeproj/
        
        ## Tests
        test/
        ├── widget_test.dart
        └── unit/
            └── services/
                └── api_service_test.dart
      `;

      const result = (service as Record<string, unknown> & { detectProjectType: (codemap: string) => ProjectTypeAnalysisResult }).detectProjectType(flutterCodemap);
      
      expect(result.projectType).toBe('Mobile Application');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should detect Spring Boot microservice correctly', () => {
      const springBootCodemap = `
        # Spring Boot Microservice
        
        ## Root Files
        - pom.xml
        - Dockerfile
        - docker-compose.yml
        
        ## Source Structure
        src/
        ├── main/
        │   ├── java/
        │   │   └── com/
        │   │       └── example/
        │   │           └── userservice/
        │   │               ├── UserServiceApplication.java
        │   │               ├── controller/
        │   │               │   └── UserController.java
        │   │               ├── service/
        │   │               │   ├── UserService.java
        │   │               │   └── impl/
        │   │               │       └── UserServiceImpl.java
        │   │               ├── repository/
        │   │               │   └── UserRepository.java
        │   │               ├── model/
        │   │               │   └── User.java
        │   │               ├── dto/
        │   │               │   └── UserDto.java
        │   │               └── config/
        │   │                   ├── DatabaseConfig.java
        │   │                   └── SecurityConfig.java
        │   └── resources/
        │       ├── application.yml
        │       ├── application-dev.yml
        │       └── db/
        │           └── migration/
        │               └── V1__Create_user_table.sql
        └── test/
            └── java/
                └── com/
                    └── example/
                        └── userservice/
                            ├── controller/
                            │   └── UserControllerTest.java
                            └── service/
                                └── UserServiceTest.java
        
        ## Build Output
        target/
        └── classes/
      `;

      const result = (service as Record<string, unknown> & { detectProjectType: (codemap: string) => ProjectTypeAnalysisResult }).detectProjectType(springBootCodemap);
      
      expect(result.projectType).toBe('Java Backend');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.developmentEnvironment).toContain('Docker');
    });

    it('should detect Rust CLI application correctly', () => {
      const rustCodemap = `
        # Rust CLI Application
        
        ## Root Files
        - Cargo.toml
        - Cargo.lock
        - README.md
        
        ## Source Structure
        src/
        ├── main.rs
        ├── lib.rs
        ├── cli/
        │   ├── mod.rs
        │   ├── commands/
        │   │   ├── mod.rs
        │   │   ├── build.rs
        │   │   └── deploy.rs
        │   └── args.rs
        ├── core/
        │   ├── mod.rs
        │   ├── config.rs
        │   ├── error.rs
        │   └── utils.rs
        ├── services/
        │   ├── mod.rs
        │   ├── file_service.rs
        │   └── network_service.rs
        └── tests/
            ├── integration_tests.rs
            └── unit_tests.rs
        
        ## Build Output
        target/
        ├── debug/
        └── release/
      `;

      const result = (service as Record<string, unknown> & { detectProjectType: (codemap: string) => ProjectTypeAnalysisResult }).detectProjectType(rustCodemap);
      
      expect(result.projectType).toBe('Rust System Service');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Complex Multi-Language Projects', () => {
    it('should handle full-stack monorepo correctly', () => {
      const monorepoCodemap = `
        # Full-Stack Monorepo
        
        ## Root Configuration
        - package.json
        - lerna.json
        - nx.json
        - docker-compose.yml
        
        ## Frontend Applications
        apps/
        ├── web-app/
        │   ├── package.json
        │   ├── next.config.js
        │   └── src/
        │       ├── pages/
        │       └── components/
        ├── mobile-app/
        │   ├── package.json
        │   ├── metro.config.js
        │   └── src/
        │       ├── screens/
        │       └── components/
        └── admin-dashboard/
            ├── package.json
            ├── vite.config.ts
            └── src/
                ├── views/
                └── components/
        
        ## Backend Services
        services/
        ├── user-service/
        │   ├── package.json
        │   ├── Dockerfile
        │   └── src/
        │       ├── controllers/
        │       ├── services/
        │       └── models/
        ├── auth-service/
        │   ├── requirements.txt
        │   ├── Dockerfile
        │   └── src/
        │       ├── views/
        │       ├── models/
        │       └── serializers/
        └── notification-service/
            ├── go.mod
            ├── Dockerfile
            └── cmd/
                └── main.go
        
        ## Shared Libraries
        packages/
        ├── ui-components/
        │   ├── package.json
        │   └── src/
        │       └── components/
        ├── shared-types/
        │   ├── package.json
        │   └── src/
        │       └── types/
        └── utils/
            ├── package.json
            └── src/
                └── helpers/
        
        ## Infrastructure
        infrastructure/
        ├── terraform/
        │   ├── main.tf
        │   └── modules/
        ├── kubernetes/
        │   ├── deployments/
        │   └── services/
        └── docker/
            └── compose/
      `;

      const result = (service as Record<string, unknown> & { detectProjectType: (codemap: string) => ProjectTypeAnalysisResult }).detectProjectType(monorepoCodemap);
      
      expect(result.projectType).toBe('Web Application');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.secondaryTypes.length).toBeGreaterThan(1);
      expect(result.developmentEnvironment).toContain('npm');
      expect(result.developmentEnvironment).toContain('Docker');
    });
  });
});
