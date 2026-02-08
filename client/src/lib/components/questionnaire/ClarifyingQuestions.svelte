<script>
	import { fade, slide } from 'svelte/transition';

	export let questions = [];
	export let onSubmit = () => {};
	export let isSubmitting = false;

	let currentQuestionIndex = 0;
	let answers = {};
	let currentAnswer = '';

	$: currentQuestion = questions[currentQuestionIndex];
	$: progress = (currentQuestionIndex / questions.length) * 100;

	function handleNext() {
		if (!currentAnswer.trim()) return;

		answers[currentQuestion.id || currentQuestion.number] = currentAnswer;

		if (currentQuestionIndex < questions.length - 1) {
			currentQuestionIndex++;
			currentAnswer =
				answers[questions[currentQuestionIndex]?.id || questions[currentQuestionIndex]?.number] ||
				'';
		} else {
			onSubmit(answers);
		}
	}

	function handleKeyPress(e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleNext();
		}
	}
</script>

<div class="max-w-3xl mx-auto space-y-8" in:fade>
	<!-- Progress Bar -->
	<div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
		<div
			class="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-500"
			style="width: {progress}%"
		></div>
	</div>

	<div class="bg-slate-900/50 border border-slate-700 rounded-xl p-8 backdrop-blur-sm">
		<div class="space-y-6">
			<div class="flex items-center justify-between text-sm text-slate-400">
				<span>Question {currentQuestionIndex + 1} of {questions.length}</span>
				<span class="px-2 py-1 bg-cyan-500/10 text-cyan-400 rounded text-xs font-mono">
					CLARIFICATION NEEDED
				</span>
			</div>

			<h3 class="text-xl font-medium text-white leading-relaxed">
				{currentQuestion.text || currentQuestion.question}
			</h3>

			<div class="space-y-4">
				<textarea
					bind:value={currentAnswer}
					on:keydown={handleKeyPress}
					placeholder="Type your answer here..."
					class="w-full h-32 bg-slate-800 border border-slate-600 rounded-lg p-4 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
					disabled={isSubmitting}
				></textarea>

				<div class="flex items-center justify-between">
					<p class="text-xs text-slate-500">Press Enter to continue</p>

					<button
						on:click={handleNext}
						disabled={!currentAnswer.trim() || isSubmitting}
						class="px-6 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 text-white rounded-lg font-medium hover:from-cyan-500 hover:to-purple-500 focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
					>
						{currentQuestionIndex === questions.length - 1
							? isSubmitting
								? 'Submitting...'
								: 'Complete'
							: 'Next Question'}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
