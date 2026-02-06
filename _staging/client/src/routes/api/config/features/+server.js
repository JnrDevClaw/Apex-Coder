import { json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	return json({
		enhancedProcessing: false,
		aiGuidance: false,
		technicalInference: false,
		contextualHelp: false
	});
}
