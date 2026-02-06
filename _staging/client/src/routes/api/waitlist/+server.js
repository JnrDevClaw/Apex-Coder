import { json } from '@sveltejs/kit';
import { RESEND_API_KEY } from '$env/static/private';

export async function POST({ request }) {
  try {
    const { email } = await request.json();
    
    if (!email || !email.includes('@')) {
      return json({ success: false, error: 'Invalid email' }, { status: 400 });
    }

    // Send confirmation email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'AI App Builder <noreply@cyberpunkinc.xyz>',
        to: email,
        subject: "You're on the AI App Builder waitlist!",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0A0A0C; padding: 40px; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #3AB8FF, #A46BFF); border-radius: 12px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 28px;">⚡</span>
              </div>
              <h1 style="color: #3AB8FF; margin: 0; font-size: 28px;">You're In!</h1>
            </div>
            <p style="color: #E0E0E0; font-size: 16px; line-height: 1.6;">Thanks for joining the AI App Builder waitlist.</p>
            <p style="color: #A0A0A0; font-size: 15px; line-height: 1.6;">We're building an AI-powered platform that transforms your ideas into production-ready applications — complete with GitHub repos and AWS deployment.</p>
            <div style="background: #1A1A1E; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <p style="color: #7BFFB2; margin: 0 0 10px; font-size: 14px; font-weight: 600;">WHAT YOU'LL GET:</p>
              <ul style="color: #C0C0C0; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                <li>Multi-agent AI code generation</li>
                <li>Automatic GitHub repository creation</li>
                <li>One-click AWS deployment</li>
                <li>Real-time build monitoring</li>
              </ul>
            </div>
            <p style="color: #A0A0A0; font-size: 14px;">We'll notify you the moment early access opens.</p>
            <hr style="border: none; border-top: 1px solid #2A2A2E; margin: 30px 0;" />
            <p style="color: #606060; font-size: 12px; text-align: center;">AI App Builder by CyberpunkInc</p>
          </div>
        `
      })
    });

    if (!resendResponse.ok) {
      const err = await resendResponse.text();
      console.error('Resend error:', err);
      return json({ success: false, error: 'Failed to send email' }, { status: 500 });
    }

    return json({ success: true });
  } catch (error) {
    console.error('Waitlist error:', error);
    return json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
