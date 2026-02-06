const PipelineOrchestrator = require('../../services/pipeline-orchestrator');

describe('PipelineOrchestrator - Clarifier Batch Q&A', () => {
  test('parseNumberedQuestions should extract questions correctly', () => {
    const orchestrator = new PipelineOrchestrator({});
    
    const response = `1. What authentication method should be used?
2. Which database will store user data?
3. Should the application support real-time features?
4. What is the expected user load?`;

    const questions = orchestrator.parseNumberedQuestions(response);
    
    expect(questions.length).toBe(4);
    expect(questions[0].number).toBe(1);
    expect(questions[0].text).toBe('What authentication method should be used?');
    expect(questions[3].number).toBe(4);
  });

  test('parseNumberedQuestions should handle multi-line questions', () => {
    const orchestrator = new PipelineOrchestrator({});
    
    const response = `1. What authentication method should be used?
   Please specify JWT, OAuth, or session-based.
2. Which database will store user data?`;

    const questions = orchestrator.parseNumberedQuestions(response);
    
    expect(questions.length).toBe(2);
    expect(questions[0].text).toContain('authentication');
  });

  test('formatBatchAnswers should format answers correctly', () => {
    const orchestrator = new PipelineOrchestrator({});
    
    const answers = [
      { number: 1, question: 'Q1?', answer: 'Answer 1' },
      { number: 2, question: 'Q2?', answer: 'Answer 2' },
      { number: 3, question: 'Q3?', answer: 'Answer 3' }
    ];

    const formatted = orchestrator.formatBatchAnswers(answers);
    
    expect(formatted).toContain('1: Answer 1');
    expect(formatted).toContain('2: Answer 2');
    expect(formatted).toContain('3: Answer 3');
  });

  test('generateBatchAnswers should generate answers for all questions', () => {
    const orchestrator = new PipelineOrchestrator({});
    
    const questions = [
      { number: 1, text: 'What authentication method?' },
      { number: 2, text: 'Which database?' }
    ];
    
    const specs = { projectName: 'Test Project' };
    
    const answers = orchestrator.generateBatchAnswers(questions, specs);
    
    expect(answers.length).toBe(2);
    expect(answers[0].number).toBe(1);
    expect(answers[0].answer).toBeTruthy();
    expect(answers[1].number).toBe(2);
    expect(answers[1].answer).toBeTruthy();
  });

  test('updateSpecsFromBatchAnswers should update specs with all answers', () => {
    const orchestrator = new PipelineOrchestrator({});
    
    const specs = { projectName: 'Test Project' };
    const questions = [
      { number: 1, text: 'What authentication method should be used?' },
      { number: 2, text: 'Which database will store user data?' }
    ];
    const answers = [
      { number: 1, question: questions[0].text, answer: 'JWT authentication' },
      { number: 2, question: questions[1].text, answer: 'DynamoDB' }
    ];

    const updated = orchestrator.updateSpecsFromBatchAnswers(specs, questions, answers);
    
    expect(updated._clarifications).toBeDefined();
    expect(updated._clarifications.length).toBeGreaterThanOrEqual(1);
    
    // Find the batch clarification entry
    const batchClarification = updated._clarifications.find(c => c.type === 'batch');
    expect(batchClarification).toBeDefined();
    expect(batchClarification.questionCount).toBe(2);
  });

  test('parseNumberedQuestions should handle empty response', () => {
    const orchestrator = new PipelineOrchestrator({});
    
    const response = '';
    const questions = orchestrator.parseNumberedQuestions(response);
    
    expect(questions.length).toBe(0);
  });

  test('parseNumberedQuestions should handle SPECIFICATION_COMPLETE', () => {
    const orchestrator = new PipelineOrchestrator({});
    
    const response = 'SPECIFICATION_COMPLETE';
    const questions = orchestrator.parseNumberedQuestions(response);
    
    expect(questions.length).toBe(0);
  });
});
