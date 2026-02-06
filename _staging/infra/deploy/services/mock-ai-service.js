/**
 * Mock AI Service
 * Provides fallback responses when real AI services are unavailable
 */

class MockAIService {
  constructor() {
    this.mockResponses = {
      guidance: {
        comprehensive: {
          clarity_assessment: "Your project concept is well-defined with clear goals and target audience. The music streaming focus provides a good foundation for development.",
          project_understanding: "This appears to be a music streaming platform focused on connecting independent artists with fans, featuring playlist creation, social sharing, and discovery features.",
          follow_up_questions: [
            "What specific music formats will you support (MP3, FLAC, streaming only)?",
            "How will artists upload and manage their content?",
            "What social features are most important for fan engagement?",
            "Do you need offline listening capabilities?"
          ],
          technical_recommendations: [
            "Use a modern web framework like React or Svelte for responsive UI",
            "Implement a robust audio streaming solution with CDN support",
            "Consider using PostgreSQL for user data and MongoDB for music metadata",
            "Implement proper authentication and user management system"
          ],
          architecture_guidance: "Consider a microservices architecture with separate services for user management, music streaming, social features, and content management. Use a CDN for audio delivery and implement proper caching strategies.",
          implementation_roadmap: [
            "Phase 1: Core user authentication and basic music upload/playback",
            "Phase 2: Playlist creation and basic social features",
            "Phase 3: Advanced discovery and recommendation features",
            "Phase 4: Mobile app and advanced social features"
          ],
          risk_analysis: "Main risks include music licensing compliance, scalable audio streaming infrastructure, and user acquisition in a competitive market. Consider starting with a niche focus.",
          success_factors: [
            "Strong focus on independent artists and unique discovery features",
            "Excellent audio quality and streaming performance",
            "Active community building and user engagement",
            "Clear monetization strategy for artists"
          ],
          next_steps: [
            "Define detailed user personas and user journeys",
            "Research music licensing requirements",
            "Create wireframes for key user interfaces",
            "Set up development environment and basic architecture"
          ],
          overall_confidence: 8
        },
        follow_up: {
          questions: [
            {
              question: "What specific features will differentiate your music platform from existing services like Spotify or SoundCloud?",
              category: "clarification",
              priority: "high",
              reasoning: "Understanding unique value proposition is crucial for success"
            },
            {
              question: "How will you handle music licensing and royalty payments to artists?",
              category: "technical",
              priority: "high",
              reasoning: "Legal compliance is essential for music platforms"
            },
            {
              question: "What's your target user acquisition strategy and marketing approach?",
              category: "business",
              priority: "medium",
              reasoning: "User growth strategy affects technical architecture decisions"
            }
          ],
          priority_questions: [
            "What specific features will differentiate your music platform?",
            "How will you handle music licensing and royalty payments?"
          ],
          guidance_notes: [
            "Consider starting with a specific niche (e.g., local artists, specific genre) to build initial traction",
            "Music licensing can be complex - research existing solutions and partnerships"
          ]
        }
      },
      technicalInference: {
        recommended_stack: {
          frontend_framework: "svelte",
          backend_framework: "node-fastify",
          database_engine: "postgres",
          package_installer: "pnpm",
          testing_library: "vitest",
          utilities: ["prettier", "eslint", "tailwind"],
          architecture_pattern: "mvc",
          environment_variables: ["DATABASE_URL", "JWT_SECRET", "MUSIC_STORAGE_URL"]
        },
        reasoning: {
          executive_summary: "Based on your project requirements for a music streaming platform, I recommend a modern, performance-focused stack that can handle audio streaming and social features effectively.",
          frontend_choice: "Svelte provides excellent performance for audio applications with minimal bundle size, crucial for mobile users.",
          backend_choice: "Fastify offers high performance for API endpoints and real-time features needed for music streaming.",
          database_choice: "PostgreSQL provides excellent support for complex queries needed for music discovery and user relationships.",
          architecture_reasoning: "MVC pattern provides clear separation of concerns while remaining simple enough for rapid development."
        },
        confidence: 0.85,
        compatibility: {
          overall_score: 9,
          framework_compatibility: "Excellent - Svelte and Fastify work well together",
          performance_rating: "High - Optimized for audio streaming applications",
          scalability_rating: "Good - Can handle growth with proper caching and CDN"
        },
        alternatives: {
          frontend_framework: {
            react: "More ecosystem support but larger bundle size",
            vue: "Good balance but smaller community for audio applications"
          },
          backend_framework: {
            "node-express": "More mature ecosystem but slower performance",
            "python-fastapi": "Excellent for AI features but Node.js better for real-time audio"
          }
        }
      },
      validation: {
        validation_status: "partial",
        critical_issues: [],
        warnings: [
          "Consider adding more detail about user authentication requirements",
          "Music licensing strategy should be defined early"
        ],
        suggestions: [
          "Add specific technical requirements for audio quality",
          "Define user roles and permissions more clearly",
          "Consider mobile-first design approach"
        ],
        consistency_analysis: "Project goals align well with described features. Technical complexity matches the ambitious scope.",
        improvement_recommendations: [
          "Add more specific success metrics and KPIs",
          "Define minimum viable product (MVP) scope",
          "Consider user onboarding and retention strategies"
        ],
        validation_score: 7
      }
    };
  }

  async generateGuidance(questionnaireData, userMode, options = {}) {
    // Simulate API delay
    await this.delay(1000 + Math.random() * 2000);

    const guidanceType = options.type || 'comprehensive';
    const mockResponse = this.mockResponses.guidance[guidanceType];

    if (!mockResponse) {
      throw new Error(`Unknown guidance type: ${guidanceType}`);
    }

    // Customize response based on project data
    const customizedResponse = this.customizeResponse(mockResponse, questionnaireData, userMode);

    return {
      success: true,
      guidance: customizedResponse,
      metadata: {
        generated_at: new Date().toISOString(),
        user_mode: userMode,
        guidance_type: guidanceType,
        engine_version: 'mock-2.0',
        is_mock: true
      }
    };
  }

  async inferTechnicalStack(projectData, options = {}) {
    // Simulate API delay
    await this.delay(1500 + Math.random() * 1500);

    const mockResponse = { ...this.mockResponses.technicalInference };

    // Customize based on project complexity and type
    const complexity = projectData.project_overview?.complexity_level || 5;
    const appType = projectData.app_structure?.app_type || 'web-app';

    // Adjust recommendations based on complexity
    if (complexity >= 8) {
      mockResponse.recommended_stack.architecture_pattern = 'microservices';
      mockResponse.recommended_stack.utilities.push('cors', 'axios');
    }

    // Adjust based on app type
    if (appType === 'mobile-first' || appType === 'pwa') {
      mockResponse.reasoning.frontend_choice += " PWA capabilities make it ideal for mobile-first applications.";
    }

    return {
      success: true,
      ...mockResponse,
      metadata: {
        generated_at: new Date().toISOString(),
        inference_version: 'mock-2.0',
        is_mock: true
      }
    };
  }

  async validateQuestionnaire(questionnaireData, userMode, validationType = 'comprehensive') {
    // Simulate API delay
    await this.delay(800 + Math.random() * 1200);

    const mockResponse = { ...this.mockResponses.validation };

    // Customize validation based on completeness
    const hasProjectName = questionnaireData.project_overview?.app_name;
    const hasDescription = questionnaireData.project_overview?.app_summary;
    const hasTechnicalStack = questionnaireData.technical_blueprint?.frontend_framework;

    if (!hasProjectName) {
      mockResponse.critical_issues.push("Project name is required");
      mockResponse.validation_status = "incomplete";
      mockResponse.validation_score = 3;
    }

    if (!hasDescription) {
      mockResponse.critical_issues.push("Project description is required");
      mockResponse.validation_score = Math.max(mockResponse.validation_score - 2, 1);
    }

    if (userMode === 'developer' && !hasTechnicalStack) {
      mockResponse.warnings.push("Technical stack should be specified for developer mode");
    }

    return {
      success: true,
      validation: mockResponse,
      guidance: userMode === 'non-developer' ? this.mockResponses.guidance.follow_up : null,
      metadata: {
        generated_at: new Date().toISOString(),
        validation_type: validationType,
        user_mode: userMode,
        is_mock: true
      }
    };
  }

  customizeResponse(baseResponse, questionnaireData, userMode) {
    const customized = { ...baseResponse };
    const projectName = questionnaireData.project_overview?.app_name || 'your application';
    const projectType = questionnaireData.project_overview?.niche || 'application';

    // Customize based on project details
    if (customized.project_understanding) {
      customized.project_understanding = customized.project_understanding.replace(
        'This appears to be',
        `${projectName} appears to be`
      );
    }

    if (customized.clarity_assessment) {
      customized.clarity_assessment = customized.clarity_assessment.replace(
        'Your project concept',
        `Your ${projectType} project concept`
      );
    }

    // Adjust recommendations based on user mode
    if (userMode === 'non-developer') {
      customized.technical_recommendations = customized.technical_recommendations?.map(rec =>
        rec.replace(/technical jargon/g, 'simple terms')
      );
    }

    return customized;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Health check method
  async healthCheck() {
    return {
      status: 'healthy',
      service: 'mock-ai-service',
      capabilities: ['guidance', 'technical-inference', 'validation'],
      is_mock: true
    };
  }
}

module.exports = MockAIService;