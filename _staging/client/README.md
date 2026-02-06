# AI App Builder - Demo Frontend

This is a mock frontend demonstration of the AI App Builder platform. It showcases the complete user experience from questionnaire to app deployment without requiring the full backend infrastructure.

## Features

- **Interactive Questionnaire**: Adaptive questions based on user technical level (Developer/Non-Developer)
- **Real-time Build Progress**: Simulated AI app building process with live updates
- **Mock Integrations**: Simulated GitHub and AWS connections for demonstration
- **Responsive Design**: Works on desktop and mobile devices
- **Modern UI**: Built with Svelte 5 and Tailwind CSS

## Demo Flow

1. **Landing Page** (`/`) - Introduction and feature overview
2. **Questionnaire** (`/questionnaire`) - Interactive project specification
3. **Build Process** (`/build`) - Real-time app generation simulation
4. **Build Demo** (`/build-demo`) - Standalone demo with sample project

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Deployment

This demo can be deployed to any static hosting service:

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Netlify
```bash
# Build the project
pnpm build

# Deploy the 'build' directory to Netlify
```

### AWS S3 + CloudFront
```bash
# Build the project
pnpm build

# Upload 'build' directory to S3 bucket
# Configure CloudFront distribution
```

## Project Structure

```
client/
├── src/
│   ├── lib/
│   │   ├── components/          # Reusable Svelte components
│   │   ├── stores/             # Svelte stores for state management
│   │   └── api/                # Mock backend API functions
│   ├── routes/                 # SvelteKit routes
│   │   ├── +page.svelte        # Landing page
│   │   ├── questionnaire/      # Questionnaire flow
│   │   ├── build/              # Build process page
│   │   └── build-demo/         # Standalone demo
│   ├── app.html                # HTML template
│   └── app.css                 # Global styles
├── static/                     # Static assets
├── package.json
└── README.md
```

## Key Components

### Questionnaire System
- `QuestionnaireStage.svelte` - Individual questionnaire stages
- `UserModeSelector.svelte` - Developer/Non-Developer selection
- `StageProgress.svelte` - Progress indicator
- `SpecSummary.svelte` - Final specification review

### Build Process
- `BuildProgress.svelte` - Real-time build progress display
- `mockPipeline.js` - Simulated build pipeline state management
- `mock-backend.js` - Simulated API responses

## Customization

### Branding
Update colors and styling in:
- `tailwind.config.js` - Tailwind theme configuration
- `src/app.css` - Global CSS styles

### Content
Modify text and copy in:
- `src/routes/+page.svelte` - Landing page content
- `src/lib/stores/questionnaire.js` - Questionnaire questions and options

### Build Process
Customize the simulated build stages in:
- `src/lib/stores/mockPipeline.js` - Pipeline stages and timing
- `src/lib/api/mock-backend.js` - Mock API responses

## Real Implementation Notes

This demo simulates the following real-world features:

1. **AI Questionnaire Processing**: In production, uses multiple AI models to process and enhance user inputs
2. **GitHub Integration**: Real OAuth flow and repository creation via GitHub API
3. **AWS Deployment**: Actual infrastructure provisioning and application deployment
4. **Code Generation**: AI-powered code generation using models like GPT-4, Claude, Gemini, and DeepSeek
5. **Real-time Updates**: WebSocket connections for live build progress

## Environment Variables

For real integrations (not needed for demo):

```env
# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# AWS Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1

# API Endpoints
API_BASE_URL=https://your-api-domain.com
```

## License

This demo is part of the AI App Builder project and is intended for demonstration purposes.