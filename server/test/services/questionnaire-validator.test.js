const questionnaireValidator = require('../../services/questionnaire-validator');
const structuredLogger = require('../../services/structured-logger');

// Mocks
jest.mock('../../services/structured-logger', () => ({
    info: jest.fn(),
    error: jest.fn()
}));

describe('QuestionnaireValidator', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('validateEnhancedSchema', () => {
        it('should validate a valid minimal questionnaire', () => {
            const validData = {
                project_overview: {
                    app_name: 'Test App'
                },
                app_structure: {
                    app_type: 'web-app'
                }
            };

            const result = questionnaireValidator.validateEnhancedSchema(validData, 'developer');

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(structuredLogger.info).toHaveBeenCalledWith('Questionnaire validation completed', expect.any(Object));
        });

        it('should fail with missing required fields', () => {
            const invalidData = {
                project_overview: {}
                // Missing app_structure
            };

            const result = questionnaireValidator.validateEnhancedSchema(invalidData, 'developer');

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Missing required section: app_structure');
            expect(result.errors).toContain('Missing required field: project_overview.app_name');
        });

        it('should validate complex structure correctly', () => {
            const complexData = {
                project_overview: {
                    app_name: 'Complex App',
                    complexity_level: 5,
                    estimated_user_count: '100-1000'
                },
                app_structure: {
                    app_type: 'e-commerce',
                    authentication_needed: true
                },
                pages: [
                    { page_name: 'Home' },
                    { page_name: 'Product' }
                ],
                user_flow: {
                    user_journey: [
                        { stage_name: 'Login', user_action: 'Click Login' }
                    ]
                }
            };

            const result = questionnaireValidator.validateEnhancedSchema(complexData, 'non-developer');

            expect(result.isValid).toBe(true);
            expect(result.completeness.score).toBeGreaterThan(0);
        });

        it('should handle validation exceptions gracefully', () => {
            // Force an error by passing null where object expected
            const result = questionnaireValidator.validateEnhancedSchema(null, 'developer');

            expect(result.isValid).toBe(false);
            // Depending on implementation, might catch and return error or fail. 
            // The implementation catches errors.
            expect(result.errors).toContain('Validation process failed');
            expect(structuredLogger.error).toHaveBeenCalled();
        });
    });

    describe('Business Logic Validation', () => {
        it('should warn if auth needed but no storage', () => {
            const data = {
                project_overview: { app_name: 'Auth App' },
                app_structure: { app_type: 'web', authentication_needed: true },
                data_flow: { user_data_storage: 'none' }
            };
            const result = questionnaireValidator.validateEnhancedSchema(data, 'developer');

            expect(result.warnings).toContain('Authentication typically requires user data storage');
        });
    });
});
