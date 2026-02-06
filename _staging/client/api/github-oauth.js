/**
 * GitHub OAuth Handler - Vercel Serverless Function
 * Handles GitHub OAuth flow for real GitHub integration
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { method, query, body } = req;

  try {
    if (method === 'GET' && query.action === 'login') {
      // Step 1: Redirect to GitHub OAuth
      const clientId = process.env.GITHUB_CLIENT_ID;
      const redirectUri = `${process.env.VERCEL_URL || 'http://localhost:5173'}/api/github-oauth?action=callback`;
      const scope = 'repo,user:email';
      const state = Math.random().toString(36).substring(2, 15);

      if (!clientId) {
        return res.status(500).json({ 
          error: 'GitHub OAuth not configured',
          message: 'GITHUB_CLIENT_ID environment variable is missing'
        });
      }

      const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
      
      res.redirect(302, githubAuthUrl);
      return;
    }

    if (method === 'GET' && query.action === 'callback') {
      // Step 2: Handle OAuth callback
      const { code, state } = query;
      
      if (!code) {
        return res.status(400).json({ error: 'Authorization code missing' });
      }

      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code: code,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        return res.status(400).json({ error: tokenData.error_description });
      }

      // Get user information
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${tokenData.access_token}`,
          'User-Agent': 'AI-App-Builder-Demo',
        },
      });

      const userData = await userResponse.json();

      // Return success page with user data
      const successHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>GitHub Connected</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center; }
            .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
            .user-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .avatar { width: 64px; height: 64px; border-radius: 50%; margin-bottom: 10px; }
            button { background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; }
            button:hover { background: #0056b3; }
          </style>
        </head>
        <body>
          <div class="success">✅ GitHub Connected Successfully!</div>
          <div class="user-info">
            <img src="${userData.avatar_url}" alt="Avatar" class="avatar" />
            <h3>${userData.name || userData.login}</h3>
            <p>@${userData.login}</p>
            <p>${userData.public_repos} public repositories</p>
          </div>
          <button onclick="window.close()">Close Window</button>
          <script>
            // Send success message to parent window
            if (window.opener) {
              window.opener.postMessage({
                type: 'github-oauth-success',
                user: {
                  username: '${userData.login}',
                  name: '${userData.name || userData.login}',
                  avatar: '${userData.avatar_url}',
                  publicRepos: ${userData.public_repos}
                },
                token: '${tokenData.access_token}'
              }, '*');
            }
            
            // Auto-close after 3 seconds
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'text/html');
      res.status(200).send(successHtml);
      return;
    }

    if (method === 'POST' && query.action === 'create-repo') {
      // Create a new repository
      const { name, description, isPrivate = false } = body;
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({ error: 'GitHub token required' });
      }

      const repoResponse = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'AI-App-Builder-Demo',
        },
        body: JSON.stringify({
          name: name,
          description: description || 'Generated by AI App Builder',
          private: isPrivate,
          auto_init: true,
          gitignore_template: 'Node',
          license_template: 'mit'
        }),
      });

      const repoData = await repoResponse.json();

      if (!repoResponse.ok) {
        return res.status(repoResponse.status).json({ 
          error: repoData.message || 'Failed to create repository' 
        });
      }

      res.status(201).json({
        success: true,
        repository: {
          name: repoData.name,
          fullName: repoData.full_name,
          url: repoData.html_url,
          cloneUrl: repoData.clone_url,
          defaultBranch: repoData.default_branch
        }
      });
      return;
    }

    res.status(404).json({ error: 'Endpoint not found' });
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}