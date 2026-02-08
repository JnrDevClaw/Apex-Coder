const nodemailer = require('nodemailer');

// Debug: Check if nodemailer is properly loaded
if (!nodemailer || typeof nodemailer.createTransport !== 'function') {
  console.error('[EmailNotificationService] nodemailer not properly loaded:', {
    nodemailer: typeof nodemailer,
    createTransport: typeof nodemailer?.createTransport
  });
}
const { User } = require('../models');

class EmailNotificationService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.config = {
      enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
      from: process.env.EMAIL_FROM || 'noreply@aiappbuilder.com',
      service: process.env.EMAIL_SERVICE || 'gmail', // gmail, outlook, sendgrid, ses
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    };
    
    this.init();
  }

  async init() {
    if (!this.config.enabled) {
      console.log('[EmailNotificationService] Email notifications disabled');
      return;
    }

    try {
      // Create transporter based on service type
      if (this.config.service === 'ses') {
        // AWS SES configuration
        this.transporter = nodemailer.createTransport({
          SES: { 
            aws: require('@aws-sdk/client-ses'),
            region: process.env.AWS_REGION || 'us-east-1'
          }
        });
      } else if (this.config.service === 'sendgrid') {
        // SendGrid configuration
        this.transporter = nodemailer.createTransport({
          service: 'SendGrid',
          auth: {
            user: 'apikey',
            pass: this.config.auth.pass // SendGrid API key
          }
        });
      } else if (this.config.host) {
        // Custom SMTP configuration
        this.transporter = nodemailer.createTransport({
          host: this.config.host,
          port: this.config.port,
          secure: this.config.secure,
          auth: this.config.auth
        });
      } else {
        // Service-based configuration (Gmail, Outlook, etc.)
        this.transporter = nodemailer.createTransport({
          service: this.config.service,
          auth: this.config.auth
        });
      }

      // Verify connection
      if (this.transporter) {
        await this.transporter.verify();
        this.initialized = true;
        console.log('[EmailNotificationService] Email service initialized successfully');
      }
    } catch (error) {
      console.warn('[EmailNotificationService] Failed to initialize email service:', error.message);
      this.initialized = false;
    }
  }

  async sendEmail(to, subject, htmlContent, textContent = null) {
    if (!this.initialized || !this.transporter) {
      console.log('[EmailNotificationService] Email service not initialized, skipping email');
      return false;
    }

    try {
      const mailOptions = {
        from: this.config.from,
        to,
        subject,
        html: htmlContent,
        text: textContent || this.stripHtml(htmlContent)
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('[EmailNotificationService] Email sent successfully:', result.messageId);
      return true;
    } catch (error) {
      console.error('[EmailNotificationService] Failed to send email:', error);
      return false;
    }
  }

  async sendDeploymentSuccessNotification(userId, deploymentData) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) {
        console.warn('[EmailNotificationService] User not found or no email address');
        return false;
      }

      const subject = `✅ Deployment Successful - ${deploymentData.repoFullName}`;
      const htmlContent = this.generateDeploymentSuccessEmail(user, deploymentData);
      
      return await this.sendEmail(user.email, subject, htmlContent);
    } catch (error) {
      console.error('[EmailNotificationService] Failed to send deployment success notification:', error);
      return false;
    }
  }

  async sendDeploymentFailureNotification(userId, deploymentData, errorMessage = null) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) {
        console.warn('[EmailNotificationService] User not found or no email address');
        return false;
      }

      const subject = `❌ Deployment Failed - ${deploymentData.repoFullName}`;
      const htmlContent = this.generateDeploymentFailureEmail(user, deploymentData, errorMessage);
      
      return await this.sendEmail(user.email, subject, htmlContent);
    } catch (error) {
      console.error('[EmailNotificationService] Failed to send deployment failure notification:', error);
      return false;
    }
  }

  async sendDeploymentStartedNotification(userId, deploymentData) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) {
        console.warn('[EmailNotificationService] User not found or no email address');
        return false;
      }

      const subject = `🚀 Deployment Started - ${deploymentData.repoFullName}`;
      const htmlContent = this.generateDeploymentStartedEmail(user, deploymentData);
      
      return await this.sendEmail(user.email, subject, htmlContent);
    } catch (error) {
      console.error('[EmailNotificationService] Failed to send deployment started notification:', error);
      return false;
    }
  }

  async sendBuildStartedNotification(userId, buildData) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) {
        console.warn('[EmailNotificationService] User not found or no email address');
        return false;
      }

      const subject = `🔨 Build Started - ${buildData.projectName}`;
      const htmlContent = this.generateBuildStartedEmail(user, buildData);
      
      return await this.sendEmail(user.email, subject, htmlContent);
    } catch (error) {
      console.error('[EmailNotificationService] Failed to send build started notification:', error);
      return false;
    }
  }

  async sendBuildCompletedNotification(userId, buildData) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) {
        console.warn('[EmailNotificationService] User not found or no email address');
        return false;
      }

      const subject = `✅ Build Completed - ${buildData.projectName}`;
      const htmlContent = this.generateBuildCompletedEmail(user, buildData);
      
      return await this.sendEmail(user.email, subject, htmlContent);
    } catch (error) {
      console.error('[EmailNotificationService] Failed to send build completed notification:', error);
      return false;
    }
  }

  async sendBuildFailedNotification(userId, buildData, errorMessage = null) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) {
        console.warn('[EmailNotificationService] User not found or no email address');
        return false;
      }

      const subject = `❌ Build Failed - ${buildData.projectName}`;
      const htmlContent = this.generateBuildFailedEmail(user, buildData, errorMessage);
      
      return await this.sendEmail(user.email, subject, htmlContent);
    } catch (error) {
      console.error('[EmailNotificationService] Failed to send build failed notification:', error);
      return false;
    }
  }

  generateDeploymentSuccessEmail(user, deploymentData) {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const repoUrl = deploymentData.repoUrl || `https://github.com/${deploymentData.repoFullName}`;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Deployment Successful</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .success-icon { font-size: 48px; margin-bottom: 10px; }
          .details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">✅</div>
            <h1>Deployment Successful!</h1>
          </div>
          <div class="content">
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Great news! Your deployment has completed successfully.</p>
            
            <div class="details">
              <h3>Deployment Details</h3>
              <p><strong>Repository:</strong> ${deploymentData.repoFullName}</p>
              <p><strong>Commit:</strong> ${deploymentData.commitSha}</p>
              <p><strong>Deployed At:</strong> ${new Date(deploymentData.deployedAt).toLocaleString()}</p>
              <p><strong>Status:</strong> <span style="color: #28a745;">Success</span></p>
            </div>

            <div style="text-align: center;">
              <a href="${repoUrl}" class="button">View Repository</a>
              <a href="${baseUrl}/deployments" class="button">View All Deployments</a>
            </div>

            <p>Your application is now live and ready to use!</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from AI App Builder</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateDeploymentFailureEmail(user, deploymentData, errorMessage) {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const repoUrl = deploymentData.repoUrl || `https://github.com/${deploymentData.repoFullName}`;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Deployment Failed</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .error-icon { font-size: 48px; margin-bottom: 10px; }
          .details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .error-details { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="error-icon">❌</div>
            <h1>Deployment Failed</h1>
          </div>
          <div class="content">
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Unfortunately, your deployment encountered an error and could not be completed.</p>
            
            <div class="details">
              <h3>Deployment Details</h3>
              <p><strong>Repository:</strong> ${deploymentData.repoFullName}</p>
              <p><strong>Commit:</strong> ${deploymentData.commitSha}</p>
              <p><strong>Started At:</strong> ${new Date(deploymentData.createdAt).toLocaleString()}</p>
              <p><strong>Status:</strong> <span style="color: #dc3545;">Failed</span></p>
            </div>

            ${errorMessage ? `
            <div class="error-details">
              <h3>Error Details</h3>
              <p><code>${errorMessage}</code></p>
            </div>
            ` : ''}

            <div style="text-align: center;">
              <a href="${repoUrl}" class="button">View Repository</a>
              <a href="${baseUrl}/deployments" class="button">View All Deployments</a>
            </div>

            <p>Please check the repository and try deploying again. If you continue to experience issues, please contact support.</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from AI App Builder</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateDeploymentStartedEmail(user, deploymentData) {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const repoUrl = deploymentData.repoUrl || `https://github.com/${deploymentData.repoFullName}`;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Deployment Started</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #17a2b8; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .info-icon { font-size: 48px; margin-bottom: 10px; }
          .details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="info-icon">🚀</div>
            <h1>Deployment Started</h1>
          </div>
          <div class="content">
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Your deployment has been initiated and is currently in progress.</p>
            
            <div class="details">
              <h3>Deployment Details</h3>
              <p><strong>Repository:</strong> ${deploymentData.repoFullName}</p>
              <p><strong>Commit:</strong> ${deploymentData.commitSha}</p>
              <p><strong>Started At:</strong> ${new Date(deploymentData.createdAt).toLocaleString()}</p>
              <p><strong>Status:</strong> <span style="color: #17a2b8;">In Progress</span></p>
            </div>

            <div style="text-align: center;">
              <a href="${repoUrl}" class="button">View Repository</a>
              <a href="${baseUrl}/deployments" class="button">Monitor Progress</a>
            </div>

            <p>We'll notify you once the deployment is complete. This usually takes a few minutes.</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from AI App Builder</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateBuildStartedEmail(user, buildData) {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const buildUrl = `${baseUrl}/build/${buildData.buildId}`;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Build Started</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #6f42c1; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .build-icon { font-size: 48px; margin-bottom: 10px; }
          .details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .stage-list { background: #e9ecef; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .stage-item { margin: 5px 0; padding: 5px 0; border-bottom: 1px solid #dee2e6; }
          .stage-item:last-child { border-bottom: none; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="build-icon">🔨</div>
            <h1>Build Started</h1>
          </div>
          <div class="content">
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Your AI app build has been initiated and is now processing through our 8-stage pipeline.</p>
            
            <div class="details">
              <h3>Build Details</h3>
              <p><strong>Project:</strong> ${buildData.projectName}</p>
              <p><strong>Build ID:</strong> ${buildData.buildId}</p>
              <p><strong>Started At:</strong> ${new Date(buildData.startedAt).toLocaleString()}</p>
              <p><strong>Status:</strong> <span style="color: #6f42c1;">Processing</span></p>
            </div>

            <div class="stage-list">
              <h3>Pipeline Stages</h3>
              <div class="stage-item">🤖 Stage 1: AI Clarifier (HuggingFace)</div>
              <div class="stage-item">📝 Stage 2: Documentation Creator (Llama 4 Scout)</div>
              <div class="stage-item">🗄️ Stage 3: Schema Generator (DeepSeek-V3)</div>
              <div class="stage-item">📁 Stage 4: File Structure Generator (GPT-4o)</div>
              <div class="stage-item">✅ Stage 5: Validator (Claude 3.5 Haiku)</div>
              <div class="stage-item">📄 Stage 6: Empty File Creation</div>
              <div class="stage-item">💻 Stage 7: Code Generation (Gemini-3)</div>
              <div class="stage-item">🚀 Stage 8: GitHub Repository Creation</div>
            </div>

            <div style="text-align: center;">
              <a href="${buildUrl}" class="button">Monitor Build Progress</a>
            </div>

            <p>We'll notify you when each major milestone is reached. The complete build typically takes 10-20 minutes depending on project complexity.</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from AI App Builder</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateBuildCompletedEmail(user, buildData) {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const buildUrl = `${baseUrl}/build/${buildData.buildId}`;
    const repoUrl = buildData.githubRepoUrl;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Build Completed</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .success-icon { font-size: 48px; margin-bottom: 10px; }
          .details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .stats { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .stat-item { display: inline-block; margin: 5px 15px 5px 0; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 5px; }
          .button-primary { background: #28a745; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">🎉</div>
            <h1>Build Completed Successfully!</h1>
          </div>
          <div class="content">
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Fantastic news! Your AI app build has completed successfully and your application is ready.</p>
            
            <div class="details">
              <h3>Build Summary</h3>
              <p><strong>Project:</strong> ${buildData.projectName}</p>
              <p><strong>Build ID:</strong> ${buildData.buildId}</p>
              <p><strong>Started At:</strong> ${new Date(buildData.startedAt).toLocaleString()}</p>
              <p><strong>Completed At:</strong> ${new Date(buildData.completedAt).toLocaleString()}</p>
              <p><strong>Duration:</strong> ${this.formatDuration(buildData.startedAt, buildData.completedAt)}</p>
              <p><strong>Status:</strong> <span style="color: #28a745;">✅ Success</span></p>
            </div>

            <div class="stats">
              <h3>Generated Assets</h3>
              <div class="stat-item"><strong>${buildData.filesGenerated || 0}</strong> files created</div>
              <div class="stat-item"><strong>${buildData.linesOfCode || 0}</strong> lines of code</div>
              <div class="stat-item"><strong>8/8</strong> stages completed</div>
            </div>

            <div style="text-align: center;">
              ${repoUrl ? `<a href="${repoUrl}" class="button button-primary">View Repository on GitHub</a>` : ''}
              <a href="${buildUrl}" class="button">View Build Details</a>
            </div>

            <p><strong>What's Next?</strong></p>
            <ul>
              <li>Clone your repository and start customizing</li>
              <li>Review the generated code and documentation</li>
              <li>Deploy your application to your preferred platform</li>
              <li>Share your creation with the world!</li>
            </ul>

            <p>Your application is now ready for development and deployment. Happy coding! 🚀</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from AI App Builder</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateBuildFailedEmail(user, buildData, errorMessage) {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const buildUrl = `${baseUrl}/build/${buildData.buildId}`;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Build Failed</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
          .error-icon { font-size: 48px; margin-bottom: 10px; }
          .details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .error-details { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .troubleshooting { background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 4px; margin: 15px 0; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 5px; }
          .button-retry { background: #ffc107; color: #212529; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="error-icon">⚠️</div>
            <h1>Build Failed</h1>
          </div>
          <div class="content">
            <p>Hi ${user.firstName || 'there'},</p>
            <p>Unfortunately, your AI app build encountered an error and could not be completed.</p>
            
            <div class="details">
              <h3>Build Details</h3>
              <p><strong>Project:</strong> ${buildData.projectName}</p>
              <p><strong>Build ID:</strong> ${buildData.buildId}</p>
              <p><strong>Started At:</strong> ${new Date(buildData.startedAt).toLocaleString()}</p>
              <p><strong>Failed At:</strong> ${new Date(buildData.failedAt || new Date()).toLocaleString()}</p>
              <p><strong>Failed Stage:</strong> ${buildData.failedStage || 'Unknown'}</p>
              <p><strong>Status:</strong> <span style="color: #dc3545;">❌ Failed</span></p>
            </div>

            ${errorMessage ? `
            <div class="error-details">
              <h3>Error Details</h3>
              <p><code>${errorMessage}</code></p>
            </div>
            ` : ''}

            <div class="troubleshooting">
              <h3>What You Can Do</h3>
              <ul>
                <li><strong>Retry the Build:</strong> Many issues are temporary - try building again</li>
                <li><strong>Check Your Specifications:</strong> Ensure your project requirements are clear and complete</li>
                <li><strong>Review Build Logs:</strong> Check the detailed logs for more information</li>
                <li><strong>Contact Support:</strong> If the issue persists, our team can help</li>
              </ul>
            </div>

            <div style="text-align: center;">
              <a href="${buildUrl}" class="button button-retry">Retry Build</a>
              <a href="${buildUrl}" class="button">View Build Logs</a>
            </div>

            <p>Don't worry - build failures are part of the development process. Our AI models are constantly improving, and most issues can be resolved quickly.</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from AI App Builder</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  formatDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMs = end - start;
    
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

module.exports = new EmailNotificationService();