/**
 * Generate GitHub Actions workflow for deployment
 */
function generateDeploymentWorkflow({ 
  roleArn, 
  bucketName, 
  region, 
  buildCommand = 'pnpm install && pnpm build' 
}) {
  return `name: Deploy to AWS

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${roleArn}
          aws-region: ${region}

      - name: Build application
        run: ${buildCommand}

      - name: Deploy to S3
        run: |
          aws s3 sync ./dist s3://${bucketName} --delete
          echo "Deployed to S3: s3://${bucketName}"

      - name: Invalidate CloudFront (if exists)
        run: |
          # Optional: Add CloudFront invalidation if distribution exists
          echo "Deployment complete"
`;
}

module.exports = {
  generateDeploymentWorkflow
};
